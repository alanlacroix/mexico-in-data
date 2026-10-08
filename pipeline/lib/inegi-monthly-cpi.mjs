import { Worker } from 'node:worker_threads';
import { fetchBounded } from './url-safety.js';
import { shapeEvidenceRecord } from './source-evidence.mjs';
import newsDay from './news-day.cjs';

export const INEGI_NEWS_URL = 'https://www.inegi.org.mx/app/api/saladeprensa/api/saladeprensa/ObtenerInfoNoticia/v3';
const LANDING_URL = 'https://www.inegi.org.mx/temas/inpc/default.html';
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const EN_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const trusted = new WeakMap();
const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0,10) === day;
const parseSpanishDate = value => {
  const match = fold(value).match(/^(\d{1,2}) de ([a-z]+) de (\d{4})$/);
  if (!match || !MONTHS.includes(match[2])) return '';
  const day = `${match[3]}-${String(MONTHS.indexOf(match[2])+1).padStart(2,'0')}-${match[1].padStart(2,'0')}`;
  return validDay(day) ? day : '';
};
const referencePeriod = day => {
  const date = new Date(`${day.slice(0,7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), text: `${MONTHS[date.getUTCMonth()]} de ${date.getUTCFullYear()}` };
};

export const requiresInegiMonthlySource = row => /^inegi-cpi-\d{4}-\d{2}-\d{2}$/.test(row?.id || '');

export function isMonthlyInegiCpi(row) {
  if (!validDay(row?.date) || row.id !== `inegi-cpi-${row.date}` || row.source !== 'INEGI'
      || row.kind !== 'inegi' || row.outcome?.actor !== 'inegi' || row.outcome?.topic !== 'inflation'
      || row.requiredForBrief !== true || row.outcomeRequired !== true || row.outcomeSourceUrl !== LANDING_URL
      || row.sourceUrl !== `https://www.inegi.org.mx/contenidos/saladeprensa/doc/cal_${row.date.slice(0,4)}.pdf`) return false;
  const reference = referencePeriod(row.date);
  return fold(row.label) === `inegi cpi — monthly (inpc, ${EN_MONTHS[reference.month]}; headline + core)`;
}

export function parseMonthlyMetadata(records, row) {
  if (!isMonthlyInegiCpi(row) || !Array.isArray(records) || records.length !== 1) return null;
  const record = records[0];
  if (!record || ['idFuente','tipoPublicacion','fechaInformacion','fechaPublicacion','periodoInformacion','urlPdf','programa','titulo']
      .some(key => typeof record[key] !== 'string')) return null;
  const [year, month, day] = row.date.split('-');
  const reference = referencePeriod(row.date);
  const path = `/saladeprensa/boletines/${year}/inpc/inpc_2q${year}_${month}.pdf`;
  if (record?.idFuente !== '950' || record.tipoPublicacion !== '7'
      || record.fechaInformacion !== `${day}/${month}/${year}`
      || parseSpanishDate(record.fechaPublicacion) !== row.date
      || fold(record.periodoInformacion) !== reference.text || record.urlPdf !== path
      || !/^indice nacional de precios al consumidor \(inpc\)(?:\.|$)/.test(fold(record.programa))) return null;
  const title = fold(record.titulo);
  const match = title.match(/^la inflacion anual fue de (-?\d+(?:\.\d+)?)\s*% en ([a-z]+ de \d{4})\.?$/);
  if (!match || match[2] !== reference.text) return null;
  return { title: record.titulo.trim(), rate: match[1], date: row.date,
    period: reference.text, url: `https://www.inegi.org.mx/contenidos${path}` };
}

export function validateMonthlyPages(pages, metadata) {
  if (!metadata || !Array.isArray(pages) || !pages.length || pages.length > 16) return null;
  let bulletin;
  for (const [index, page] of pages.entries()) {
    if (typeof page !== 'string') return null;
    const text = fold(page);
    const header = text.match(/^boletin de indicador (\d{1,4}\/\d{2}) indice nacional de precios al consumidor \(\s*inpc\s*\) (\d{1,2} de [a-z]+ de \d{4}) pagina (\d+)\s*\/\s*(\d+)\b/);
    if (!header || parseSpanishDate(header[2]) !== metadata.date || Number(header[3]) !== index + 1
        || Number(header[4]) !== pages.length || header[1].split('/')[1] !== metadata.date.slice(2,4)
        || text.length - header[0].length < 200 || (bulletin && bulletin !== header[1])) return null;
    bulletin = header[1];
  }
  const first = fold(pages[0]);
  const title = fold(metadata.title).replace(/\s*%/g, '%').replace(/\.$/, '');
  if (!first.replace(/\s*%/g, '%').includes(title)
      || !new RegExp(`\\ben ${metadata.period}\\s*,?\\s+el inpc\\b`).test(first)) return null;
  const text = pages.map(page => page.replace(/\s+/g, ' ').trim()).join('\n\n');
  const record = shapeEvidenceRecord({ id: 'article', kind: 'article-body', source: 'INEGI',
    url: metadata.url, text: `${metadata.title}\n${text}` });
  return record ? text : null;
}

export function extractInegiPdf(bytes, { timeoutMs = 5000, workerUrl = new URL('./inegi-pdf-worker.mjs', import.meta.url) } = {}) {
  return new Promise((resolve, reject) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 2 * 1024 * 1024
        || new TextDecoder().decode(bytes.slice(0,5)) !== '%PDF-') return reject(Error('invalid PDF bytes'));
    const worker = new Worker(workerUrl, { workerData: { bytes }, execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 } });
    let settled = false;
    const finish = (error, pages) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error); else resolve(pages);
    };
    const timer = setTimeout(() => finish(Error('PDF extraction deadline exceeded')), timeoutMs);
    worker.once('error', error => finish(error));
    worker.once('exit', () => { if (!settled) finish(Error('PDF worker exited without complete text')); });
    worker.once('message', message => {
      if (!Array.isArray(message?.pages) || !message.pages.length || message.pages.length > 16
          || message.pages.some(page => typeof page !== 'string' || !page.trim())
          || message.pages.join('').length > 65536) finish(Error('incomplete PDF text'));
      else finish(null, message.pages);
    });
  });
}

