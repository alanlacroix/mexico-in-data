import assert from 'node:assert/strict';
import { findOfficialWorkbook, rowsToQuarterlyFlow } from '../connectors/datamexico-ied.js';
import { findOfficialMunicipalWorkbook } from '../connectors/sesnsp.js';

assert.equal(
  findOfficialWorkbook('<a href="https://www.gob.mx/cms/uploads/attachment/file/1/Datos_originales_y_actualizacion.xlsx">IED con cifras originalmente publicadas y su actualización (Resumen)</a>'),
  'https://www.gob.mx/cms/uploads/attachment/file/1/Datos_originales_y_actualizacion.xlsx',
);
assert.throws(
  () => findOfficialWorkbook('<a href="https://example.com/Datos_originales_y_actualizacion.xlsx">IED con cifras originalmente publicadas y su actualización</a>'),
  /unexpected workbook URL/,
);

const rows = [{ cells: { A: 'Año', B: 'Periodo', C: 'Datos originalmente publicados*', D: 'Datos actualizados al primer trimestre 2026**' } }];
for (let year = 1999; year <= 2023; year += 1) {
  for (const [period, value] of [['Enero - marzo', 10], ['Enero - junio', 25], ['Enero - septiembre', 45], ['Enero - diciembre', 70]]) {
    rows.push({ cells: { A: String(year), B: period, D: String(value) } });
  }
}
rows.push({ cells: { A: '2024', B: 'Enero-marzo', D: '31.5' } });
const flows = rowsToQuarterlyFlow(rows);
assert.equal(flows.length, 101);
assert.deepEqual(flows.slice(0, 4), [
  { date: '1999-01', value: 10 },
  { date: '1999-04', value: 15 },
  { date: '1999-07', value: 20 },
  { date: '1999-10', value: 25 },
]);
assert.deepEqual(flows.at(-1), { date: '2024-01', value: 31.5 });

const municipalHtml = `
  <a href="/cms/uploads/attachment/file/9/2025_may26.xlsx"
     onClick="a_onClick('sesnsp', '2025 (XLS) - Reporte Municipal')"></a>
  <a href="/cms/uploads/attachment/file/10/RNID-Delitos_Municipal-2026-may2026.xlsx"
     onClick="a_onClick('sesnsp', '2026 (XLS) - Reporte De Incidencia Delictiva Del Fuero Común Municipal')"></a>`;
assert.equal(
  findOfficialMunicipalWorkbook(municipalHtml),
  'https://www.gob.mx/cms/uploads/attachment/file/10/RNID-Delitos_Municipal-2026-may2026.xlsx',
);

console.log('official-source connector tests: ok');
