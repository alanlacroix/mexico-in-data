// A deterministic release gate for the exact static artifact Cloudflare Pages serves.
// It does not call the network. Run only after a clean Eleventy build.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { checkInlineScriptsInHtml } from './lib/inline-script-check.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '_data/releaseManifest.json'), 'utf8'));
const OUTPUT = path.join(ROOT, manifest.outputDir);
const failures = [];
const notes = [];

const allRoutes = [
  ...manifest.publicRoutes.map((item) => ({ ...item, kind: 'public' })),
  ...manifest.compatibilityRoutes.map((item) => ({ ...item, kind: 'compatibility' })),
  ...manifest.previewRoutes.map((item) => ({ ...item, kind: 'preview' })),
];
const functionRoutes = manifest.functionRoutes || [];
const allowedFunctions = new Set(functionRoutes.map((item) => item.route));
const redirectRoutes = new Map((manifest.redirectRoutes || []).map((item) => [item.route, item.target]));

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const value = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(value) : [value];
  });
}

const relative = (file) => path.relative(OUTPUT, file).split(path.sep).join('/');
const readOutput = (file) => fs.readFileSync(path.join(OUTPUT, file), 'utf8');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (!fs.existsSync(OUTPUT)) failures.push(`${manifest.outputDir}/ is missing; run the clean Eleventy build first`);

// 1. The artifact is an exact, classified set of HTML routes. A forgotten page
// cannot quietly become public merely because a template was added to the repo.
const expectedHtml = new Set(allRoutes.map((item) => item.file));
const actualHtml = new Set(walk(OUTPUT).filter((file) => file.endsWith('.html')).map(relative));
for (const file of expectedHtml) if (!actualHtml.has(file)) failures.push(`required route output is missing: ${file}`);
for (const file of actualHtml) if (!expectedHtml.has(file)) failures.push(`unclassified HTML entered the artifact: ${file}`);
for (const file of manifest.requiredFiles || []) {
  if (!fs.existsSync(path.join(OUTPUT, file))) failures.push(`required release file is missing: ${file}`);
}

// Every executable inline script is parsed from the built HTML. Template-level
// checks can miss declarations that only collide after includes are assembled.
// External scripts and non-JavaScript data blocks (JSON-LD, import maps, etc.)
// are deliberately outside this guard.
let inlineScriptsChecked = 0;
for (const file of actualHtml) {
  const result = checkInlineScriptsInHtml(readOutput(file));
  inlineScriptsChecked += result.checked;
  for (const failure of result.failures) {
    failures.push(`${file}: inline script #${failure.tagIndex} (${failure.mode}) has invalid JavaScript at HTML line ${failure.htmlLine}: ${failure.message}`);
  }
}

// Source-only paths must never occur inside the Pages output directory.
for (const forbidden of manifest.sourceExclusions || []) {
  const clean = forbidden.replace(/\*.*$/, '').replace(/\/$/, '');
  if (clean && fs.existsSync(path.join(OUTPUT, clean))) failures.push(`source-only path leaked into the artifact: ${clean}`);
}

// 2. Public pages need a complete search/share identity and exactly one production
// canonical. Preview pages need both HTML noindex and a Cloudflare header backstop.
const headersText = fs.existsSync(path.join(OUTPUT, '_headers')) ? readOutput('_headers') : '';
const headerRules = new Map();
let currentHeaderPath = '';
for (const line of headersText.split(/\r?\n/)) {
  if (/^\/[^\s]*\s*$/.test(line)) {
    currentHeaderPath = line.trim();
    headerRules.set(currentHeaderPath, []);
  } else if (currentHeaderPath && /^\s+\S/.test(line)) {
    headerRules.get(currentHeaderPath).push(line.trim());
  } else if (line.trim() && !line.trim().startsWith('#')) {
    currentHeaderPath = '';
  }
}