export function validatedInegiArticle(item) {
  const record = trusted.get(item);
  if (!record || item.url !== record.url || item.title !== record.title || item.published_at !== record.date
      || item.sourceName !== 'INEGI' || item._editorialDate !== record.date || item._scheduled?.id !== record.scheduledId
      || !isMonthlyInegiCpi(item._scheduled)) return null;
  return { ok: true, articleBody: true, text: record.text, finalUrl: record.url };
}

export function createInegiMonthlyLoader({ now, fetchBytes = fetchBounded, fetchImpl = globalThis.fetch, extractPdf = extractInegiPdf } = {}) {
  const cache = new Map();
  return async row => {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !isMonthlyInegiCpi(row)
        || row.date > newsDay.editorialDay(now)) return null;
    if (!cache.has(row.id)) cache.set(row.id, (async () => {
      const rejectSource = reason => { console.warn(`INEGI monthly ${row.id}: ${reason}`); return null; };
      try {
        const response = await fetchBytes(INEGI_NEWS_URL, { allowedHosts: ['www.inegi.org.mx'], redirects: 0,
          timeoutMs: 10000, maxBytes: 128 * 1024,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          fetchImpl: (url, options) => fetchImpl(url, { ...options, method: 'POST', body: 'acronimo=INPC&idNoticia=0&ingles=0' }) });
        if (response.url !== INEGI_NEWS_URL) return rejectSource('unexpected metadata location');
        const metadata = parseMonthlyMetadata(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body)), row);
        if (!metadata) return rejectSource('metadata does not match the required monthly release');
        const pdf = await fetchBytes(metadata.url, { allowedHosts: ['www.inegi.org.mx'], redirects: 0,
          timeoutMs: 15000, maxBytes: 2 * 1024 * 1024, headers: { Accept: 'application/pdf' }, fetchImpl });
        if (pdf.url !== metadata.url) return rejectSource('unexpected PDF location');
        const text = validateMonthlyPages(await extractPdf(pdf.body), metadata);
        if (!text) return rejectSource('PDF identity, complete pages or evidence size did not validate');
        const item = { id: `scheduled:${row.id}`, url: metadata.url, title: metadata.title, dek: '',
          source: 'inegi.org.mx', sourceName: 'INEGI', tier: 1, beat: 'economy', lang: 'es',
          published_at: row.date, first_seen: now.toISOString(), _editorialDate: row.date,
          _coverage: [], _scheduled: structuredClone(row) };
        trusted.set(item, { ...metadata, text, scheduledId: row.id });
        return item;
      } catch { return rejectSource('bounded source fetch or complete PDF extraction failed'); }
    })());
    return cache.get(row.id);
  };
}
