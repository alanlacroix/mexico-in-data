import { fetchBoundedText } from './url-safety.js';
import { shapeEvidenceRecord } from './source-evidence.mjs';

export const CENSUS_CALENDAR_URL = 'https://www.census.gov/foreign-trade/schedule.html';
const HEADING = 'FT900 U.S. International Trade in Goods and Services';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[’‘]/g, "'")
  .replace(/\bu\.\s*s\./g, 'united states').replace(/\bee\.\s*uu\./g, 'estados unidos');

// This routes additional source evidence. It does not certify novelty, readiness,
// a supported watch field, or the availability of any particular FT900 subseries.
export function censusTradeCalendarEligible(item, lead, locatedBody) {
  if (lead?.id !== 'article' || lead.kind !== 'article-body' || lead.url !== item?.url) return false;
  if (typeof locatedBody !== 'string' || !clean(locatedBody)) return false;
  if (shapeEvidenceRecord(lead)?.text !== lead.text) return false;
  const headline = fold(`${item.title || ''} ${item.dek || ''}`);
  if (/\b(?:steel|acero|population|poblacion|housing|vivienda|remittances|remesas|foreign direct investment|inversion extranjera directa|ied)\b/.test(headline)) return false;
  const spanish = /\b(?:exporta\w*|exporto|superavit comercial|importaciones)\b/.test(headline);
  const us = `(?:estados unidos|united states|usa|mercado estadounidense${spanish ? '|eu' : ''})`;
  const beforeDestination = '(?:(?!\\b(?:a|hacia|con|al|to|with|into)\\b)[^!?;]){0,120}';
  const beforeOrigin = '(?:(?!\\b(?:from|desde|de)\\b)[^!?;]){0,70}';
  // Accept explicit subject/flow frames, not arbitrary words between a country
  // and somebody else's export/import claim. Unrecognized prose gets no routing.
  const mexicoSubject = "\\bmexico(?:'s)?\\s+(?:(?:rompe record y|(?:aumenta|aumento|reduce|redujo) \\d[\\d.,]*%? su)\\s+)?";
  const bilateral = [
    new RegExp(`${mexicoSubject}(?:exporta\\w*|exporto|exports?|(?:goods|merchandise|technology) exports?|superavit comercial|trade surplus|goods trade|comercio de (?:bienes|productos))\\b${beforeDestination}\\b(?:a|hacia|con|al|to|with|into) (?:los |the )?${us}\\b`),
    new RegExp(`\\b${us}\\s+(?:(?:goods|merchandise) )?(?:imports?|importaciones)\\b${beforeOrigin}\\b(?:from|desde|de) mexico\\b`),
    new RegExp(`\\b(?:goods|merchandise|technology|technological) exports? from mexico to (?:the )?${us}\\b`),
  ].some(rx => {
    const match = headline.match(rx);
    return match && !/\.(?:\s|$)|\b(?:mientras|while|pero|but)\b/.test(match[0]);
  });
  if (!bilateral || /\b(?:tourism|turismo|services?|servicios)\b/.test(headline)) return false;
  // lead.text also contains RSS title text; attribution must come from the actual
  // located body, never that appended metadata or an unverified fallback snippet.
  const body = fold(locatedBody);
  if (/\b(?:ft900a|advance economic indicators|advance report on international trade)\b/.test(body)) return false;
  return body.split(/[;!?\n]|\.(?=\s+[a-z])/).some(sentence =>
    /\b(?:oficina del censo(?: de (?:estados unidos|eu))?(?=\s*(?:[,.]|$))|united states census bureau)\b/.test(sentence)
    && /\bmexico\b/.test(sentence)
    && /\b(?:datos|cifras|informo|reporto|publico|estadisticas?|serie historica|segun|according|data|figures|reported|released|statistics)\b/.test(sentence)
    && /\b(?:export\w*|import\w*|comercio de (?:productos|bienes)|superavit\w*|goods trade|trade surplus)\b/.test(sentence)
    && !/\b(?:population|poblacion|housing|vivienda|censo demografico|services?|servicios)\b/.test(sentence));
}

