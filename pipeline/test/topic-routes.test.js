import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const routes = require(path.join(root, '_data', 'topicRoutes.js'));
const nav = require(path.join(root, '_data', 'nav.js'));

const expected = ['economy', 'payments', 'trade', 'politics', 'society', 'usmexico'];
const fail = (message) => { throw new Error(message); };

if (routes.map((x) => x.key).join(',') !== expected.join(',')) fail('topic registry must contain the approved six routes in order');
if (new Set(routes.map((x) => x.permalink)).size !== routes.length) fail('topic permalinks must be unique');

const menu = nav.find((x) => x.label === 'Topics')?.menu?.find((x) => x.group === 'Sections')?.links || [];
const navHrefs = menu.map((x) => x.href);
const routeLinks = routes.map((x) => x.permalink);
// Prune (Fable 2026-07-16): Payments is MERGED under Economy and demoted to the footer, so it
// remains a real route/page but is deliberately not a masthead link. Every masthead topic link
// must still be a real route, in registry order; the only route allowed to be absent is Payments.
if (!navHrefs.every((h) => routeLinks.includes(h))) fail('masthead topic link points to a non-route');
if (navHrefs.join(',') !== routeLinks.filter((h) => h !== '/payments.html').join(',')) fail('masthead topic links drifted from the route registry (minus the demoted /payments.html)');

const redirects = fs.readFileSync(path.join(root, '_redirects'), 'utf8');
for (const retired of ['/money.html', '/security.html', '/topics-start-mockup.html']) {
  if (!redirects.includes(retired)) fail(`missing redirect for ${retired}`);
}

for (const route of routes) {
  const output = path.join(root, '_site', route.permalink.slice(1));
  if (!fs.existsSync(output)) fail(`missing built topic route: ${route.permalink}`);
  const html = fs.readFileSync(output, 'utf8');
  if (!html.includes(`const ROUTE_TOPIC="${route.key}"`)) fail(`${route.key} rendered with the wrong topic key`);
  if (!html.includes('data-evidence="table"')) fail(`${route.key} has no exact table control`);
  if (html.includes('amp;amp')) fail(`${route.key} contains double-escaped metadata`);
  if (/prototype/i.test(html)) fail(`${route.key} still exposes prototype language`);
  if (html.includes('https://ustr.gov/about/policy-offices/press-office/press-releases/2026/july/ambassador-greer-issues-statement-usmca-joint-review')) fail(`${route.key} contains the unverified USTR URL`);
}

const products = JSON.parse(fs.readFileSync(path.join(root, 'data', 'trade', 'exports-by-product.json'), 'utf8'));
if (products.reconciliation?.pass !== true) fail('trade composition must fail closed until annual reconciliation passes');

console.log('topic-routes: ok');
