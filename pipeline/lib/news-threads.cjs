const { editorialDay } = require('./news-day.cjs');

const clean = (value) => String(value || '').trim();
const HOUR = 60 * 60 * 1000;
const THREAD_WINDOW_HOURS = 72;

// A report date is not an event id. Different outlets regularly publish the same
// development on opposite sides of midnight, and English rewrites can make their
// headlines look less similar than the originals. Normalize the small set of entities,
// actions and objects that recur in Mexico coverage before comparing reports.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'after', 'before', 'by', 'de', 'del', 'el', 'en',
  'for', 'from', 'in', 'la', 'las', 'los', 'more', 'of', 'on', 'para', 'por', 'que',
  'the', 'to', 'tras', 'un', 'una', 'with', 'year', 'years',
]);

const ALIASES = [
  [/\b(?:united states of america|united states|estados unidos|ee\s*uu|eua|u\s*s\s*a?)\b/g, ' usa '],
  [/\b(?:mexican[oa]?s?|mexicanos?|mexicanas?)\b/g, ' mexico '],
  [/\b(?:usmca|t\s*mec|tmec)\b/g, ' usmca '],
  [/\b(?:lifts?|lifted|removes?|removed|eases?|eased)\s+(?:the\s+)?(?:ban|restrictions?)\b/g, ' reopen '],
  [/\b(?:reopens?|reopened|reopening|opens?|opened|opening|resumes?|resumed|resuming|restores?|restored|reabre|reabrio|reanuda|reanudo|retoma|retomo)\b/g, ' reopen '],
  [/\b(?:closes?|closed|closing|shuts?|shutdown|suspends?|suspended|suspende|suspendio|blocks?|blocked|blocking)\b/g, ' close '],
  [/\b(?:bans?|banned|prohibition|suspension|veda|restrictions?)\b/g, ' restriction '],
  [/\b(?:imports?|imported|importing|importacion|importaciones)\b/g, ' import '],
  [/\b(?:exports?|exported|exporting|exportacion|exportaciones)\b/g, ' export '],
  [/\b(?:cattle|livestock|ganado|bovinos?)\b/g, ' cattle '],
  [/\b(?:border|frontera)\b/g, ' border '],
  [/\b(?:screwworm|gusano barrenador)\b/g, ' screwworm '],
  [/\b(?:jobs?|employment|empleos?|puestos de trabajo)\b/g, ' job '],
  [/\b(?:investments?|investing|inversion|inversiones)\b/g, ' invest '],
  [/\b(?:approves?|approved|approval|aprueba|aprobo)\b/g, ' approve '],
  [/\b(?:rejects?|rejected|rejection|rechaza|rechazo)\b/g, ' reject '],
  [/\b(?:raises?|raised|raising|increases?|increased|aumenta|sube)\b/g, ' raise '],
  [/\b(?:cuts?|cutting|lowers?|lowered|reduces?|reduced|recorta|baja)\b/g, ' cut '],
  [/\b(?:delays?|delayed|postpones?|postponed|aplaza|pospone)\b/g, ' delay '],
  [/\b(?:launches?|launched|launching|starts?|started|starting|inicia|arranca)\b/g, ' start '],
  [/\b(?:cancels?|cancelled|canceled|ends?|ended|terminates?|terminated|cancela|termina)\b/g, ' stop '],
  [/\b(?:signs?|signed|signing|firma|firmo)\b/g, ' sign '],
  [/\b(?:announces?|announced|announcement|anuncia|anuncio)\b/g, ' announce '],
];

const folded = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalize = (value) => {
  const original = folded(value);
  // Mexican publishers commonly abbreviate Estados Unidos as “EU”. Only apply that
  // ambiguous alias when the surrounding headline is plainly Spanish and Mexico-facing;
  // an English “EU” must continue to mean the European Union.
  const spanishEuMeansUs = /\bEU\b/.test(original)
    && /\b(?:mexic|ganad|frontera|importaci|exportaci|arancel|barrenador)\w*/i.test(original);
  let text = original.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  if (spanishEuMeansUs) text = text.replace(/\beu\b/g, ' usa ');
  // “Allows/authorizes cattle imports” describes the same state change as “reopens”.
  // Keep this contextual: an approval in an unrelated headline must not become a border reopening.
  if (/\b(?:allows?|allowed|authorizes?|authorized)\b/.test(text)
      && /\b(?:cattle|livestock|ganado|bovinos?)\b/.test(text)
      && /\b(?:imports?|importacion|importaciones)\b/.test(text)) {
    text = text.replace(/\b(?:allows?|allowed|authorizes?|authorized)\b/g, ' reopen ');
  }
  for (const [pattern, replacement] of ALIASES) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, ' ').trim();
};

