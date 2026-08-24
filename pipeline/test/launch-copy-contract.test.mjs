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
assert.match(
  home,
  /class="dateline"><h1 id="edition-date" data-iso="\{\{ f\.date \}\}" data-locale="\{\{ locale \}\}">\{\{ f\.date \| longDate\(locale\) \}\}/,
  'homepage must remain a dated daily starting point and expose the edition date to the stale-content guard',
);
assert.doesNotMatch(home, /since your last visit/i, 'homepage must not pretend to track a reader visit');
// The market strip shows the current known reading for each source. Its explicit
// seven-day comparison stays useful across weekends without pretending every market
// published on the edition date.
assert.match(home, /data-sec="Market check"/, 'homepage must retain the weekly market check');
{
  const ui = text('_data/uiStrings.js');
  assert.match(ui, /Market check[\s\S]*Latest available · 7-day change · 30-day line/, 'EN must explain the three time references');
  assert.match(ui, /Pulso de mercados[\s\S]*Último dato · cambio a 7 días · línea de 30 días/, 'ES must explain the three time references');
  assert.match(home, /\{\{ L\.moved \}\}/, 'the homepage must render the shared heading');
  assert.match(home, /class="tile-date">\{\{ n\.asOf \}\}/, 'each market tile must print its own observation date');
}
// Same bilingual move as above: the heading lives in uiStrings, the room in the template.
assert.match(home, /data-sec="The economy"/, 'the slower official readings must keep their own room below the news');
assert.match(text('_data/uiStrings.js'), /Where the economy stands/, 'the economy room must keep its EN title');
// Exact-day reporting and prior-day context are separate rooms. This prevents a
// Friday dateline from making a Thursday article look newly published.
assert.match(text('_data/uiStrings.js'), /Today's stories/, 'homepage must name its exact-day story lane');
assert.match(text('_data/uiStrings.js'), /Key developments/, 'homepage must keep important prior-day context in a separate lane');
assert.match(text('_data/uiStrings.js'), /Weekend recap[\s\S]*New this weekend[\s\S]*What mattered this week/,
  'the weekend catch-up mode must use clear, hand-written labels');
assert.doesNotMatch(home, /what moved today|lo que se movió hoy|What moved in Mexico: \{\{ editionDate|Qué se movió en México: \{\{ editionDate/i,
  'homepage metadata must not recertify rolling-window stories as today');
assert.match(home, /for storySection in f\.storySections/, 'the homepage must render the two data-defined story lanes');
assert.match(home, /L\.storyCount\(storySection\.stories\.length, storySection\.latest\)/, 'each lane count and date must be derived from its own stories');
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
