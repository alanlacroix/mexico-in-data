import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const routes = require(path.join(root, '_data', 'topicRoutes.js'));
const nav = require(path.join(root, '_data', 'nav.js'));

// Trade folded into U.S.–Mexico on 2026-08-01 (Fable): its export composition moved
// into that page as a slot and /trade.html now 301s there. Five JS-rendered rooms
// remain, plus the two standalone section pages.
const expected = ['economy', 'payments', 'politics', 'society', 'usmexico'];
const fail = (message) => { throw new Error(message); };

if (routes.map((x) => x.key).join(',') !== expected.join(',')) fail('topic registry must contain the approved routes in order');
if (new Set(routes.map((x) => x.permalink)).size !== routes.length) fail('topic permalinks must be unique');

// Nav contract updated 2026-08-01 (Alan landed the seven-section structure): the masthead
// carries a Sections dropdown with the SEVEN landed sections — the five story rooms that
// stay in the menu (trade folds into U.S.–Mexico; trade.html remains live off-menu) plus
// the two new lite pages, /deals.html and /energy.html.
const SECTION_MENU = ['/payments.html', '/deals.html', '/economy.html', '/us-mexico.html', '/politics.html', '/society.html', '/energy.html'];
const topicsMenu = nav.find((x) => x.label === 'Quarterly review');
const menuLinks = (topicsMenu?.menu || []).flatMap((g) => g.links || []).map((x) => x.href);
const routeLinks = routes.map((x) => x.permalink);
if (!topicsMenu) fail('masthead must carry the Quarterly review dropdown');
for (const href of SECTION_MENU) if (!menuLinks.includes(href)) fail('Quarterly review dropdown is missing ' + href);
// 2026-07-20 Alan: "Remove index, what is that" — the sections ARE the menu; Explore
// stays reachable from the footer, not the dropdown.
if (menuLinks.includes('/explore.html')) fail('the Quarterly review dropdown carries only the seven sections');
if (menuLinks.includes('/trade.html')) fail('trade folds into U.S.–Mexico and stays off the Quarterly review menu');
for (const href of [...routeLinks, '/deals.html', '/energy.html']) if (!(topicsMenu.match || []).includes(href)) fail('Quarterly review must light active on ' + href);
// The section anatomy applies to the standalone pages too (Fable 2026-08-01):
// same modules, same order, no placeholder copy. Energy is not converted yet, so
// it is checked for existence only until its build lands.
const ANATOMY = ['How it works', 'The numbers', 'What changed this quarter', "What's ahead", 'My view', 'The record', 'Sources and method'];
for (const href of ['/deals.html', '/energy.html']) {
  const out = path.join(root, '_site', href.slice(1));
  if (!fs.existsSync(out)) fail(`missing built section page: ${href}`);
}
for (const page of ['deals.html', 'energy.html']) {
  const html = fs.readFileSync(path.join(root, '_site', page), 'utf8');
  let cursor = -1;
  for (const heading of ANATOMY) {
    const at = html.indexOf('>' + heading + '<');
    if (at < 0) fail(`${page} is missing the "${heading}" module`);
    if (at < cursor) fail(`${page}: "${heading}" is out of the fixed anatomy order`);
    cursor = at;
  }
  if (!/Last revised \w{3} \d{1,2}, \d{4}/.test(html)) fail(`${page}: the walkthrough must carry a revised date`);
  if (!html.includes('What would change my mind')) fail(`${page}: My view must end with what would change it`);
  if (/opens in October|first quarterly view|New section, opened/i.test(html)) fail(`${page}: placeholder copy must not ship`);
}
const explore = fs.readFileSync(path.join(root, 'explore.njk'), 'utf8');
for (const href of routeLinks) if (!explore.includes('href="' + href + '"')) fail('Explore is missing topic route ' + href);

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