const words = (value) => new Set(normalize(value).split(' ')
  .filter((word) => word.length > 2 && !STOPWORDS.has(word)));
const intersectionSize = (a, b) => {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared;
};
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  const shared = intersectionSize(a, b);
  return shared / (a.size + b.size - shared);
};
const overlap = (a, b) => {
  if (!a.size || !b.size) return 0;
  return intersectionSize(a, b) / Math.min(a.size, b.size);
};

const titleOf = (event) => clean(event && (event.h1 || event.headline || event.title));
const contextOf = (event) => [event && (event.summary || event.dek), event && (event.context || event.why)]
  .filter(Boolean).join(' ');
const publishedAt = (event) => Date.parse(event && (event.publishedAt || event.published_at || event.date)) || 0;
const hasImage = (event) => /^https:\/\//i.test(clean(event && event.image));
const isFirstParty = (event) => /(?:\.gob\.mx|inegi\.org\.mx|banxico\.org\.mx|ustr\.gov|whitehouse\.gov|dof\.gob\.mx)/i.test(clean(event && event.url));

const ACTIONS = new Set(['reopen', 'close', 'approve', 'reject', 'raise', 'cut', 'delay', 'start', 'stop', 'sign', 'announce']);
// These words are useful English but weak event identifiers. Cross-day clustering needs
// shared subject matter beyond a country, a generic action, or the fact that money exists.
const GENERIC_EVENT_WORDS = new Set([
  'announce', 'agreement', 'billion', 'company', 'deal', 'dollar', 'federal',
  'government', 'infrastructure', 'invest', 'investment', 'million', 'mexico',
  'network', 'plan', 'project', 'projects', 'state', 'usa',
]);
const OPPOSITES = [['reopen', 'close'], ['approve', 'reject'], ['raise', 'cut'], ['start', 'stop']];
const actionWords = (set) => new Set([...set].filter((word) => ACTIONS.has(word)));
const distinctiveWords = (set) => new Set([...set]
  .filter((word) => !ACTIONS.has(word) && !GENERIC_EVENT_WORDS.has(word)));
const conflictingActions = (a, b) => OPPOSITES.some(([left, right]) =>
  (a.has(left) && b.has(right)) || (a.has(right) && b.has(left)));

const numericClaims = (value) => {
  const text = folded(value).toLowerCase().replace(/,/g, '');
  const claims = new Set();
  const rx = /(?:us\$|mxn\s*|\$\s*)?(\d+(?:\.\d+)?)\s*(billion|bn|million|mn|megawatt[ -]?hours?|mwh|megawatts?|mw|kilometers?|kilometres?|km|percent|%)/g;
  let match;
  while ((match = rx.exec(text))) {
    let valueNumber = Number(match[1]);
    let unit = match[2];
    if (unit === 'billion' || unit === 'bn') { valueNumber *= 1000; unit = 'money-mn'; }
    else if (unit === 'million' || unit === 'mn') unit = 'money-mn';
    else if (/^(?:megawatt|mw)/.test(unit) && !/hour|mwh/.test(unit)) unit = 'mw';
    else if (/hour|mwh/.test(unit)) unit = 'mwh';
    else if (/kilometer|kilometre|km/.test(unit)) unit = 'km';
    else unit = 'percent';
    claims.add(`${unit}:${valueNumber}`);
  }
  return claims;
};
const conflictingNumericClaims = (a, b) => {
  const byUnit = (claims) => {
    const map = new Map();
    for (const claim of claims) {
      const [unit] = claim.split(':');
      if (!map.has(unit)) map.set(unit, new Set());
      map.get(unit).add(claim);
    }
    return map;
  };
  const left = byUnit(numericClaims(titleOf(a)));
  const right = byUnit(numericClaims(titleOf(b)));
  for (const [unit, claims] of left) {
    if (!right.has(unit)) continue;
    if (![...claims].some((claim) => right.get(unit).has(claim))) return true;
  }
  return false;
};
const eventDay = (event) => clean(event && event.date)
  || editorialDay(event && (event.publishedAt || event.published_at));