const inert = new Set(['script', 'style', 'template', 'noscript', 'textarea', 'title', 'svg', 'math']);
const hidden = node => node.attribs && ('hidden' in node.attribs || node.attribs['aria-hidden'] === 'true'
  || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(node.attribs.style || ''));
function liveNodes(node, result = []) {
  if (inert.has(node.name) || hidden(node)) return result;
  result.push(node);
  for (const child of node.children || []) liveNodes(child, result);
  return result;
}
const textOf = node => inert.has(node.name) || hidden(node) ? ''
  : clean(node.type === 'text' ? node.data : (node.children || []).map(textOf).join(' '));
const isElement = node => Boolean(node.name);
const validClose = (node, html, tag) => new RegExp(`</${tag}\\s*>$`, 'i')
  .test(html.slice(node.startIndex, node.endIndex + 1));

function monthValue(value) {
  const match = clean(value).match(/^([A-Z][a-z]+) (20\d{2})$/);
  const month = match ? MONTHS.indexOf(match[1]) : -1;
  return month < 0 ? null : { year: Number(match[2]), month, ordinal: Number(match[2]) * 12 + month };
}
function releaseDate(value, day) {
  const match = clean(value).match(/^([A-Z][a-z]+) (\d{1,2}), (20\d{2})$/);
  const month = match ? MONTHS.indexOf(match[1]) : -1;
  if (month < 0) return null;
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[2])));
  if (date.getUTCFullYear() !== Number(match[3]) || date.getUTCMonth() !== month
      || date.getUTCDate() !== Number(match[2]) || DAYS[date.getUTCDay()] !== day) return null;
  return date.toISOString().slice(0, 10);
}

