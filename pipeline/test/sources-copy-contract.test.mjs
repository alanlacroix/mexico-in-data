import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(root, 'sources.njk'), 'utf8');
const sourceHelpers = fs.readFileSync(path.join(root, 'assets', 'mb.js'), 'utf8');
const overview = fs.readFileSync(path.join(root, 'reports', 'mexico-overview-2026.html'), 'utf8');
const topicPages = fs.readFileSync(path.join(root, 'topic-pages.njk'), 'utf8');
const briefData = fs.readFileSync(path.join(root, 'data', 'brief.json'), 'utf8');
const areasData = fs.readFileSync(path.join(root, 'data', 'areas.json'), 'utf8');
const happeningData = fs.readFileSync(path.join(root, 'data', 'happening.json'), 'utf8');

const internalOrOverstatedCopy = [
  /verify endpoint/i,
  /verify paths/i,
  /definitive external diagnosis/i,
  /best public high-frequency activity nowcast/i,
  /almost nobody wires/i,
  /most briefings never wire/i,
  /pipeline check:/i,
  /pipeline connector paused/i,
];

for (const phrase of internalOrOverstatedCopy) {
  assert.doesNotMatch(source, phrase, `Sources page must not publish internal or overstated copy: ${phrase}`);
}

assert.match(source, /Where the information comes from/i,
  'Sources page should state its purpose in plain language');
for (const requiredSource of [/INEGI/, /Banco de México/, /Hacienda/, /U\.S\. Trade Representative/, /El Financiero/]) {
  assert.match(source, requiredSource, `Sources page should include ${requiredSource}`);
}

// Public source links should open something a person can read. Raw endpoints
// remain valid pipeline inputs, but must not be the link exposed in the UI.
assert.match(sourceHelpers, /data\.worldbank\.org\/indicator\//,
  'World Bank API sources should resolve to human-readable indicator pages');
assert.match(sourceHelpers, /cne\.gob\.mx\/ConsultaPrecios\/GasolinasyDiesel/,
  'fuel-price sources should resolve to CNE’s official lookup, not an XML download');
for (const rawLink of [
  /api\.worldbank\.org\/v2\/country\/MEX\/indicator\//i,
  /repodatos\.atdt\.gob\.mx\/CONAPO\/.*\.csv/i,
  /wsDataService\.svc/i,
]) {
  assert.doesNotMatch(overview, rawLink, `overview must not expose a raw data endpoint: ${rawLink}`);
}
assert.doesNotMatch(topicPages, /www\.cnbv\.gob\.mx\/Inclusi%C3%B3n\/Paginas\/Bases-de-Datos\.aspx/i,
  'Payments must not link to CNBV’s certificate-failing legacy database page');
// The CNBV reference was cut in the 2026-07-20 letter-register rebuild (kill list: nothing
// kept for completeness). If it ever returns, it must use the readable release, never the
// certificate-failing legacy page (the doesNotMatch above stays unconditional).
if (/cnbv/i.test(topicPages)) {
  assert.match(topicPages, /pnif\.cnbv\.gob\.mx\/dnoticia\/basededatosinclusionfinanciera2024/i,
    'Payments should link to CNBV’s readable financial-inclusion release');
}
for (const renderedData of [briefData, areasData, happeningData]) {
  assert.doesNotMatch(renderedData, /dof\.gob\.mx\/abrirPDF\.php/i,
    'Brief links should use the readable DOF issue page, not a PDF download endpoint');
  assert.doesNotMatch(renderedData, /news\.google\.com|Google News|via GDELT/i,
    'Google News and GDELT are discovery tools, not public source labels or links');
}

assert.doesNotMatch(source, /r\.error\|\|r\.message|r\.gatedBy/,
  'Sources page must not expose raw connector errors or environment flags');
for (const privateDiagnostic of [/Feed status/i, /Review flag/i, /Fetch issue/i, /Update due/i, /health\.json/i]) {
  assert.doesNotMatch(source, privateDiagnostic,
    `Sources page must not expose pipeline diagnostics: ${privateDiagnostic}`);
}

console.log('sources-copy-contract: ok');
