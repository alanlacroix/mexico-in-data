// One weekly selection lane per section + "The week's five" (design ruling
// 2026-08-01, Alan ratified). Inputs and contract:
//   1. Curated lane: happening.json events via latestStories.js — resolved real
//      publisher, BE context, pipeline importance. Ranks first when fresh.
//   2. Ledger lane: collect-news items from named outlets (never
//      news.google.com, never aggregator tier), tier-then-recency. The fallback
//      that keeps the page alive when the curation pass is stale.
// THE WEEK'S FIVE (chapter two's lead): cross-section, ranked by WEIGHT so the
// "if you missed a day" head stays a promise, not a lie (design risk #3):
// corroboration first (the same story carried by 2+ named outlets), then source
// tier. Deduped against TODAY's digest ("not already shown above") and spread
// across sections. Short weeks say so instead of padding.
const fs = require('node:fs');
const path = require('node:path');
const latestStories = require('./latestStories.js');
const dailyBrief = require('./dailyBrief.js');

const SECTIONS = [
  { key: 'payments', label: 'Payments & fintech', href: '/payments.html', beats: ['fintech'], curated: [] },
  { key: 'deals', label: 'Deals & investment', href: '/deals.html', beats: ['deals'], curated: [] },
  { key: 'economy', label: 'Economy & money', href: '/economy.html', beats: ['economy', 'companies'], curated: ['economy'] },
  {
    key: 'usmexico', label: 'US & Mexico', href: '/us-mexico.html', beats: ['us-mexico'], curated: ['us-mexico'],
    match: /\bt-?mec\b|\busmca\b|arancel|tariff|washington|casa blanca|white house|frontera con estados unidos|comercio bilateral|secci[oó]n 301|\bustr\b|deportaci|remesas hacia m[eé]xico/i,
  },
  { key: 'politics', label: 'Politics', href: '/politics.html', beats: ['politics'], curated: ['politics'] },
  {
    key: 'society', label: 'Security & society', href: '/society.html', beats: ['society', 'security'], curated: ['society'],
    match: /\bc[aá]rtel\b|crimen organizado|narcotr[aá]fico|homicid|violencia|extorsi[oó]n|secuestr|desaparecid|fentanil|huachicol|seguridad p[uú]blica|guardia nacional/i,
  },
  { key: 'energy', label: 'Energy & infrastructure', href: '/energy.html', beats: ['energy'], curated: [] },
];
const TIER_W = { 1: 3, specialist: 3, 2: 2 };
// Roughly five a section. A soft rule: the point of the week is a read, not the archive.
const SECTION_CAP = 5;
const CHINA = /\bchinas?\b|\bchinos?\b|\bchina\b|beijing|\bbyd\b|transbordo|triangulaci[oó]n/i;

