import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Build the Atlas from one immutable, reviewable extract of the four official
// releases. The extract and its source-file hashes live in data/source-snapshots.
// This script never carries values forward from the prior Atlas output.

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const snapshotName = 'atlas-state-2026-07-13';
const snapshotPath = path.join(root, 'data', 'source-snapshots', `${snapshotName}.tsv`);
const manifestPath = path.join(root, 'data', 'source-snapshots', `${snapshotName}.manifest.json`);
const outPath = path.join(root, 'data', 'atlas-states.json');

const DISPLAY_NAMES = {
  '05': 'Coahuila',
  '15': 'State of Mexico',
  '16': 'Michoacán',
  '30': 'Veracruz',
};

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.snapshot !== path.basename(snapshotPath)) throw new Error(`Atlas manifest points to ${manifest.snapshot}, expected ${path.basename(snapshotPath)}`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.created || '')) throw new Error('Atlas manifest is missing a valid created date');
if (!Array.isArray(manifest.source_files) || manifest.source_files.length !== 4 || manifest.source_files.some((source) => !/^[a-f0-9]{64}$/.test(source.sha256 || ''))) {
  throw new Error('Atlas manifest must contain four source files with SHA-256 hashes');
}
const lines = fs.readFileSync(snapshotPath, 'utf8').trim().split(/\r?\n/);
const expectedHeader = 'code\tname\tgdp_mxn_m\tpopulation\tpoverty_pct\tinformality_pct\tunemployment_pct';
if (lines.shift() !== expectedHeader) throw new Error('Atlas source snapshot has an unexpected header');

const states = {};
for (const line of lines) {
  const [code, official_name, ...raw] = line.split('\t');
  const [gdp_mxn_m, pop, poverty, informality, unemployment] = raw.map(Number);
  if (!/^\d{2}$/.test(code) || [gdp_mxn_m, pop, poverty, informality, unemployment].some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid Atlas snapshot row: ${line}`);
  }
  if (states[code]) throw new Error(`Duplicate state code in Atlas snapshot: ${code}`);
  states[code] = {
    name: DISPLAY_NAMES[code] || official_name,
    official_name,
    gdp_mxn_m,
    gdppc_mxn: Math.round(gdp_mxn_m * 1_000_000 / pop),
    pop,
    poverty,
    informality,
    unemployment,
  };
}

const codes = Object.keys(states).sort();
const expectedCodes = Array.from({ length: 32 }, (_, index) => String(index + 1).padStart(2, '0'));
if (JSON.stringify(codes) !== JSON.stringify(expectedCodes)) throw new Error(`Expected state codes 01–32; found ${codes.join(', ')}`);

const entries = Object.values(states);
const gdpStateSum = entries.reduce((sum, state) => sum + state.gdp_mxn_m, 0);
const gdpOfficialTotal = 33_582_899.273;
const populationTotal = entries.reduce((sum, state) => sum + state.pop, 0);
if (Math.abs(gdpStateSum - gdpOfficialTotal) > 0.001) throw new Error(`PIBE check failed: state sum ${gdpStateSum}, official ${gdpOfficialTotal}`);
if (populationTotal !== 132_274_416) throw new Error(`Population check failed: ${populationTotal}`);

const result = {
  meta: {
    updated: manifest.created,
    snapshot: `data/source-snapshots/${manifest.snapshot}`,
    snapshot_manifest: `data/source-snapshots/${snapshotName}.manifest.json`,
    methodology: 'GDP per person is derived from nominal 2024 PIBE divided by CONAPO 2024 mid-year population. No exchange-rate conversion is used.',
    sources: {
      gdp: {
        label: 'INEGI · PIBE 2024', period: '2024 revised', unit: 'millions of current Mexican pesos',
        url: 'https://www.inegi.org.mx/contenidos/programas/pibent/2018/datosabiertos/conjunto_de_datos_pibe_csv.zip',
        program_url: 'https://www.inegi.org.mx/programas/pibent/2018/'
      },
      population: {
        label: 'CONAPO · mid-year population projection', period: '2024', unit: 'people',
        url: 'https://repodatos.atdt.gob.mx/CONAPO/proyecciones/00_Pob_Mitad_1950_2070.csv',
        landing_url: 'https://www.gob.mx/conapo/acciones-y-programas/conciliacion-demografica-de-1950-a-2019-y-proyecciones-de-la-poblacion-de-mexico-y-de-las-entidades-federativas-2020-a-2070'
      },
      poverty: {
        label: 'INEGI · multidimensional poverty', period: '2024', unit: '% of people',
        url: 'https://www.inegi.org.mx/contenidos/desarrollosocial/pm/tabulados/pm_ef_2024.xlsx',
        landing_url: 'https://www.inegi.org.mx/desarrollosocial/pm/',
        note: 'INEGI calculations from ENIGH 2024 using CONEVAL methodology.'
      },
      informality: {
        label: 'INEGI · ENOE labor informality rate (TIL1)', period: 'Q1 2026', unit: '% of employed people',
        url: 'https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/enoe/enoe2026_05.pdf'
      },
      unemployment: {
        label: 'INEGI · ENOE unemployment rate', period: 'Q1 2026', unit: '% of the labor force',
        url: 'https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2026/enoe/enoe2026_05.pdf'
      }
    },
    national: {
      gdp_mxn_m: gdpOfficialTotal,
      state_gdp_sum_mxn_m: gdpStateSum,
      gdppc_mxn: Math.round(gdpOfficialTotal * 1_000_000 / populationTotal),
      population: populationTotal,
      poverty: 29.5585,
      informality: 54.8
    }
  },
  states
};

fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(`Wrote ${outPath} from ${path.relative(root, snapshotPath)}`);
console.log(`Official PIBE: MX$${(gdpOfficialTotal / 1_000_000).toFixed(3)}tn; state sum: ${gdpStateSum}; population: ${populationTotal.toLocaleString('en-US')}`);
