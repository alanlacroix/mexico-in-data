import { createHash } from 'node:crypto';
import { fetchBounded } from './url-safety.js';
import { shapeEvidenceRecord } from './source-evidence.mjs';
import { INEGI_NEWS_URL, extractInegiPdf } from './inegi-monthly-cpi.mjs';
import newsDay from './news-day.cjs';

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
const parseDay = text => {
  const m = fold(text).match(/^(\d{1,2}) de ([a-z]+) de (\d{4})$/);
  const day = m && MONTHS.includes(m[2]) ? `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  return validDay(day) ? day : '';
};
const pdfPath = day => `/saladeprensa/boletines/${day.slice(0, 4)}/imai/imai${day.slice(0, 4)}_${day.slice(5, 7)}.pdf`;
const trusted = new WeakMap();

export function isOptionalImaiRelease(row) {
  return validDay(row?.date) && row.id === `inegi-imai-${row.date}` && row.source === 'INEGI'
    && row.kind === 'inegi' && row.advisoryOnly === true && row.outcomeRequired === false && row.requiredForBrief === false
    && row.sourceUrl === `https://www.inegi.org.mx/contenidos/saladeprensa/doc/cal_${row.date.slice(0, 4)}.pdf`
    && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(row.referencePeriod || '') && row.referencePeriod < row.date.slice(0, 7)
    && row.timeZone === 'America/Mexico_City' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(row.releaseAt || '')
    && Number.isFinite(Date.parse(row.releaseAt)) && new Date(row.releaseAt).toISOString() === row.releaseAt.replace('Z', '.000Z')
    && newsDay.editorialDay(new Date(row.releaseAt)) === row.date;
}

export function parseImaiMetadata(records, row) {
  if (!isOptionalImaiRelease(row) || !Array.isArray(records) || records.length !== 1) return null;
  const record = records[0];
  if (!record || ['idFuente','tipoPublicacion','fechaInformacion','fechaPublicacion','periodoInformacion','urlPdf','programa','titulo']
    .some(key => typeof record[key] !== 'string')) return null;
  const [year, month, day] = row.date.split('-');
  const [referenceYear, referenceMonth] = row.referencePeriod.split('-');
  const period = `${MONTHS[Number(referenceMonth) - 1]} de ${referenceYear}`;
  if (record.idFuente !== '817' || record.tipoPublicacion !== '7' || record.fechaInformacion !== `${day}/${month}/${year}`
    || parseDay(record.fechaPublicacion) !== row.date || fold(record.periodoInformacion) !== period
    || record.urlPdf !== pdfPath(row.date)
    || fold(record.programa) !== 'indicador mensual de la actividad industrial (imai). ano base 2018') return null;
  const title = fold(record.titulo).replace(/\s*%/g, '%');
  if (!new RegExp(`^(?:aumento|disminuyo) \\d+(?:\\.\\d+)?% la actividad industrial en ${period}, a tasa mensual\\.?$`).test(title)) return null;
  return { title: record.titulo.trim(), date: row.date, period, referencePeriod: row.referencePeriod,
    url: `https://www.inegi.org.mx/contenidos${pdfPath(row.date)}` };
}

export function validateImaiDocument(pages, metadata) {
  if (!metadata || !Array.isArray(pages) || !pages.length || pages.length > 16) return null;
  let bulletin;
  for (const [index, page] of pages.entries()) {
    if (typeof page !== 'string') return null;
    const text = fold(page);
    const header = text.match(/^boletin de indicador (\d{1,4}\/\d{2}) indicador mensual de la actividad industrial \(\s*imai\s*\) (\d{1,2} de [a-z]+ de \d{4}) pagina (\d+)\s*\/\s*(\d+)\b/);
    if (!header || parseDay(header[2]) !== metadata.date || Number(header[3]) !== index + 1
      || Number(header[4]) !== pages.length || header[1].split('/')[1] !== metadata.date.slice(2, 4)
      || text.length - header[0].length < 200 || (bulletin && bulletin !== header[1])) return null;
    bulletin = header[1];
  }
  const first = fold(pages[0]).replace(/\s*%/g, '%');
  if (!first.includes(fold(metadata.title).replace(/\s*%/g, '%').replace(/\.$/, ''))
    || !first.includes(`en ${metadata.period}`)) return null;
  const text = pages.map(page => page.replace(/\s+/g, ' ').trim()).join('\n\n');
  if (!shapeEvidenceRecord({ id: 'article', kind: 'article-body', source: 'INEGI', url: metadata.url, text: `${metadata.title}\n${text}` })) return null;
  return { text, bulletin };
}