const redirectsText = fs.existsSync(path.join(OUTPUT, '_redirects')) ? readOutput('_redirects') : '';
const redirectRules = redirectsText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
  const [from, to, status] = line.split(/\s+/);
  return { from, to, status };
});
const globalHeaders = headerRules.get('/*') || [];
for (const required of ['X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Strict-Transport-Security: max-age=31536000']) {
  if (!globalHeaders.includes(required)) failures.push(`_headers is missing global security header: ${required}`);
}
for (const [from, to] of redirectRoutes) {
  const rule = redirectRules.find((item) => item.from === from);
  if (!rule || rule.to !== to || rule.status !== '301') failures.push(`_redirects must contain: ${from} ${to} 301`);
}
for (const rule of redirectRules) {
  if (!redirectRoutes.has(rule.from)) failures.push(`unclassified redirect entered _redirects: ${rule.from}`);
}
const redirectTargets = new Set(manifest.publicRoutes.flatMap((item) => [item.route, item.canonical]).filter(Boolean));
for (const [from, to] of redirectRoutes) {
  if (!redirectTargets.has(to)) failures.push(`${from}: redirect target is not a canonical public route: ${to}`);
}

for (const item of manifest.publicRoutes) {
  if (!actualHtml.has(item.file)) continue;
  const html = readOutput(item.file);
  if (!/<title>[^<]+<\/title>/i.test(html)) failures.push(`${item.file}: missing non-empty title`);
  if (!/<meta\s+name="description"\s+content="[^"]+"\s*\/?>/i.test(html)) failures.push(`${item.file}: missing non-empty meta description`);
  if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) failures.push(`${item.file}: a public route is noindex`);
  const canonicals = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?>/gi)].map((match) => match[1]);
  const expected = manifest.siteUrl + item.canonical;
  if (canonicals.length !== 1 || canonicals[0] !== expected) failures.push(`${item.file}: canonical must be exactly ${expected}`);
}

for (const item of manifest.previewRoutes) {
  if (!actualHtml.has(item.file)) continue;
  const html = readOutput(item.file);
  if (item.metaNoindex && !/<meta\s+name="robots"\s+content="[^"]*noindex[^\"]*"\s*\/?>/i.test(html)) {
    failures.push(`${item.file}: preview is missing an HTML noindex directive`);
  }
  const rules = headerRules.get(item.route) || [];
  if (!rules.some((rule) => /^X-Robots-Tag:\s*noindex(?:,|\b)/i.test(rule))) {
    failures.push(`${item.route}: preview is missing the Cloudflare X-Robots-Tag noindex backstop`);
  }
}

// Cloudflare Pages serves 404.html for unknown static routes. Keep it out of
// search results; without this file, Pages falls back to the homepage and a
// mistyped URL can look like a successful response.
if (actualHtml.has('404.html')) {
  const html = readOutput('404.html');
  if (!/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) failures.push('404.html: error page must be noindex');
}

// Any future file named as a mockup is automatically covered, even before it is
// deliberately added to the manifest.
for (const file of actualHtml) {
  if (!/mockup/i.test(file)) continue;
  const html = readOutput(file);
  if (!/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) failures.push(`${file}: mockup must be noindex`);
  const route = '/' + file;
  const rules = headerRules.get(route) || [];
  if (!rules.some((rule) => /^X-Robots-Tag:\s*noindex(?:,|\b)/i.test(rule))) failures.push(`${file}: mockup needs an X-Robots-Tag rule in _headers`);
}

