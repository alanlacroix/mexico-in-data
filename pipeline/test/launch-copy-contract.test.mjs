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
const model = text('model.njk');
const brief = json('data/brief.json');
const latestSeriesValue = (id) => json(`data/series/${id}.json`).data
  .filter((row) => row?.value != null && Number.isFinite(Number(row.value)))
  .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  .at(-1).value;

// 2026-08-01 (Alan, final): the name lives in the masthead ONLY — never twice on
// one page. The page head says what day it is and when the page refreshed, and
// that is the page's single clock. The data-checked line is gone as noise.
assert.doesNotMatch(home, /home-name/, 'the page must not repeat the masthead name');
assert.doesNotMatch(home, /Data checked/, 'the data-checked line must not return');
assert.match(home, /id="updated"/, 'the head must carry the one refresh stamp');
assert.match(home, /Refreshed \$\{when\}/, 'the refresh stamp must say when in plain words');
// §3: exactly one filled green button on the page — the Subscribe form.
assert.doesNotMatch(nav, /cta.*border:1px solid/, 'the nav Subscribe must not be a second button');
// §9: no up/down arrows; sign and colour carry direction.
assert.doesNotMatch(home, /[↑↓]/, 'arrows must not return to the market cards');
assert.doesNotMatch(home, /since your last visit/i, 'homepage must not pretend to track a reader visit');
assert.match(home, /Markets today/i, 'homepage must separate fast-moving readings');
assert.match(home, /Top stories/i, 'homepage must lead readers through the major stories');
assert.match(home, /class="story-summary"/, 'homepage stories must show a short summary without requiring a click');
// 2026-08-01: the homepage's second layer is now the SEVEN-SECTION last-7-days
// flow (weeklyTop), chosen by the same pills — not the old 5-topic latestStories
// filter. The daily digest above it is unchanged.
assert.match(home, /for group in weeklyTop\.groups/, 'the week layer must come from the seven-section weekly lane');
assert.match(home, /The last 7 days/, 'the second layer must be labeled as the week');
assert.match(home, /The context behind the headline\./i, 'the homepage must explain the BE mark once in plain language');
assert.match(home, /class="be-mark"[^>]*>BE</i, 'stories must use the BE house mark for optional context');
assert.doesNotMatch(nav, /label:\s*'Latest'/i, 'Latest must not compete with Brief in the masthead');
assert.doesNotMatch(footerNav, /label:\s*'Latest'/i, 'Latest must not remain as a duplicate footer destination');
assert.match(home, /id="week-title">The week ahead</i, 'homepage must show the week-ahead calendar section');
assert.match(home, /Official releases and meetings/i, 'homepage must show Alan’s next official releases and meetings');
assert.doesNotMatch(home, /the real policy rate/i, 'current inflation subtraction must not be labeled a real policy rate');
// §3: the peso keeps its plain word ("stronger"/"weaker") beside the signed move.
assert.match(home, /\['stronger','weaker'\]/, 'the peso move must keep the plain word');
assert.match(home, /unchanged/, 'a zero move must print "unchanged" rather than a signed zero');
assert.match(home, /banxico-bmv-ipc/i,
  'homepage markets should include the Mexican equity market');
assert.match(home, /banxico-cetes-28d/i,
  'homepage markets should include the short-term Mexican government yield');

assert.match(topics, /general minimum wage is (?:<b>)?MX\$\$\{fmt\(W\.value,2\)\} a day/i,
  'minimum-wage copy must identify Mexican pesos');
// Guard the overclaim itself rather than one frozen sentence (2026-07-21): intermediate
// imports are A reason exports and imports co-move, never the whole reason.
assert.doesNotMatch(topics, /(?:that is|thats|this is) why exports and imports rise and fall/i,
  'trade copy must not claim one complete cause for co-movement');
assert.match(topics, /exports and imports (?:therefore )?rise and fall together/i,
  'trade copy should still explain the co-movement');
for (const phrase of [/local source registry/i, /event registry/i, /local feed/i, /fails closed/i, /automatically colored as good/i]) {
  assert.doesNotMatch(topics, phrase, `topic pages must not expose internal QA language: ${phrase}`);
}

assert.doesNotMatch(model, /causal map/i, 'directional rules must not be presented as identified causality');
assert.match(model, /directional scenario map, not a forecast/i,
  'model must state what the tool actually does');

const expectedStanding = `The peso trades at ${Number(latestSeriesValue('banxico-usdmxn-fix')).toFixed(2)} pesos to the dollar; inflation is ${Number(latestSeriesValue('banxico-inflacion')).toFixed(2)}%; the policy rate is ${Number(latestSeriesValue('banxico-tasa-objetivo')).toFixed(2)}%.`;
assert.equal(brief.standing.text, expectedStanding,
  'standing line must match the latest feeds, state the peso unit, and separate the three readings clearly');
assert.equal(brief.standing.live[0].tmpl, 'the peso trades at {v} pesos to the dollar',
  'live standing copy must preserve the peso unit when the number updates');

console.log('launch-copy-contract: ok');