export function validatedImaiArticle(item) {
  const record = trusted.get(item);
  if (!record || item.url !== record.url || item.title !== record.title || item.published_at !== record.date
    || item.sourceName !== 'INEGI' || item._editorialDate !== record.date || item._scheduled
    || item.id !== record.id) return null;
  return { ok: true, articleBody: true, text: record.text, finalUrl: record.url };
}
export function validatedImaiReleaseDescriptor(item) {
  return validatedImaiArticle(item) ? trusted.get(item).descriptor : null;
}

export function createImaiLoader({ now, fetchBytes = fetchBounded, fetchImpl = globalThis.fetch, extractPdf = extractInegiPdf } = {}) {
  const cache = new Map();
  return async row => {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !isOptionalImaiRelease(row)
      || now.getTime() < Date.parse(row.releaseAt) || row.date > newsDay.editorialDay(now)) return null;
    row = { ...row };
    const signature = JSON.stringify([row.date, row.referencePeriod, row.releaseAt]);
    if (cache.has(row.id) && cache.get(row.id).signature !== signature) {
      console.warn(`INEGI optional IMAI ${row.id}: conflicting configured period or availability time`);
      return null;
    }
    if (!cache.has(row.id)) cache.set(row.id, { signature, promise: (async () => {
      const reject = reason => { console.warn(`INEGI optional IMAI ${row.id}: ${reason}`); return null; };
      try {
        const response = await fetchBytes(INEGI_NEWS_URL, { allowedHosts: ['www.inegi.org.mx'], redirects: 0,
          timeoutMs: 10000, maxBytes: 128 * 1024,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          fetchImpl: (url, options) => fetchImpl(url, { ...options, method: 'POST', body: 'acronimo=IMAI&idNoticia=0&ingles=0' }) });
        if (response.url !== INEGI_NEWS_URL) return reject('unexpected metadata location');
        const metadata = parseImaiMetadata(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body)), row);
        if (!metadata) return reject('metadata does not match the configured industrial release');
        const pdf = await fetchBytes(metadata.url, { allowedHosts: ['www.inegi.org.mx'], redirects: 0,
          timeoutMs: 15000, maxBytes: 2 * 1024 * 1024, headers: { Accept: 'application/pdf' }, fetchImpl });
        if (pdf.url !== metadata.url) return reject('unexpected PDF location');
        const document = validateImaiDocument(await extractPdf(pdf.body), metadata);
        if (!document) return reject('PDF identity, complete pages or evidence size did not validate');
        const item = { id: `official:${row.id}`, url: metadata.url, title: metadata.title, dek: '',
          source: 'inegi.org.mx', sourceName: 'INEGI', tier: 1, beat: 'economy', lang: 'es',
          published_at: row.date, first_seen: now.toISOString(), _editorialDate: row.date, _coverage: [] };
        const descriptor = Object.freeze({ authority: 'INEGI', series: 'imai.national.monthly.base2018',
          referencePeriod: metadata.referencePeriod, publicationDate: row.date, bulletin: document.bulletin,
          sourceUrl: metadata.url, sourceSha256: createHash('sha256').update(pdf.body).digest('hex'),
          revision: null, adapterVersion: 'inegi-imai-v1' });
        trusted.set(item, { ...metadata, ...document, id: item.id, descriptor });
        return item;
      } catch { return reject('bounded source fetch or complete PDF extraction failed'); }
    })() });
    return cache.get(row.id).promise;
  };
}
