// One-off: stream the real IMSS asg file (via curl, to clear the WAF) and report
// which DISTINCT (state, code) pairs the frozen crosswalk fails to map — grouped
// by state, CDMX called out. Read-only; writes crosswalks/imss-unmapped.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { curlLines, curlHead } from './lib/stream.js';
import { toCvegeo } from './lib/crosswalk.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = 'http://datos.imss.gob.mx/sites/default/files';

// resolve latest month-end file
function lastDay(y, m) { return new Date(y, m, 0).getDate(); }
let url = null, vintage = null;
const now = new Date();
for (let back = 1; back <= 4 && !url; back++) {
  const t = new Date(now.getFullYear(), now.getMonth() - back, 1);
  const name = `asg-${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(lastDay(t.getFullYear(), t.getMonth() + 1)).padStart(2, '0')}.csv`;
  const { status } = await curlHead(`${HOST}/${name}`);
  if (status === 200) { url = `${HOST}/${name}`; vintage = name.slice(4, 11); }
}
if (!url) throw new Error('no IMSS file resolved');
console.log('file:', url, 'vintage:', vintage);

let header = null, iEnt = -1, iMun = -1, rows = 0;
const seen = new Set(), unmapped = new Map(), byState = new Map();
await curlLines(url, (l) => {
  if (!l) return;
  const c = l.split('|');
  if (!header) { header = c.map((x) => x.trim().toLowerCase()); iEnt = header.indexOf('cve_entidad'); iMun = header.indexOf('cve_municipio'); return; }
  rows++;
  const ent = String(c[iEnt] || '').trim().padStart(2, '0');
  const code = String(c[iMun] || '').trim();
  const key = `${ent}:${code}`;
  if (!byState.has(ent)) byState.set(ent, new Set());
  byState.get(ent).add(code);
  if (seen.has(key)) return;
  seen.add(key);
  try { toCvegeo('imss', code, { cve_ent: ent }); } catch { unmapped.set(key, 1); }
});

console.log(`rows=${rows} distinctCodes=${seen.size} unmappedDistinct=${unmapped.size}`);
const grouped = {};
for (const k of unmapped.keys()) { const e = k.slice(0, 2); (grouped[e] ||= []).push(k.slice(3)); }
for (const e of Object.keys(grouped).sort()) console.log(`  state ${e}: ${grouped[e].length} unmapped [${grouped[e].sort().join(', ')}]`);
console.log(`CDMX(09) codes in file (${(byState.get('09') || new Set()).size}): ${[...(byState.get('09') || [])].sort().join(', ')}`);
fs.writeFileSync(path.join(__dirname, 'crosswalks', 'imss-unmapped.json'),
  JSON.stringify({ url, vintage, rows, distinct: seen.size, unmappedByState: grouped, cdmxCodes: [...(byState.get('09') || [])].sort() }, null, 2));
console.log('wrote crosswalks/imss-unmapped.json');
