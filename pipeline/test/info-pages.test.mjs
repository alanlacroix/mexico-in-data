import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const manifest = require('../../_data/releaseManifest.json');
const publishedSources = require('../../_data/publishedSources.js')();
const edition = require('../../data/edition.json');

for (const route of ['/about/', '/es/about/', '/sources/', '/es/sources/']) {
  assert.ok(manifest.publicRoutes.some((item) => item.route === route), `${route} must be public`);
}
for (const route of ['/about', '/about.html']) {
  assert.equal(manifest.redirectRoutes.find((item) => item.route === route)?.target, '/about/');
}
for (const route of ['/sources', '/sources.html']) {
  assert.equal(manifest.redirectRoutes.find((item) => item.route === route)?.target, '/sources/');
}
const weeklyUrls = edition.weeklyBrief.items.flatMap((item) => item.sources.map((source) => source.url));
for (const url of weeklyUrls) assert.ok(publishedSources.some((source) => source.url === url), `weekly citation missing from sources page: ${url}`);
assert.match(fs.readFileSync('sources.njk', 'utf8'), /does not mean that it is continuously monitored/);
console.log('info pages: routes, legacy redirects and published weekly sources pass');
