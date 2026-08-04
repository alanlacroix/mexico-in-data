// prerender-topics.mjs — put the quarterly reviews into the HTML.
//
// The five topic rooms are a browser module: it fetches ~30 series files and builds the
// page in JavaScript. That was fine for readers and terrible for search. Measured
// 2026-08-03, crawler-visible words per page:
//
//   deals   (server-rendered Nunjucks)  1,694
//   society (client-rendered module)      198
//
// The quarterly reviews are the deepest writing on the site, and Google was seeing about
// a tenth of one. Nothing else in an SEO audit matters next to that.
//
// So run the same builders here, at build time, in Node. This is not a second
// implementation: it extracts the very module the page ships, stubs its two browser
// imports, gives it a DOM shim and a filesystem-backed fetch, and captures exactly the
// HTML the browser would have produced. One source of truth, rendered twice.
//
// Runs BEFORE eleventy (see package.json), reading the .njk source rather than _site, so
// there is no two-pass build. If a topic fails to render it is simply omitted, and
// topic-pages.njk falls back to the static core it had before. A page can degrade; it can
// never ship the wrong content.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trendWord, bandWord, stanceWord, staleness, balanceWord } from '../assets/prose.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'prerendered-topics.json');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const routes = JSON.parse(JSON.stringify(
  (await import(path.join(ROOT, '_data', 'topicRoutes.js'))).default
    ?? (await import(path.join(ROOT, '_data', 'topicRoutes.js'))),
));

const source = fs.readFileSync(path.join(ROOT, 'topic-pages.njk'), 'utf8');
const match = source.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!match) throw new Error('prerender-topics: the module script is missing from topic-pages.njk');

// The two browser imports are presentation-only. treemapSVG draws an SVG the crawler does
// not need and humanSrc rewrites a URL; prose.mjs is a real dependency and is imported for
// real above. Everything else in the module is the content we are here for.
const base = match[1]
  .replace(/import \{treemapSVG,humanSrc\} from '[^']+';/,
    "const treemapSVG=()=>'<svg role=\"img\" aria-hidden=\"true\"></svg>'; const humanSrc=(u)=>u; ")
  .replace(/import \{trendWord,bandWord,stanceWord,staleness,balanceWord\} from '[^']+';/, '');

const saved = { document: globalThis.document, fetch: globalThis.fetch, window: globalThis.window,
  innerWidth: globalThis.innerWidth, location: globalThis.location, scrollTo: globalThis.scrollTo };

const out = {};
for (const route of routes) {
  // Nunjucks has not run yet, so the extracted source still carries its template tags:
  // the {% raw %} / {% endraw %} pair that protects the JavaScript from Nunjucks, and the
  // one interpolation that stamps the route key. Resolve both the way Nunjucks would.
  const code = base
    .replace(/\{\{\s*topicRoute\.key[^}]*\}\}/g, JSON.stringify(route.key))
    .replace(/\{%-?\s*(?:end)?raw\s*-?%\}/g, '');

  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) {
      nodes.set(selector, {
        innerHTML: '', className: '', value: '',
        classList: { toggle() {}, add() {}, remove() {} },
        addEventListener() {}, setAttribute() {}, removeAttribute() {},
      });
    }
    return nodes.get(selector);
  };
  globalThis.document = { querySelector: node, querySelectorAll: () => [] };
  globalThis.window = globalThis;
  globalThis.innerWidth = 1200;
  globalThis.location = { href: route.permalink };
  globalThis.scrollTo = () => {};
  let failed = '';
  globalThis.reportMexicoDataError = (resource) => { failed = resource; };
  globalThis.fetch = async (url) => {
    const file = path.join(ROOT, String(url).replace(/^\//, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };

  try {
    await new AsyncFunction('trendWord', 'bandWord', 'stanceWord', 'staleness', 'balanceWord', code)(
      trendWord, bandWord, stanceWord, staleness, balanceWord,
    );
    const html = nodes.get('#topicApp')?.innerHTML || '';
    // Two ways to be useless: the documented failure state, or a page too thin to be the
    // review. Either one falls back to the static core rather than shipping a stub.
    if (failed) throw new Error(`rendered the failure state (${failed})`);
    if (html.length < 4000) throw new Error(`suspiciously short (${html.length} chars)`);
    out[route.key] = html;
  } catch (error) {
    console.warn(`  prerender-topics: ${route.key} not prerendered, falling back to the static core — ${error.message}`);
  }
}

Object.assign(globalThis, saved);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(out)}\n`);
const words = Object.values(out).reduce((n, h) => n + h.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length, 0);
console.log(`prerender-topics: ${Object.keys(out).length}/${routes.length} rooms prerendered · ${words.toLocaleString('en-US')} words now in the HTML`);