const sameEditorialDay = (a, b) => !!eventDay(a) && eventDay(a) === eventDay(b);
const withinThreadWindow = (a, b) => {
  const ta = publishedAt(a), tb = publishedAt(b);
  if (ta && tb) return Math.abs(ta - tb) <= THREAD_WINDOW_HOURS * HOUR;
  const da = Date.parse(`${clean(a && a.date)}T12:00:00Z`);
  const db = Date.parse(`${clean(b && b.date)}T12:00:00Z`);
  return Number.isFinite(da) && Number.isFinite(db) && Math.abs(da - db) <= THREAD_WINDOW_HOURS * HOUR;
};

function sameThread(a, b) {
  if (!a || !b) return false;
  if (clean(a.url) && clean(a.url) === clean(b.url)) return true;
  if (clean(a.id) && clean(a.id) === clean(b.id)) return true;
  if (!withinThreadWindow(a, b)) return false;

  const titleA = words(titleOf(a));
  const titleB = words(titleOf(b));
  const actionsA = actionWords(titleA);
  const actionsB = actionWords(titleB);
  if (conflictingActions(actionsA, actionsB)) return false;
  if (conflictingNumericClaims(a, b)) return false;

  const sharedTitle = intersectionSize(titleA, titleB);
  const titleJaccard = jaccard(titleA, titleB);
  const titleOverlap = overlap(titleA, titleB);
  const sharedAction = intersectionSize(actionsA, actionsB) > 0;
  const anchorsA = distinctiveWords(titleA);
  const anchorsB = distinctiveWords(titleB);
  const sharedAnchors = intersectionSize(anchorsA, anchorsB);

  // Strong paraphrases of one event, including adjacent-day and bilingual reports. Two
  // generic investment announcements are not one event merely because both say “Mexico”,
  // “billion” and “network”; at least two subject anchors must survive normalization.
  if (sharedAnchors >= 2 && sharedTitle >= 4 && titleJaccard >= 0.72) return true;
  if (sharedAction && sharedAnchors >= 2 && sharedTitle >= 4 && titleOverlap >= 0.58) return true;

  // When the headlines take different angles, require the same action plus substantial
  // supporting overlap in the summaries. This remains intentionally conservative.
  const bodyA = words([titleOf(a), contextOf(a)].filter(Boolean).join(' '));
  const bodyB = words([titleOf(b), contextOf(b)].filter(Boolean).join(' '));
  const bodyAnchorsA = distinctiveWords(bodyA);
  const bodyAnchorsB = distinctiveWords(bodyB);
  if (sharedAction && intersectionSize(bodyAnchorsA, bodyAnchorsB) >= 3
      && intersectionSize(bodyA, bodyB) >= 6 && overlap(bodyA, bodyB) >= 0.58) return true;

  // Keep the prior same-day behavior for very close headlines and two reports on the
  // same USMCA meeting. These looser rules never cross into another reporting day.
  if (sameEditorialDay(a, b) && sharedAnchors >= 2 && titleJaccard >= 0.5) return true;
  const normalizedA = normalize(titleOf(a));
  const normalizedB = normalize(titleOf(b));
  const usmcaReview = (title) => /\busmca\b/.test(title)
    && /\breview\b/.test(title)
    && /\b(?:talks?|round|meeting|advance|progress)\b/.test(title);
  if (sameEditorialDay(a, b) && usmcaReview(normalizedA) && usmcaReview(normalizedB)) return true;
  const companyA = normalize(a.company), companyB = normalize(b.company);
  return sameEditorialDay(a, b) && !!companyA && companyA === companyB
    && intersectionSize(bodyAnchorsA, bodyAnchorsB) >= 2 && jaccard(bodyA, bodyB) >= 0.25;
}