const isoWeek = (dt) => {
  const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return d.getUTCFullYear() + '-W' + String(Math.ceil((((d - ys) / 86400000) + 1) / 7)).padStart(2, '0');
};
const words = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9áéíóúñü]+/g, ' ').split(' ').filter((w) => w.length > 3));
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const w of a) if (b.has(w)) i++; return i / (a.size + b.size - i); };
const parseWhen = (iso) => Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T12:00:00Z' : iso);
const dateLabel = (iso) => new Date(parseWhen(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayLabel = (iso) => new Date(parseWhen(iso)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

module.exports = function () {
  const now = new Date();
  const dir = path.join(__dirname, '..', 'data', 'news');
  const read = (w) => { try { return JSON.parse(fs.readFileSync(path.join(dir, w + '.json'), 'utf8')); } catch { return []; } };
  const ledger = [...read(isoWeek(now)), ...read(isoWeek(new Date(now.getTime() - 7 * 864e5)))];
  const fresh = (iso, days) => { const t = parseWhen(iso); return Number.isFinite(t) && t >= now.getTime() - days * 864e5; };

  // Alan's declared reading interests, the same rules the brief ranks with, so the
  // "My topics" filter means one thing on both homepage lanes.
  const interestRules = (() => {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'interests.json'), 'utf8'));
      return (doc.interests || []).flatMap((interest) => {
        try { return [{ tag: interest.tag, pattern: new RegExp(interest.pattern, 'i') }]; }
        catch { return []; }
      });
    } catch { return []; }
  })();
  const tagsFor = (item) => interestRules
    .filter((rule) => rule.pattern.test(`${item.title} ${item.dek || ''}`))
    .map((rule) => rule.tag);

  // Written by pipeline/write-why.mjs: the explanation that lets a wire story onto the
  // page at all. Without one the item is cut, which is the contract the redesign runs on.
  const whys = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, 'why.json'), 'utf8')); }
    catch { return {}; }
  })();

  const translations = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, 'translations.json'), 'utf8')); }
    catch { return {}; }
  })();
  const englished = (item) => {
    const hit = translations[item.url];
    if (!hit || !hit.title) return item;
    return { ...item, title: hit.title, dek: hit.dek || item.dek, originalTitle: hit.originalTitle || item.title };
  };

  // Boilerplate is stripped; nothing is cut. A card never ends in an ellipsis.
  const trim = (s) => String(s || '').replace(/\s*(The post |El art[ií]culo |La entrada ).*$/i, '').trim();

  // Today's digest — chapter two must never reprint it ("not already shown above").
  // The rendered key developments are the ones a reader has already passed on the way
  // down, so those are what this must be measured against.
  const brief = dailyBrief();
  const today = brief.stories || brief.todayStories || [];
  const todayUrls = new Set(today.map((s) => s.url));
  const todayWords = today.map((s) => words(s.title));
  const shownToday = (item) => todayUrls.has(item.url) || todayWords.some((w) => jaccard(w, words(item.title)) >= 0.5);

  // Curated lane (≤7 days, real publisher).
  const curatedAll = latestStories().filter((s) => fresh(s.date, 7) && s.source && !/google news/i.test(s.source));
  const curatedItem = (s) => ({
    title: s.title, url: s.url, sourceName: s.source, domain: s.source, dek: trim(s.summary),
    date: s.date, dateLabel: dateLabel(s.date), dayLabel: dayLabel(s.date), curated: true,
    bg: s.bg || '', drivers: s.drivers || '', implications: s.implications || '', next: s.next || '',
    be: Boolean(s.bg && s.drivers && s.implications),
  });

  // Ledger lane (named outlets only).
  const showable = ledger.filter((x) => x && x.title && x.url && x.source !== 'news.google.com' && x.tier !== 'aggregator');
  const rank = (xs) => xs.sort((a, b) => (TIER_W[b.tier] || 1) - (TIER_W[a.tier] || 1) || String(b.published_at).localeCompare(String(a.published_at)));
  const pool = rank(showable.filter((x) => fresh(x.published_at, 7)));
  const themePool = rank(showable.filter((x) => fresh(x.published_at, 14)));
  const ledgerItem = (raw) => {
    const x = englished(raw);
    const authored = whys[x.url] || {};
    return {
    title: x.title,
    // Kept so the card can show the original headline under the translation and tag it ES.
    originalTitle: x.originalTitle || '', url: x.url, sourceName: x.sourceName || x.source, domain: x.source, dek: trim(x.dek),
    date: x.published_at, dateLabel: dateLabel(x.published_at), dayLabel: dayLabel(x.published_at),
    curated: false, bg: '', drivers: '', implications: '',
    view: authored.why || '', next: authored.watch || '',
    be: Boolean(authored.why),
    };
  };

  const merge = (curated, ledgerItems, cap) => {
    const kept = [], perDom = {};
    for (const it of [...curated, ...ledgerItems]) {
      if ((perDom[it.domain] || 0) >= 2) continue;
      if (kept.some((k) => jaccard(words(k.title), words(it.title)) >= 0.5)) continue;
      kept.push(it); perDom[it.domain] = (perDom[it.domain] || 0) + 1;
      if (kept.length >= cap) break;
    }
    return kept;
  };

  // Per-section rooms (section pages + homepage By-section chips).
  const rooms = {}; const groups = [];
  const sectionOf = new Map();
  // Two lanes are fed mostly by search queries we never publish, so their beat is
  // almost always empty while the stories themselves arrive tagged as economy or
  // politics. Route on subject first, beat second, the way build-areas.js does, and
  // give every item exactly one home so a toggle never shows the same headline twice.
  const claimed = new Set();
  // A story the curation pass already resolved keeps its curated card, with the BE
  // context attached, instead of appearing a second time as a raw wire item.
  const curatedUrls = new Set(curatedAll.map((s) => s.url));
  const sectionFor = (x) => {
    const text = `${x.title} ${x.dek || ''}`;
    const bySubject = SECTIONS.find((sec) => sec.match && sec.match.test(text));
    if (bySubject) return bySubject.key;
    const byBeat = SECTIONS.find((sec) => sec.beats.includes(x.beat));
    return byBeat ? byBeat.key : null;
  };

  for (const sec of SECTIONS) {
    const curated = curatedAll
      .filter((s) => sec.curated.includes(s.topic === 'us-mexico' ? 'us-mexico' : s.topic) && !claimed.has(s.url))
      .map(curatedItem);
    const mech = pool.filter((x) => !claimed.has(x.url) && !curatedUrls.has(x.url) && sectionFor(x) === sec.key)
      .map((x) => { claimed.add(x.url); return ledgerItem(x); });
    // Shaped for the homepage storyCard macro as well as the section rooms, so both
    // surfaces render one card definition instead of two that can drift apart.
    const items = merge(curated, mech, SECTION_CAP).map((it) => ({
      ...it,
      shownToday: shownToday(it),
      interestTags: tagsFor(it),
      topic: sec.key,
      topicLabel: sec.label,
      topicUrl: sec.href,
      source: it.sourceName,
      summary: it.dek,
      date: String(it.date || '').slice(0, 10),
    }));
    items.forEach((it) => { sectionOf.set(it.url, sec.label); claimed.add(it.url); });
    rooms[sec.key] = { items, summary: null, curatedCount: curated.length };
    groups.push({ key: sec.key, label: sec.label, href: sec.href, items, curatedCount: curated.length });
  }

  // THE WEEK'S FIVE — corroboration-weighted, cross-section, deduped vs today.
  // Cluster the full week pool (before domain caps) so the same story reported
  // by three outlets counts as one story carried by three named outlets.
  const clusters = [];
  for (const x of pool) {
    const w = words(x.title);
    const hit = clusters.find((c) => jaccard(c.w, w) >= 0.45);
    if (hit) { hit.domains.add(x.source); if ((TIER_W[x.tier] || 1) > (TIER_W[hit.rep.tier] || 1)) hit.rep = x; }
    else clusters.push({ w, domains: new Set([x.source]), rep: x, beat: x.beat });
  }
  const secForBeat = (beat) => SECTIONS.find((s) => s.beats.includes(beat));

  // THE WEEK'S FIVE.
  //
  // This used to rank the raw wire by cross-outlet corroboration. Measured 2026-08-02,
  // that signal does not exist here: of 490 stories collected in a week, exactly 2 were
  // carried by more than one named outlet, because 50 mostly non-overlapping trade and
  // regional feeds rarely cover the same event. Ranking on a signal that is almost always
  // zero is how a nostalgia piece from a big outlet ended up leading the week.
  //
  // The site already scores importance: every event in the curated log carries one, set
  // by the pipeline that writes the brief. That is the honest ranking, so the five come
  // from there. Official-comms records still never lead. If fewer than five clear the
  // bar, the page shows fewer and says so rather than padding.
  const IMPORTANCE_BAR = 5;
  const OFFICIAL = /(^|\.)gob\.mx$|^pemex\.com$|^diariooficial\.gob\.mx$|^blog\.amvo\.org\.mx$/;
  const CURATED_SECTION = {
    economy: 'economy', money: 'economy', 'us-mexico': 'usmexico',
    politics: 'politics', society: 'society', security: 'society',
  };
  let happening = { events: [] };
  try { happening = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'happening.json'), 'utf8')); }
  catch { happening = { events: [] }; }

  const fiveCandidates = (happening.events || [])
    .filter((e) => e && e.title && e.url && fresh(e.date, 7))
    .filter((e) => Number(e.importance) >= IMPORTANCE_BAR)
    .filter((e) => !OFFICIAL.test(String(e.source || '')))
    .map((e) => {
      const key = CURATED_SECTION[e.section] || 'economy';
      const sec = SECTIONS.find((s) => s.key === key) || SECTIONS[2];
      return {
        title: trim(e.title), url: e.url, sourceName: e.source, domain: e.source,
        dek: trim(e.why), date: String(e.date).slice(0, 10),
        dateLabel: dateLabel(e.date), dayLabel: dayLabel(e.date),
        curated: true, importance: Number(e.importance),
        bg: e.background || '', view: e.view || '', next: e.prediction || '',
        be: Boolean(e.background && e.view && e.prediction),
        section: sec.label, sectionKey: sec.key, href: sec.href,
        china: CHINA.test(`${e.title} ${e.why || ''}`),
      };
    })
    .filter((item) => !shownToday(item))
    .sort((a, b) => b.importance - a.importance || String(b.date).localeCompare(String(a.date)));

  // Spread across sections first so the five are not five economy stories, then fill.
  const weekFive = []; const usedSections = new Set();
  for (const c of fiveCandidates) {
    if (weekFive.length >= 5 || usedSections.has(c.sectionKey)) continue;
    if (weekFive.some((k) => jaccard(words(k.title), words(c.title)) >= 0.5)) continue;
    weekFive.push(c); usedSections.add(c.sectionKey);
  }
  for (const c of fiveCandidates) {
    if (weekFive.length >= 5) break;
    if (weekFive.includes(c)) continue;
    if (weekFive.some((k) => jaccard(words(k.title), words(c.title)) >= 0.5)) continue;
    weekFive.push(c);
  }

  const week5 = weekFive;

  // DEPTH (Fable, 2026-08-02): "the feed is replaceable; the model plus the log is not."
  // Each of the five opens onto what the log already knows: the analysis the pipeline
  // wrote, and the earlier events in the same thread. The log is young, so most threads
  // start with one entry and thicken as it fills.
  const allLogged = (happening.events || [])
    .filter((e) => e && e.title && e.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const priorFor = (item) => allLogged
    .filter((e) => e.url !== item.url && String(e.date) < String(item.date))
    .filter((e) => jaccard(words(e.title), words(item.title)) >= 0.28)
    .slice(0, 3)
    .map((e) => ({ title: trim(e.title), url: e.url, date: e.date, dateLabel: dateLabel(e.date), source: e.source }));
  for (const item of weekFive) item.prior = priorFor(item);

  // The five are the "All" view on the homepage. A story can be both one of the five and
  // a member of its section list, so it is flagged in place rather than rendered twice;
  // if the curated log surfaced something the section lists did not, it is added there.
  for (const five of weekFive) {
    const group = groups.find((g) => g.key === five.sectionKey);
    if (!group) continue;
    const existing = group.items.find((item) => item.url === five.url);
    if (existing) {
      Object.assign(existing, {
        inFive: true, prior: five.prior,
        bg: five.bg, view: five.view, prediction: five.next, analysisV: five.be ? 7 : 0,
      });
      continue;
    }
    group.items.unshift({
      ...five,
      inFive: true, prediction: five.next, analysisV: five.be ? 7 : 0,
      shownToday: false,
      interestTags: tagsFor(five),
      topic: group.key, topicLabel: group.label, topicUrl: group.href,
      source: five.sourceName, summary: five.dek,
    });
  }

  const china = merge([], themePool.filter((x) => CHINA.test(x.title + ' ' + (x.dek || ''))).map(ledgerItem), 3);

  const start = new Date(now.getTime() - 7 * 864e5);
  const weekLabel = `${dateLabel(start.toISOString())} – ${dateLabel(now.toISOString())}`;
  const curatedFresh = groups.some((g) => g.curatedCount > 0);
  // The bridge line's count: distinct stories this week across the seven sections.
  const totalWeek = clusters.filter((c) => secForBeat(c.beat)).length;
  return { rooms, groups, china, weekLabel, curatedFresh, weekFive: week5, totalWeek };
};
