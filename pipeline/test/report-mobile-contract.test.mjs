import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const report = readFileSync('reports/mexico-overview-2026.html', 'utf8');
const mobileCss = report.match(/@media\(max-width:720px\)\{([\s\S]*?)\}\s*@media print/);

assert.ok(mobileCss, 'The overview report must include its mobile layout rules.');

const css = mobileCss[1];
assert.match(css, /\.table-scroll table[^}]*display:block/, 'Report tables must stack on mobile.');
assert.match(css, /\.chart-svg\{width:100%;min-width:0\}/, 'Report charts must fit the mobile viewport.');
assert.doesNotMatch(css, /\.chart-svg\{width:700px\}/, 'Report charts must not keep the desktop width on mobile.');
assert.match(css, /\.map-svg\{display:none\}/, 'The desktop composite map must be hidden on mobile.');
assert.match(css, /\.map-mobile-summary\{display:grid/, 'The regional summary must replace the map on mobile.');
assert.match(report, /setAttribute\('data-label',headers\[index\]\|\|''\)/, 'Mobile table values must receive visible column labels.');

console.log('report mobile contract: ok');
