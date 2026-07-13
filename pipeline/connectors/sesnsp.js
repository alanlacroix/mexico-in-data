// SESNSP municipal crime totals, year to date. In 2026 SESNSP changed both its
// methodology and its distribution path. The old repodatos CSV mirror ends in
// 2025; the current official municipal report is a 3 MB XLSX on gob.mx. This
// connector discovers the latest current-methodology workbook from the official
// report page, streams its large worksheet with Python's standard library, and
// keeps only one total per real municipality. It remains gated to a monthly job.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getBuffer, getText } from '../lib/http.js';

const execFileAsync = promisify(execFile);
const PAGE_URL = 'https://www.gob.mx/sesnsp/documentos/historico-de-incidencia-delictiva-del-fuero-comun?state=published';
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

const normalized = (value) => decodeEntities(value)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function findOfficialMunicipalWorkbook(html) {
  const candidates = [];
  for (const match of String(html).matchAll(/<a\b([^>]*)>/gi)) {
    const attrs = match[1];
    const href = (/\bhref=["']([^"']+)["']/i.exec(attrs) || [])[1];
    if (!href || !/\.xlsx(?:\?|$)/i.test(href)) continue;
    const label = normalized(attrs);
    const year = Number((/\b(20\d{2})\s*\(xls\)/i.exec(label) || [])[1]);
    const currentFile = /rnid-delitos[_-]municipal-/i.test(href);
    if (!label.includes('municipal') || !Number.isInteger(year) || !currentFile) continue;
    candidates.push({ year, href });
  }
  candidates.sort((a, b) => b.year - a.year);
  if (!candidates.length) throw new Error('SESNSP: current municipal workbook link not found');

  const url = new URL(decodeEntities(candidates[0].href), PAGE_URL);
  if (url.protocol !== 'https:' || url.hostname !== 'www.gob.mx'
      || !url.pathname.startsWith('/cms/uploads/attachment/file/')
      || !/\.xlsx$/i.test(url.pathname)) {
    throw new Error(`SESNSP: unexpected workbook URL ${url.origin}${url.pathname}`);
  }
  return url.href;
}

// The worksheet is ~95 MB uncompressed. ElementTree.iterparse keeps memory
// bounded; stdout is only the ~2,500 municipality totals and the data vintage.
const PARSE_XLSX = String.raw`
import json, re, sys, unicodedata, zipfile
import xml.etree.ElementTree as ET

book = zipfile.ZipFile(sys.argv[1])
ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

strings = []
with book.open('xl/sharedStrings.xml') as source:
    for _, node in ET.iterparse(source, events=('end',)):
        if node.tag == ns + 'si':
            strings.append(''.join(part.text or '' for part in node.iter(ns + 't')))
            node.clear()

def cell_values(row):
    values = []
    for cell in row.findall(ns + 'c'):
        value = cell.find(ns + 'v')
        if value is None:
            values.append(None)
            continue
        raw = value.text
        values.append(strings[int(raw)] if cell.attrib.get('t') == 's' else raw)
    return values

def norm(value):
    text = unicodedata.normalize('NFD', str(value or ''))
    return ''.join(char for char in text if unicodedata.category(char) != 'Mn').lower()

months = {'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5,
          'junio': 6, 'julio': 7, 'agosto': 8, 'septiembre': 9,
          'octubre': 10, 'noviembre': 11, 'diciembre': 12}
header = None
totals = {}
years = set()
row_count = 0
month_count = 0

with book.open('xl/worksheets/sheet1.xml') as source:
    for _, row in ET.iterparse(source, events=('end',)):
        if row.tag != ns + 'row':
            continue
        values = cell_values(row)
        if header is None:
            header = values
            expected = ['ano', 'clave_ent', 'entidad', 'cve. municipio', 'municipio']
            if [norm(value) for value in header[:5]] != expected:
                raise RuntimeError('SESNSP: official workbook columns changed')
            row.clear()
            continue
        if len(values) < 10:
            row.clear()
            continue
        year = str(values[0] or '').strip()
        municipality = str(values[3] or '').strip()
        if not re.fullmatch(r'\d{4,5}', municipality):
            row.clear()
            continue
        cvegeo = municipality.zfill(5)
        if cvegeo.endswith('998') or cvegeo.endswith('999'):
            row.clear()
            continue
        counts = values[9:]
        month_count = max(month_count, len(counts))
        total = 0
        for raw in counts:
            if raw in (None, ''):
                continue
            number = float(raw)
            if number < 0 or not number.is_integer():
                raise RuntimeError('SESNSP: a monthly crime count is not a non-negative integer')
            total += int(number)
        totals[cvegeo] = totals.get(cvegeo, 0) + total
        years.add(year)
        row_count += 1
        row.clear()

if len(years) != 1 or not next(iter(years)).isdigit():
    raise RuntimeError('SESNSP: workbook mixes or omits data years')
if row_count < 200000:
    raise RuntimeError('SESNSP: workbook has too few detailed rows')
if len(totals) < 2400:
    raise RuntimeError('SESNSP: workbook covers too few municipalities')
if month_count < 1 or month_count > 12:
    raise RuntimeError('SESNSP: workbook has an invalid month count')
month_name = norm(header[8 + month_count])
if months.get(month_name) != month_count:
    raise RuntimeError('SESNSP: month columns are incomplete or out of order')

print(json.dumps({'year': next(iter(years)), 'month': month_count,
                  'values': totals, 'detailRows': row_count}, separators=(',', ':')))
`;

async function parseWorkbook(buffer) {
  if (buffer.subarray(0, 2).toString('ascii') !== 'PK') throw new Error('SESNSP: official workbook is not an XLSX archive');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mexico-sesnsp-'));
  const file = path.join(dir, 'sesnsp.xlsx');
  try {
    await fs.writeFile(file, buffer);
    const { stdout } = await execFileAsync('python3', ['-c', PARSE_XLSX, file], {
      encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, timeout: 9 * 60_000,
    });
    return JSON.parse(stdout);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function fetchRaw() {
  if (process.env.ENABLE_SESNSP !== '1') throw new Error('SESNSP disabled this cycle (set ENABLE_SESNSP=1)');
  const page = await getText(PAGE_URL, { timeoutMs: 45_000 });
  const workbookUrl = findOfficialMunicipalWorkbook(page);
  const parsed = await parseWorkbook(await getBuffer(workbookUrl, { timeoutMs: 90_000 }));
  return { ...parsed, workbookUrl };
}

function normalize(raw) {
  const vintage = `${raw.year}-${String(raw.month).padStart(2, '0')}`;
  return {
    vintage,
    values: raw.values,
    notes: `total de delitos del fuero común por municipio, enero–${MONTH_NAMES[raw.month - 1]} de ${raw.year} (metodología RNID 2026; acumulado del año; ${raw.detailRows.toLocaleString('en-US')} registros agregados)`,
  };
}

export const connectors = [
  {
    manifest: {
      id: 'sesnsp-delitos',
      title: 'Incidencia delictiva (total)',
      metric: 'crime_total',
      canonicalSource: true,
      source: 'SESNSP (Secretariado Ejecutivo del SNSP)',
      sourceUrl: PAGE_URL,
      license: 'Datos abiertos, Gobierno de México',
      cadence: 'monthly',
      units: 'delitos (conteo acumulado del año)',
      track: 'map',
      kind: 'layer',
      granularity: 'municipio',
      canonicalKey: 'cvegeo',
      gatedBy: 'ENABLE_SESNSP',
      thresholds: { minCovered: 2400, maxRowDrop: 0.1, freshnessGraceDays: 70 },
    },
    fetchRaw,
    normalize,
  },
];
