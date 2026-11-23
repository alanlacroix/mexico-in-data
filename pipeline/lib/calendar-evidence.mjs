import crypto from 'node:crypto';

// Calendar anchors help order candidate events. They are not necessarily dates
// established by the source. Keep uncertainty in text: the independent audit
// deliberately receives only evidence IDs and text, not calendar metadata.
export const CALENDAR_DATE_CONTRACT = 'Preserve calendar date precision and uncertainty in both languages. An approximate calendar estimate is not a confirmed date. A year-only calendar record supports that year, not a month or day. Reject any more precise or certain date unless another cited source explicitly establishes it. A publisher timestamp dates the article, not the reported event. Do not convert a relative event day into the publication date. Distinguish a statement made by a litigant in court from a ruling or admission by the court itself; preserve who said what and any contested facts.';

export function calendarEvidenceRecord(event) {
  const approximate = event.approx === true;
  const yearOnly = event.datePrecision === 'year';
  const date = yearOnly ? String(event.date).slice(0, 4) : event.date;
  const timing = yearOnly
    ? `${date} (year only; exact month and day are not established by this calendar source)`
    : approximate ? `${date} (approximate scheduling estimate, not a confirmed exact date)` : date;
  // Do not leak a placeholder month/day through the ID either. Hash the event
  // identity, not its sorting date, so shifting an approximate anchor is harmless.
  const id = approximate || yearOnly
    ? `estimate-${crypto.createHash('sha256').update(JSON.stringify([event.id || '', event.label, event.sourceUrl])).digest('hex').slice(0, 16)}`
    : event.id || event.date;
  return {
    id: `calendar:${id}`, kind: 'calendar', source: event.source, url: event.sourceUrl,
    text: `${timing}: ${event.label}. ${event.mechanism || ''}`,
  };
}

const MONTHS = [
  ['january', 'enero'], ['february', 'febrero'], ['march', 'marzo'], ['april', 'abril'],
  ['may', 'mayo'], ['june', 'junio'], ['july', 'julio'], ['august', 'agosto'],
  ['september', 'septiembre'], ['october', 'octubre'], ['november', 'noviembre'], ['december', 'diciembre'],
];
function dateClaims(text) {
  const claims = [];
  const value = String(text || '');
  for (const match of value.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    claims.push({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), start: match.index, end: match.index + match[0].length });
  }
  for (const [index, names] of MONTHS.entries()) {
    // Capitalized English May avoids treating the modal verb as a month.
    const name = names[0] === 'may' ? '(?:May|[Mm][Aa][Yy][Oo])' : `(?:${names.join('|')})`;
    const flags = names[0] === 'may' ? 'g' : 'gi';
    const pattern = new RegExp(`\\b(?:(\\d{1,2})(?:st|nd|rd|th)?(?: de)?\\s+)?${name}\\b(?:\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d))?(?:(?:,?\\s+| de | del )(20\\d{2}))?`, flags);
    for (const match of value.matchAll(pattern)) {
      claims.push({ month: index + 1, day: Number(match[1] || match[2]) || null, year: Number(match[3]) || null, start: match.index, end: match.index + match[0].length });
    }
  }
  return claims;
}
const supports = (source, claim) => source.month === claim.month
  && (!claim.day || source.day === claim.day) && (!claim.year || source.year === claim.year);

// Scope this additional guard to fields citing uncertain calendar records. Date
// tokens need their own support, not unrelated numbers elsewhere in the packet.
export function calendarDateFlags(text, evidence) {
  const uncertain = evidence.filter(record => record.kind === 'calendar'
    && /\(year only;|\(approximate scheduling estimate,/.test(record.text));
  if (!uncertain.length) return [];
  const independent = evidence.filter(record => !uncertain.includes(record)).flatMap(record => dateClaims(record.text));
  const claims = dateClaims(text);
  const estimates = uncertain.filter(record => record.text.includes('(approximate scheduling estimate,'))
    .flatMap(record => dateClaims(record.text));
  // A qualifier must belong to this date phrase, not another claim in the field.
  const qualified = claim => /\b(?:approximately|approximate|tentatively|tentative|estimated|around|aproximad[oa](?:mente)?|tentativ[oa]|estimad[oa])\s+(?:(?:on|in|for|the|el|en|para|de|scheduled)\s+){0,3}$/i
    .test(String(text).slice(Math.max(0, claim.start - 80), claim.start));
  return claims.some(claim => !independent.some(source => supports(source, claim))
    && !(qualified(claim) && estimates.some(source => supports(source, claim))))
    ? ['calendar date precision or certainty is unsupported'] : [];
}

// El País timestamps are still present in the located article bodies. A matching
// month and day there alone are not evidence that the reported event occurred then.
// Scope this fail-closed rule to the publisher's observed, unambiguous masthead.
const elPaisStamp = () => /\s-\s(\d{1,2}\s+\p{L}{3}\s+20\d{2})\s-\s\d{1,2}:\d{2}\s(?:CET|CEST|CST|CDT)\b/giu;
const shortEs = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function elPaisDates(record) {
  if (record?.kind !== 'article-body' && record?.kind !== 'prior-article-body') return [];
  try {
    if (!['elpais.com','www.elpais.com'].includes(new URL(record.url).hostname)) return [];
    return [...String(record.text || '').matchAll(elPaisStamp())].flatMap(match => {
      const [day, month, year] = match[1].toLowerCase().split(/\s+/);
      const monthNumber = shortEs.indexOf(month) + 1;
      return monthNumber && Number(day) >= 1 && Number(day) <= 31
        ? [{ day: Number(day), month: monthNumber, year: Number(year) }] : [];
    });
  } catch { return []; }
}
export function publicationDateFlags(text, evidence) {
  const dates = evidence.flatMap(elPaisDates);
  if (!dates.length) return [];
  const body = evidence.filter(record => ['article-body','prior-article-body'].includes(record.kind))
    .flatMap(record => dateClaims(elPaisDates(record).length
      ? String(record.text || '').replace(elPaisStamp(), ' ') : record.text));
  const value = String(text || '');
  const publicationVerb = claim => /\b(?:published|reported|public[oó]|inform[oó]|publicad[oa])(?:\s+(?:on|el))?\s*$/iu
    .test(value.slice(Math.max(0, claim.start - 28), claim.start));
  return dateClaims(value).some(claim => claim.day && dates.some(date => supports(date, claim))
    && !body.some(date => supports(date, claim)) && !publicationVerb(claim))
    ? ['event date is supported only by an article publication timestamp'] : [];
}