function coverageRecord(event) {
  if (!event || !clean(event.url)) return null;
  const eventPublishedAt = clean(event.publishedAt || event.published_at);
  return {
    source: clean(event.source || event.sourceName),
    url: clean(event.url),
    publishedAt: eventPublishedAt,
    date: clean(event.date) || editorialDay(eventPublishedAt),
    title: titleOf(event),
    summary: clean(event.summary || event.dek || event.why || event.context),
  };
}

function mergeCoverage(...groups) {
  const byUrl = new Map();
  for (const group of groups.flat()) {
    const record = coverageRecord(group);
    if (!record) continue;
    const prior = byUrl.get(record.url);
    if (!prior || Date.parse(record.publishedAt) > Date.parse(prior.publishedAt)) byUrl.set(record.url, record);
  }
  return [...byUrl.values()].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
}

function coverageForDay(day, ...groups) {
  return mergeCoverage(...groups).filter((source) => {
    const sourceDay = clean(source.date) || editorialDay(source.publishedAt);
    return sourceDay === day;
  });
}

function preferred(a, b) {
  const timeA = publishedAt(a), timeB = publishedAt(b);
  if (timeA !== timeB) return timeA > timeB ? a : b;
  if (isFirstParty(a) !== isFirstParty(b)) return isFirstParty(a) ? a : b;
  const completeA = ['background', 'view', 'prediction', 'implications', 'next'].filter((field) => clean(a && a[field])).length;
  const completeB = ['background', 'view', 'prediction', 'implications', 'next'].filter((field) => clean(b && b[field])).length;
  if (completeA !== completeB) return completeA > completeB ? a : b;
  if ((a.importance || 0) !== (b.importance || 0)) return (a.importance || 0) > (b.importance || 0) ? a : b;
  if (hasImage(a) !== hasImage(b)) return hasImage(a) ? a : b;
  return a;
}

function memberReports(event) {
  const reports = [event, ...(Array.isArray(event && event.coverage) ? event.coverage : [])].filter(Boolean);
  const unique = new Map();
  for (const report of reports) {
    const key = clean(report.url) || `${titleOf(report)}|${clean(report.publishedAt || report.published_at || report.date)}`;
    if (!unique.has(key)) unique.set(key, report);
  }
  return [...unique.values()];
}

function groupEvents(events) {
  const groups = [];
  for (const event of events.filter(Boolean)) {
    const reports = memberReports(event);
    // Match every report already in a cluster, not only its display representative. This
    // makes clustering transitive and independent of input order (A~B and B~C => A/B/C).
    // Stored source coverage participates too, so a later report can match either angle.
    const matches = groups.filter((candidate) => candidate.members.some((member) =>
      reports.some((report) => sameThread(member, report))));
    // Coverage belongs to the event, not to one publisher's calendar day.
    const eventCoverage = mergeCoverage(event, event.coverage || []);
    if (!matches.length) {
      groups.push({ event, members: reports, coverage: eventCoverage, importance: event.importance || 0 });
      continue;
    }
    const group = matches[0];
    const absorbed = matches.slice(1);
    for (const other of absorbed) {
      group.members.push(...other.members);
      group.coverage = mergeCoverage(group.coverage, other.coverage);
      group.importance = Math.max(group.importance || 0, other.importance || 0);
      const winner = preferred(group.event, other.event);
      const alternate = winner === group.event ? other.event : group.event;
      group.event = { ...winner };
      if (!hasImage(group.event) && hasImage(alternate)) group.event.image = alternate.image;
      groups.splice(groups.indexOf(other), 1);
    }
    const prior = group.event;
    const winner = preferred(prior, event);
    const alternate = winner === prior ? event : prior;
    group.event = { ...winner };
    // A newer text report should define the card, but it should not discard a useful
    // image already attached to another report of the same event.
    if (!hasImage(group.event) && hasImage(alternate)) group.event.image = alternate.image;
    group.members.push(...reports);
    group.coverage = mergeCoverage(group.coverage, eventCoverage);
    group.importance = Math.max(group.importance || 0, event.importance || 0);
  }
  return groups.map((group) => ({ ...group, sourceCount: group.coverage.length || 1 }));
}

module.exports = {
  THREAD_WINDOW_HOURS,
  coverageForDay,
  coverageRecord,
  groupEvents,
  jaccard,
  mergeCoverage,
  normalize,
  sameThread,
};
