import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const text = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(text(file));
const home = text('index.njk');
const nav = text('_data/nav.js');
const footerNav = text('_data/footernav.js');
const topics = text('topic-pages.njk');
const nowBoard = text('_data/nowBoard.js');
const voice = text('pipeline/lib/voice.js');
const happeningBuilder = text('pipeline/build-happening.js');
const brief = json('data/brief.json');
const homeEditorial = json('data/home-editorial.json');
const latestSeriesValue = (id) => json(`data/series/${id}.json`).data
  .filter((row) => row?.value != null && Number.isFinite(Number(row.value)))
  .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  .at(-1).value;

// The "Mexico today" headline was retired on 2026-08-02 (Alan): the dateline carries
// that promise without a second title above it. What must not regress is that the page
// still stamps itself with the current editorial day rather than an undated edition.
assert.match(home, /class="dateline"><h1>\{\{ feed\.date \| longDate \}\}/, 'homepage must remain a daily starting point without expiring after noon');
assert.doesNotMatch(home, /since your last visit/i, 'homepage must not pretend to track a reader visit');
// The page is now grouped by timeframe (Alan, 2026-08-02): the brief, the numbers and
// the day's headlines are one "Today" section, because they all describe today. The
// guarantee is unchanged: the daily readings lead, and the slower official ones keep a
// separate room further down.
assert.match(home, /data-sec="What moved"/, 'homepage must lead with the readings that move on a trading day');
assert.match(home, /What moved since the day before/, 'the comparison window belongs in the title, not a legend');
assert.match(home, /Where the economy stands/, 'the slower official readings must keep their own room below the news');
// "Key developments" became "The headlines" inside the Today section (Alan, 2026-08-02:
// the name did not say what period it covered). The window label beside it still does.
assert.match(home, /Today\u2019s stories/, 'homepage must lead readers through the major stories');
assert.match(home, /\{\{ feed\.stories\.length \}\}/, 'the story count must be derived from the data, never written in');
// The block is now labelled "The week" and its All view is the week's five (Alan,
// 2026-08-02). What must not regress is that the deeper per-section feed still exists
// on the homepage rather than moving to a separate page.
assert.match(home, /id="sec-week"/, 'homepage must retain a deeper chronological feed');
assert.match(home, /id="wk-chips"/, 'the deeper feed must keep a filter per section');
// "My topics" was removed on 2026-08-02 (Alan): with the All view curated down to the
// week's five, a second personalised view of the same list was furniture. The interest
// rules still rank the Brief; they no longer get their own filter.
assert.doesNotMatch(home, /My topics/, 'the retired My topics filter must not come back');
// The homepage "My read" connection is not one of the blocks in the 2026-08-02 design
// handoff, so the feed no longer renders it. Labelled opinion did not disappear with it:
// every story's BE panel still separates WHY IT MATTERS from the reported facts, and the
// reviewed note itself is still written and still gates the email.
assert.ok(homeEditorial.myRead?.text, 'a reviewed prediction must remain explicitly separate from reported facts');
assert.match(home, /class="dek"/, 'homepage stories must show a short summary without requiring a click');
// The feed moved from the curated-only lane to the weekly lane on 2026-08-02 so every
// section has headlines behind its toggle. It still lives here, on the Brief.
assert.match(home, /for item in feed\.week/, 'the full news feed must live on the Brief instead of a separate Latest page');
assert.match(home, /class="be-btn"/, 'key developments must offer the optional analysis layer');
assert.match(home, /class="be-badge">BE</, 'the homepage must explain the BE badge once');
assert.match(home, />Our view</, 'the analysis layer must label the Brief’s judgment');
assert.match(home, />What we’re watching</, 'the analysis layer must state what could confirm or weaken the view');
assert.match(voice, /export const ANALYSIS_SHAPE/, 'all generated analysis must share Alan’s approved reasoning pattern');
for (const requirement of ['State the view in the first sentence', 'State the most likely outcome or direction', 'observable evidence would change the view', 'concrete implication for an investor or operator']) {
  assert.ok(voice.includes(requirement), `analysis voice contract is missing: ${requirement}`);
}
assert.match(happeningBuilder, /ANALYSIS_SHAPE/, 'Briefly explained must use the shared analysis voice contract');
assert.doesNotMatch(topics, /class="be-mark"|class="be-summary"|guideHTML\(/i, 'BE belongs on the main Brief, not quarterly topic pages');
assert.doesNotMatch(nav, /label:\s*'Latest'/i, 'Latest must not compete with Brief in the masthead');
assert.doesNotMatch(footerNav, /label:\s*'Latest'/i, 'Latest must not remain as a duplicate footer destination');
assert.match(home, /id="sec-coming"/, 'homepage must show the next official dates');
// "Known next" became "Scheduled releases and decisions" (Alan, 2026-08-02) when every
// section header was given a plain statement of the period it covers. Same guarantee:
// this block is a calendar of things already on the record, never a prediction.
assert.match(home, /Scheduled releases and decisions/i, 'homepage must distinguish scheduled events from a forecast');
assert.doesNotMatch(home, /the real policy rate/i, 'current inflation subtraction must not be labeled a real policy rate');
assert.doesNotMatch(home, /% today|points today/i, 'an older observation must never be described as moving today');
for (const id of [
  'banxico-usdmxn-fix', 'cre-gasolina-regular', 'banxico-cetes-28d', 'fred-ust10', 'banxico-bmv-ipc',
  'banxico-inflacion', 'banxico-tasa-objetivo', 'banxico-igae', 'banxico-exports-total', 'banxico-remesas',
]) {
  assert.match(nowBoard, new RegExp(id), `the number set must include ${id}`);
}

assert.doesNotMatch(topics, /minimum wage is (?:<b>)?\$(?!\$\{)/i,
  'minimum-wage copy must never use an unqualified dollar sign');
// Guard the overclaim itself rather than one frozen sentence (2026-07-21): intermediate
// imports are A reason exports and imports co-move, never the whole reason.
assert.doesNotMatch(topics, /(?:that is|thats|this is) why exports and imports rise and fall/i,
  'trade copy must not claim one complete cause for co-movement');
assert.match(topics, /exports and imports (?:therefore )?rise and fall together/i,
  'trade copy should still explain the co-movement');
for (const phrase of [/local source registry/i, /event registry/i, /local feed/i, /fails closed/i, /automatically colored as good/i]) {
  assert.doesNotMatch(topics, phrase, `topic pages must not expose internal QA language: ${phrase}`);
}

// model.njk deleted in the 2026-08-02 cleanup; its honesty assertions went with the page.

const expectedStanding = `The peso trades at ${Number(latestSeriesValue('banxico-usdmxn-fix')).toFixed(2)} pesos to the dollar; inflation is ${Number(latestSeriesValue('banxico-inflacion')).toFixed(2)}%; the policy rate is ${Number(latestSeriesValue('banxico-tasa-objetivo')).toFixed(2)}%.`;
assert.equal(brief.standing.text, expectedStanding,
  'standing line must match the latest feeds, state the peso unit, and separate the three readings clearly');
assert.equal(brief.standing.live[0].tmpl, 'the peso trades at {v} pesos to the dollar',
  'live standing copy must preserve the peso unit when the number updates');

console.log('launch-copy-contract: ok');
