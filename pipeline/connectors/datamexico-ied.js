// Inversión Extranjera Directa (IED / FDI) — national quarterly flow, US$.
// Data México's public cube stopped at 2024-Q4. The RNIE now publishes a small
// official workbook with the original and subsequently updated year-to-date
// totals. We discover the current attachment from the Secretaría de Economía
// page, use the updated column, and difference it within each year to recover
// quarterly flows. This avoids pinning a CMS attachment id that changes each
// quarter and fails closed if the workbook layout changes.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getBuffer, getText } from '../lib/http.js';

const execFileAsync = promisify(execFile);
const PAGE_URL = 'https://www.gob.mx/se/acciones-y-programas/competitividad-y-normatividad-inversion-extranjera-directa?state=published';
const QUARTER_MONTH = { 1: '01', 2: '04', 3: '07', 4: '10' };

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function normalized(value) {
  return decodeEntities(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function findOfficialWorkbook(html) {
  const anchors = [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const match = anchors.find(([, href, label]) => {
    const text = normalized(label.replace(/<[^>]+>/g, ' '));
    return /datos_originales_y_actualizacion/i.test(href)
      || (text.includes('ied con cifras originalmente') && text.includes('actualizacion'));
  });
  if (!match) throw new Error('IED: official summary workbook link not found');
  const url = new URL(decodeEntities(match[1]), PAGE_URL);
  if (url.protocol !== 'https:' || url.hostname !== 'www.gob.mx'
      || !url.pathname.startsWith('/cms/uploads/attachment/file/')
      || !/\.xlsx$/i.test(url.pathname)) {
    throw new Error(`IED: unexpected workbook URL ${url.origin}${url.pathname}`);
  }
  return url.href;
}

// The SE page rate-limits / serves a stripped page to datacenter IPs, so link DISCOVERY can
// fail in CI while the CMS attachment itself stays fetchable (verified 2026-07-19: the page
// and link resolve fine from a residential IP). Remember the workbook we last used so a
// blocked discovery degrades to "reuse the known file" instead of failing the connector and
// alerting every cycle. Discovery still wins whenever it works, so a new quarter is picked up.
const CACHE_PATH = new URL('../../data/cache/se-ied-workbook.json', import.meta.url);
const WORKBOOK_RX = /^https:\/\/www\.gob\.mx\/cms\/uploads\/attachment\/file\/\d+\/[^/]+\.xlsx$/i;
async function rememberWorkbook(workbookUrl) {
  try {
    await fs.mkdir(new URL('.', CACHE_PATH), { recursive: true });
    await fs.writeFile(CACHE_PATH, `${JSON.stringify({ workbookUrl, discoveredAt: new Date().toISOString() }, null, 2)}\n`);
  } catch { /* caching is best-effort; never fail the fetch over it */ }
}
async function lastKnownWorkbook() {
  try {
    const cached = JSON.parse(await fs.readFile(CACHE_PATH, 'utf8'));
    return WORKBOOK_RX.test(cached?.workbookUrl || '') ? cached.workbookUrl : null;
  } catch { return null; }
}

async function unzipEntry(file, entry) {
  const { stdout } = await execFileAsync('unzip', ['-p', file, entry], {
    encoding: 'utf8', maxBuffer: 12 * 1024 * 1024,
  });
  if (!stdout.trim()) throw new Error(`IED: workbook entry ${entry} is empty`);
  return stdout;
}

function sharedStrings(xml) {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(([, body]) =>
    decodeEntities([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))
  );
}

function worksheetRows(xml, strings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number((/\br=["'](\d+)["']/.exec(rowMatch[1]) || [])[1]);
    const cells = {};
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1], body = cellMatch[2];
      const ref = (/\br=["']([A-Z]+)\d+["']/.exec(attrs) || [])[1];
      if (!ref) continue;
      const raw = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
      if (raw == null) continue;
      const type = (/\bt=["']([^"']+)["']/.exec(attrs) || [])[1];
      cells[ref] = type === 's' ? strings[Number(raw)] : decodeEntities(raw);
    }
    rows.push({ rowNumber, cells });
  }
  return rows;
}

function quarterFromPeriod(period) {
  const value = normalized(period);
  if (value.includes('marzo')) return 1;
  if (value.includes('junio')) return 2;
  if (value.includes('septiembre')) return 3;
  if (value.includes('diciembre')) return 4;
  return null;
}

export function rowsToQuarterlyFlow(rows) {
  const header = rows.find(({ cells }) => normalized(cells.A) === 'ano' && normalized(cells.B) === 'periodo');
  if (!header || !normalized(header.cells.C).includes('originalmente publicados')
      || !normalized(header.cells.D).includes('datos actualizados')) {
    throw new Error('IED: official workbook columns changed');
  }

  const cumulative = [];
  for (const { cells } of rows) {
    const year = Number(cells.A), quarter = quarterFromPeriod(cells.B), value = Number(cells.D);
    if (!Number.isInteger(year) || year < 1999 || year > 2100 || !quarter || !Number.isFinite(value)) continue;
    cumulative.push({ year, quarter, value });
  }
  cumulative.sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  if (cumulative.length < 100) throw new Error(`IED: only ${cumulative.length} usable official rows`);

  const seen = new Set(), data = [];
  let priorYear = null, priorQuarter = 0, priorCumulative = 0;
  for (const point of cumulative) {
    const key = `${point.year}-Q${point.quarter}`;
    if (seen.has(key)) throw new Error(`IED: duplicate period ${key}`);
    seen.add(key);
    if (point.year !== priorYear) {
      if (point.quarter !== 1) throw new Error(`IED: ${point.year} starts at Q${point.quarter}`);
      priorYear = point.year; priorQuarter = 0; priorCumulative = 0;
    }
    if (point.quarter !== priorQuarter + 1) throw new Error(`IED: missing quarter before ${key}`);
    data.push({
      date: `${point.year}-${QUARTER_MONTH[point.quarter]}`,
      value: point.value - priorCumulative,
    });
    priorQuarter = point.quarter;
    priorCumulative = point.value;
  }
  return data;
}

async function parseWorkbook(buffer) {
  if (buffer.subarray(0, 2).toString('ascii') !== 'PK') throw new Error('IED: official workbook is not an XLSX archive');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mexico-ied-'));
  const file = path.join(dir, 'ied.xlsx');
  try {
    await fs.writeFile(file, buffer);
    const [stringsXml, sheetXml] = await Promise.all([
      unzipEntry(file, 'xl/sharedStrings.xml'),
      unzipEntry(file, 'xl/worksheets/sheet1.xml'),
    ]);
    return rowsToQuarterlyFlow(worksheetRows(sheetXml, sharedStrings(stringsXml)));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export const connectors = [
  {
    manifest: {
      id: 'se-ied',
      title: 'Inversión Extranjera Directa (flujo trimestral)',
      metric: 'fdi',
      canonicalSource: true,
      source: 'Secretaría de Economía (RNIE)',
      sourceUrl: PAGE_URL,
      license: 'Datos abiertos (RNIE / Secretaría de Economía)',
      cadence: 'quarterly',
      units: 'million US$',
      track: 'pulse',
      kind: 'series',
      granularity: 'national',
      thresholds: { maxPctChange: 100000, minRows: 100, maxRowDrop: 0.05 }, // FDI is lumpy quarter to quarter
    },
    async fetchRaw() {
      let workbookUrl;
      try {
        workbookUrl = findOfficialWorkbook(await getText(PAGE_URL, { timeoutMs: 45_000 }));
        await rememberWorkbook(workbookUrl);          // discovery won — refresh the fallback
      } catch (error) {
        const prior = await lastKnownWorkbook();
        if (!prior) throw error;                      // nothing to fall back to — fail closed as before
        console.warn(`  se-ied: discovery failed (${error.message}); reusing last known workbook`);
        workbookUrl = prior;
      }
      return { workbookUrl, data: await parseWorkbook(await getBuffer(workbookUrl, { timeoutMs: 60_000 })) };
    },
    normalize(raw) {
      const data = raw?.data;
      if (!Array.isArray(data) || !data.length) throw new Error('IED: no usable rows');
      return {
        vintage: data[data.length - 1].date,
        data,
        notes: 'Flujo trimestral calculado como la diferencia de las cifras acumuladas actualizadas por el RNIE. Las cifras pueden revisarse en publicaciones posteriores.',
      };
    },
  },
];