// Parse the complete, uniquely headed FT900 table before selecting one whole
// calendar row. A layout or qualification we do not understand adds no evidence.
export async function parseCensusCalendar(html, now) {
  if (typeof html !== 'string' || Buffer.byteLength(html) > 256 * 1024
      || !(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  // Already locked by Eleventy; declared directly so this parser has its own contract.
  // Lazy loading keeps unrelated isolated pipeline fixtures dependency-free.
  const { parseDocument } = await import('htmlparser2');
  const document = parseDocument(html, { decodeEntities: true, withStartIndices: true, withEndIndices: true });
  const headings = liveNodes(document).filter(node => node.name === 'h2' && textOf(node) === HEADING);
  if (headings.length !== 1 || !validClose(headings[0], html, 'h2')) return null;
  const heading = headings[0];
  const siblings = heading.parent?.children || [];
  const section = [];
  for (const node of siblings.slice(siblings.indexOf(heading) + 1)) {
    if (/^h[1-6]$/.test(node.name || '')) break;
    section.push(node);
  }
  const tables = section.filter(node => node.name === 'table');
  if (tables.length !== 1 || !validClose(tables[0], html, 'table')) return null;
  const table = tables[0];
  // No unseen notes before/after the table may qualify a selected date.
  if (section.filter(node => node !== table).some(node => {
    if (node.type === 'comment') return false;
    return !['', 'Monthly Press Release Schedule'].includes(textOf(node))
      || (isElement(node) && !['strong', 'hr'].includes(node.name));
  })) return null;
  const nodes = liveNodes(table);
  const allowed = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'div', 'span', 'p', 'strong', 'em', 'br']);
  const allNodes = [];
  const visit = node => { allNodes.push(node); for (const child of node.children || []) visit(child); };
  visit(table);
  const attributes = new Set(['style', 'align', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'width', 'scope', 'class', 'id']);
  if (allNodes.some(node => isElement(node) && (!allowed.has(node.name) || hidden(node)))
      || allNodes.some(node => Object.keys(node.attribs || {}).some(name => !attributes.has(name)))
      || allNodes.some(node => /\bcontent\s*:/i.test(node.attribs?.style || ''))
      || nodes.filter(node => node.name === 'table').length !== 1) return null;
  if (allNodes.some(node =>
    (['tr', 'td', 'th'].includes(node.name) && !validClose(node, html, node.name))
    ||
    (['td', 'th'].includes(node.name) && node.parent?.name !== 'tr')
    || (node.name === 'tr' && !['table', 'thead', 'tbody', 'tfoot'].includes(node.parent?.name))
    || (['thead', 'tbody', 'tfoot'].includes(node.name) && node.parent !== table))) return null;
  if (allNodes.some(node => {
    if (node.type !== 'text' || !clean(node.data)) return false;
    for (let parent = node.parent; parent && parent !== table; parent = parent.parent) {
      if (['td', 'th'].includes(parent.name)) return false;
    }
    return true;
  })) return null;
  const rows = nodes.filter(node => node.name === 'tr');
  if (rows.length < 3 || rows.length > 38) return null;
  const cells = row => (row.children || []).filter(node => ['td', 'th'].includes(node.name));
  const header = cells(rows[0]);
  if (header.length !== 3 || header.some(node => node.name !== 'th')
      || header.map(textOf).join('|') !== 'Statistical Month|Data Release|Day') return null;
  const entries = [];
  let previousMonth = null;
  let previousDate = '';
  for (const row of rows.slice(1, -1)) {
    const fields = cells(row);
    if (fields.length !== 3 || fields.some(node => node.name !== 'td')) return null;
    const [statisticalMonth, release, day] = fields.map(textOf);
    const period = monthValue(statisticalMonth);
    if (!period || (previousMonth !== null && period.ordinal !== previousMonth + 1)) return null;
    previousMonth = period.ordinal;
    const unknown = release === 'TBD' && day === 'TBD';
    const date = unknown ? null : releaseDate(release, day);
    if (!unknown && (!date || date <= previousDate
        || date <= new Date(Date.UTC(period.year, period.month + 1, 0)).toISOString().slice(0, 10))) return null;
    if (date) previousDate = date;
    entries.push({ statisticalMonth, release, day, date });
  }
  const footer = cells(rows.at(-1)).map(textOf);
  if (footer.length !== 3 || !/^All releases occur at 8:30\s*a\.?m\.? \(Eastern\)$/.test(footer[0])
      || footer[1] !== 'TBD - To Be Determined' || footer[2] !== '') return null;
  const eastern = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  const clock = `${eastern.year}-${eastern.month}-${eastern.day}T${eastern.hour}:${eastern.minute}`;
  for (const entry of entries) {
    if (!entry.date) return null; // Never skip an earlier unknown entry to manufacture a next date.
    if (`${entry.date}T08:30` <= clock) continue;
    const text = `${HEADING}. Scheduled calendar entry. Statistical Month: ${entry.statisticalMonth}. Data Release: ${entry.release}. Day: ${entry.day}. ${footer[0]}.`;
    if (text.length > 2200) return null;
    return { id: 'calendar:census-ft900', kind: 'calendar', source: 'U.S. Census Bureau', url: CENSUS_CALENDAR_URL, text };
  }
  return null;
}

export function createCensusCalendarLoader({ now, fetchText = fetchBoundedText } = {}) {
  const editionTime = now instanceof Date ? new Date(now) : new Date(NaN);
  let pending;
  return async (item, lead, locatedBody) => {
    if (!Number.isFinite(editionTime.getTime()) || !censusTradeCalendarEligible(item, lead, locatedBody)) return null;
    pending ||= (async () => {
      try {
        const result = await fetchText(CENSUS_CALENDAR_URL, {
          allowedHosts: ['www.census.gov', 'census.gov'], timeoutMs: 10000, maxBytes: 256 * 1024,
          headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' },
        });
        if (result.url !== CENSUS_CALENDAR_URL) return null;
        return await parseCensusCalendar(result.text, editionTime);
      } catch { return null; }
    })();
    const record = await pending;
    return record ? { ...record } : null;
  };
}
