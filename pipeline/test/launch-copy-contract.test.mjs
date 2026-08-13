import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const text = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(text(file));
const home = text('index.njk');
const nowBoard = text('_data/nowBoard.js');
const voice = text('pipeline/lib/voice.js');
const happeningBuilder = text('pipeline/build-happening.js');
const brief = json('data/brief.json');
const latestSeriesValue = (id) => json(`data/series/${id}.json`).data
  .filter((row) => row?.value != null && Number.isFinite(Number(row.value)))
  .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  .at(-1).value;

// The "Mexico today" headline was retired on 2026-08-02 (Alan): the dateline carries
// that promise without a second title above it. What must not regress is that the page
// still stamps itself with the current editorial day rather than an undated edition.
// `f` is the per-locale feed since the Spanish edition (2026-08-03); the promise is
// unchanged — the page stamps the current editorial day, in the reader's language.
assert.match(home, /class="dateline"><h1>\{\{ f\.date \| longDate\(locale\) \}\}/, 'homepage must remain a daily starting point without expiring after noon');
assert.doesNotMatch(home, /since your last visit/i, 'homepage must not pretend to track a reader visit');
// The page is now grouped by timeframe (Alan, 2026-08-02): the brief, the numbers and
// the day's headlines are one "Today" section, because they all describe today. The
// guarantee is unchanged: the daily readings lead, and the slower official ones keep a
// separate room further down.
assert.match(home, /data-sec="What moved"/, 'homepage must lead with the readings that move on a trading day');
// The literal string moved into _data/uiStrings.js when the homepage went bilingual
// (2026-08-03); the promise — comparison window in the title — is asserted there,
// in both languages, since that file is now the single source of the heading.
{
  const ui = text('_data/uiStrings.js');
  assert.match(ui, /What moved since the day before/, 'the comparison window belongs in the EN title, not a legend');
  assert.match(ui, /Qué se movió desde el día anterior/, 'the comparison window belongs in the ES title, not a legend');
  assert.match(home, /\{\{ L\.moved \}\}/, 'the homepage must render the shared heading');
}
// Same bilingual move as above: the heading lives in uiStrings, the room in the template.
assert.match(home, /data-sec="The economy"/, 'the slower official readings must keep their own room below the news');
assert.match(text('_data/uiStrings.js'), /Where the economy stands/, 'the economy room must keep its EN title');
// The Brief uses a rolling window. The heading must describe editorial importance,
// never falsely claim that every selected article was published today.
assert.match(text('_data/uiStrings.js'), /Key developments/, 'homepage must lead readers through the major stories without misdating them');
assert.doesNotMatch(text('_data/uiStrings.js'), /Today\u2019s stories|storyCount:[^\n]*today/, 'rolling-window stories must never be labelled as today');
assert.doesNotMatch(home, /what moved today|lo que se movió hoy|What moved in Mexico: \{\{ editionDate|Qué se movió en México: \{\{ editionDate/i,
  'homepage metadata must not recertify rolling-window stories as today');
assert.match(home, /\{\{ L\.stories \}\}/, 'the homepage must render the stories heading');
assert.match(home, /L\.storyCount\(f\.stories\.length, f\.latestStoryDate\)/, 'the story count and newest source date must be derived from the data');
// The block is now labelled "The week" and its All view is the week's five (Alan,
// 2026-08-02). What must not regress is that the deeper per-section feed still exists
// on the homepage rather than moving to a separate page.
assert.match(home, /id="sec-week"/, 'homepage must retain a deeper chronological feed');
assert.match(home, /id="wk-chips"/, 'the deeper feed must keep a filter per section');
// "My topics" was removed on 2026-08-02 (Alan): with the All view curated down to the
// week's five, a second personalised view of the same list was furniture. The interest
// rules still rank the Brief; they no longer get their own filter.
assert.doesNotMatch(home, /My topics/, 'the retired My topics filter must not come back');
assert.match(home, /class="dek"/, 'homepage stories must show a short summary without requiring a click');
// The feed moved from the curated-only lane to the weekly lane on 2026-08-02 so every
// section has headlines behind its toggle. It still lives here, on the Brief.
assert.match(home, /for item in f\.week/, 'the full news feed must live on the Brief instead of a separate Latest page');
assert.match(home, /class="be-btn"/, 'every key development must offer the required analysis layer');
assert.match(home, /class="be-badge">BE</, 'the homepage must explain the BE badge once');
// (heading moved to _data/uiStrings.js with the bilingual homepage, 2026-08-03)
assert.match(text('_data/uiStrings.js'), /ourView: 'Our view'/, 'the analysis layer must label the Brief’s judgment');
assert.match(home, /\{\{ L\.ourView \}\}/, 'the homepage must render the judgment label');
assert.match(text('_data/uiStrings.js'), /watching: 'What we\u2019re watching'/, 'the analysis layer must state what could confirm or weaken the view');
assert.match(home, /\{\{ L\.watching \}\}/, 'the homepage must render the watching label');
assert.match(voice, /export const ANALYSIS_SHAPE/, 'all generated analysis must share Alan’s approved reasoning pattern');
for (const requirement of ['State the view in the first sentence', 'Name the next real decision, release, or result', 'observable evidence would confirm or weaken the view', 'concrete implication for an investor or operator']) {
  assert.ok(voice.includes(requirement), `analysis voice contract is missing: ${requirement}`);
}
assert.match(happeningBuilder, /ANALYSIS_SHAPE/, 'Briefly explained must use the shared analysis voice contract');
assert.doesNotMatch(text('_includes/partials/header.njk'), /menu-btn|menu-panel|Quarterly review/i,
  'the homepage-only masthead must not regrow a secondary navigation product');
assert.match(home, /id="sec-coming"/, 'homepage must show the next official dates');
// "Known next" became "Scheduled releases and decisions" (Alan, 2026-08-02) when every
// section header was given a plain statement of the period it covers. Same guarantee:
// this block is a calendar of things already on the record, never a prediction.
// (heading moved to _data/uiStrings.js with the bilingual homepage, 2026-08-03)
assert.match(text('_data/uiStrings.js'), /Scheduled releases and decisions/, 'homepage must distinguish scheduled events from a forecast');
assert.doesNotMatch(home, /the real policy rate/i, 'current inflation subtraction must not be labeled a real policy rate');
assert.doesNotMatch(home, /% today|points today/i, 'an older observation must never be described as moving today');
for (const id of [
  'banxico-usdmxn-fix', 'cre-gasolina-regular', 'banxico-cetes-28d', 'fred-ust10', 'banxico-bmv-ipc',
  'banxico-inflacion', 'banxico-tasa-objetivo', 'banxico-igae', 'banxico-exports-total', 'banxico-remesas',
]) {
  assert.match(nowBoard, new RegExp(id), `the number set must include ${id}`);
}

const expectedStanding = `The peso trades at ${Number(latestSeriesValue('banxico-usdmxn-fix')).toFixed(2)} pesos to the dollar; inflation is ${Number(latestSeriesValue('banxico-inflacion')).toFixed(2)}%; the policy rate is ${Number(latestSeriesValue('banxico-tasa-objetivo')).toFixed(2)}%.`;
assert.equal(brief.standing.text, expectedStanding,
  'standing line must match the latest feeds, state the peso unit, and separate the three readings clearly');
assert.equal(brief.standing.live[0].tmpl, 'the peso trades at {v} pesos to the dollar',
  'live standing copy must preserve the peso unit when the number updates');

console.log('launch-copy-contract: ok');