// 3. Navigation is a production interface, not a lab index.
const navSource = fs.readFileSync(path.join(ROOT, '_data/nav.js'), 'utf8');
if (/mockup|localhost|127\.0\.0\.1|file:\/\//i.test(navSource)) failures.push('_data/nav.js contains a preview or local-only reference');
const nav = require(path.join(ROOT, '_data/nav.js'));
function navLinks(items) {
  return items.flatMap((item) => item.href ? [item.href] : (item.menu || []).flatMap((group) => navLinks(group.links || [])));
}
const classifiedRoutes = new Set([
  ...[...manifest.publicRoutes, ...manifest.compatibilityRoutes].map((item) => item.route),
  ...redirectRoutes.keys(),
]);
for (const href of navLinks(nav)) {
  if (!classifiedRoutes.has(href)) failures.push(`navigation target is not a classified production route: ${href}`);
}

for (const item of manifest.publicRoutes) {
  if (!actualHtml.has(item.file)) continue;
  const html = readOutput(item.file);
  const masthead = html.match(/<header\b[\s\S]*?<\/header>/i)?.[0] || '';
  if (/mockup|localhost|127\.0\.0\.1|file:\/\//i.test(masthead)) failures.push(`${item.file}: production masthead contains a preview/local reference`);
}

// 4. Every internal href/src/action on a production or compatibility page must
// resolve inside the artifact, or be an explicitly declared Pages Function route.
function candidatesFor(pathname) {
  const clean = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!clean) return ['index.html'];
  if (pathname.endsWith('/')) return [path.join(clean, 'index.html')];
  if (path.extname(clean)) return [clean];
  return [`${clean}.html`, path.join(clean, 'index.html')];
}
function resolves(pathname) {
  if (redirectRoutes.has(pathname)) return true;
  return candidatesFor(pathname).some((candidate) => fs.existsSync(path.join(OUTPUT, candidate)));
}

for (const item of [...manifest.publicRoutes, ...manifest.compatibilityRoutes]) {
  if (!actualHtml.has(item.file)) continue;
  const html = readOutput(item.file);
  const attributes = [...html.matchAll(/\b(?:href|src|action)\s*=\s*["']([^"'<>]+)["']/gi)].map((match) => match[1].trim());
  for (const value of attributes) {
    if (!value || value.includes('${') || value.startsWith('#') || /^(?:mailto:|tel:|data:|javascript:)/i.test(value)) continue;
    let target;
    try { target = new URL(value, `${manifest.siteUrl}${item.route}`); }
    catch { failures.push(`${item.file}: malformed link ${value}`); continue; }
    if (target.origin !== manifest.siteUrl) continue;
    if (allowedFunctions.has(target.pathname)) continue;
    if (!resolves(target.pathname)) failures.push(`${item.file}: internal target does not exist: ${value}`);
  }
}

// 5. No developer-machine URL, filesystem path, or recognizable credential may
// be embedded in any text file that ships. If a known secret is present in the
// environment, check its literal value too.
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.geojson', '.topojson', '.xml', '.txt', '']);
const publicTextFiles = walk(OUTPUT).filter((file) => textExtensions.has(path.extname(file)));
const forbiddenText = [
  { label: 'localhost URL', re: /(?:https?:\/\/)?localhost(?::\d+)?/i },
  { label: 'loopback URL', re: /(?:https?:\/\/)?127\.0\.0\.1(?::\d+)?/i },
  { label: 'file URL', re: /file:\/\//i },
  { label: 'local macOS path', re: /\/(?:Users|var\/folders)\/[A-Za-z0-9._-]+\// },
  { label: 'Anthropic key', re: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { label: 'Stripe secret key', re: /sk_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { label: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { label: 'Google API key', re: /AIza[0-9A-Za-z_-]{30,}/ },
  { label: 'Slack token', re: /xox[baprs]-[0-9A-Za-z-]{16,}/ },
  { label: 'JWT', re: /eyJhbGciOi[A-Za-z0-9._-]{24,}/ },
];
const secretNames = [
  'ANTHROPIC_API_KEY', 'BANXICO_TOKEN', 'INEGI_TOKEN', 'FRED_API_KEY', 'CENSUS_API_KEY',
  'SUPABASE_SERVICE_KEY', 'BEEHIIV_API_KEY', 'BEEHIIV_PUB_ID',
];
const liveSecrets = secretNames.map((name) => ({ name, value: process.env[name] })).filter((item) => item.value && item.value.length >= 12);
for (const file of publicTextFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const item of forbiddenText) if (item.re.test(content)) failures.push(`${relative(file)}: contains ${item.label}`);
  for (const secret of liveSecrets) if (content.includes(secret.value)) failures.push(`${relative(file)}: contains the value of ${secret.name}`);
}
for (const item of functionRoutes) {
  const file = path.join(ROOT, item.source);
  if (!fs.existsSync(file)) { failures.push(`${item.route}: Pages Function source is missing: ${item.source}`); continue; }
  const content = fs.readFileSync(file, 'utf8');
  for (const method of item.methods || []) {
    if (!new RegExp(`export\\s+async\\s+function\\s+onRequest${method[0]}${method.slice(1).toLowerCase()}\\b`).test(content)) {
      failures.push(`${item.source}: missing ${method} handler for ${item.route}`);
    }
  }
  for (const pattern of forbiddenText) if (pattern.re.test(content)) failures.push(`${item.source}: contains ${pattern.label}`);
  for (const secret of liveSecrets) if (content.includes(secret.value)) failures.push(`${item.source}: contains the value of ${secret.name}`);
}

// 6. Sitemap contains every canonical public URL exactly once and no preview URL.
if (fs.existsSync(path.join(OUTPUT, 'sitemap.xml'))) {
  const sitemap = readOutput('sitemap.xml');
  for (const item of manifest.publicRoutes) {
    const url = manifest.siteUrl + item.canonical;
    const count = (sitemap.match(new RegExp(`<loc>${escapeRegExp(url)}</loc>`, 'g')) || []).length;
    if (count !== 1) failures.push(`sitemap.xml must contain ${url} exactly once (found ${count})`);
  }
  for (const item of manifest.previewRoutes) if (sitemap.includes(item.route)) failures.push(`sitemap.xml contains preview route ${item.route}`);
}
if (fs.existsSync(path.join(OUTPUT, 'robots.txt'))) {
  const robots = readOutput('robots.txt');
  if (!robots.includes(`Sitemap: ${manifest.siteUrl}/sitemap.xml`)) failures.push('robots.txt is missing the production sitemap URL');
}

// 7. Exercise the exact declared routes through a real local HTTP boundary. This
// catches path/encoding mistakes that a direct fs.existsSync check can miss.
async function smokeRoutes() {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://release.local').pathname;
    const file = candidatesFor(pathname).find((candidate) => fs.existsSync(path.join(OUTPUT, candidate)));
    if (!file) { response.writeHead(404); response.end('not found'); return; }
    const ext = path.extname(file);
    const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.xml' ? 'application/xml' : ext === '.txt' ? 'text/plain; charset=utf-8' : 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type });
    response.end(fs.readFileSync(path.join(OUTPUT, file)));
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()));
  const { port } = server.address();
  try {
    for (const item of allRoutes) {
      const response = await fetch(`http://127.0.0.1:${port}${item.route}`);
      if (response.status !== 200) failures.push(`${item.route}: local HTTP smoke returned ${response.status}`);
      if (item.file.endsWith('.html') && !String(response.headers.get('content-type')).startsWith('text/html')) failures.push(`${item.route}: local HTTP smoke returned the wrong content type`);
    }
    for (const item of manifest.publicRoutes) {
      if (!item.canonical || item.canonical === item.route) continue;
      const response = await fetch(`http://127.0.0.1:${port}${item.canonical}`);
      if (response.status !== 200) failures.push(`${item.canonical}: canonical-route smoke returned ${response.status}`);
      if (!String(response.headers.get('content-type')).startsWith('text/html')) failures.push(`${item.canonical}: canonical-route smoke returned the wrong content type`);
    }
    for (const route of ['/robots.txt', '/sitemap.xml']) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`);
      if (response.status !== 200) failures.push(`${route}: local HTTP smoke returned ${response.status}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

await smokeRoutes();

notes.push(`${manifest.publicRoutes.length} public routes`);
notes.push(`${manifest.compatibilityRoutes.length} compatibility routes`);
notes.push(`${manifest.previewRoutes.length} isolated previews`);
notes.push(`${functionRoutes.length} Pages Function route`);
notes.push(`${inlineScriptsChecked} inline scripts parsed`);
notes.push(`${publicTextFiles.length} artifact files scanned`);

if (failures.length) {
  for (const failure of [...new Set(failures)]) console.error(`  FAIL ${failure}`);
  console.error(`\nrelease-check: ${new Set(failures).size} failure(s); publication blocked.`);
  process.exit(1);
}
console.log(`release-check: ok (${notes.join(' · ')}).`);
