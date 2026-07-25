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
const nowBoard = text('_data/nowBoard.js');
const voice = text('pipeline/lib/voice.js');
const happeningBuilder = text('pipeline/build-happening.js');
const brief = json('data/brief.json');
const homeEditorial = json('data/home-editorial.json');
const latestSeriesValue = (id) => json(`data/series/${id}.json`).data
  .filter((row) => row?.value != null && Number.isFinite(Number(row.value)))
  .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  .at(-1).value;

assert.match(home, /Mexico today/i, 'homepage must remain a daily starting point without expiring after noon');
assert.doesNotMatch(home, /since your last visit/i, 'homepage must not pretend to track a reader visit');
assert.match(home, /Latest numbers/i, 'homepage must place official readings beside the news');
assert.match(home, /Key developments/i, 'homepage must lead readers through the major stories');
assert.match(home, /dailyBrief\.windowLabel/i, 'homepage must state the rolling news window plainly');
assert.match(home, /All headlines/i, 'homepage must retain a deeper chronological feed');
assert.match(home, /My topics/i, 'homepage must expose Alan’s declared interests');
assert.match(home, /homeEditorial\.myRead\.label/, 'homepage must render the reviewed or deterministic connection label');
assert.ok(homeEditorial.myRead?.text, 'a reviewed prediction must remain explicitly separate from reported facts');
assert.match(home, /class="story-summary"/, 'homepage stories must show a short summary without requiring a click');
assert.match(home, /for story in latestStories/, 'the full news feed must live on the Brief instead of a separate Latest page');
assert.match(home, /aria-label="Briefly explained:/i, 'key developments must offer the optional analysis layer');
assert.match(home, /<b>BE<\/b> Briefly explained/i, 'the homepage must explain the BE badge once');
assert.match(home, />Our view</i, 'the analysis layer must label the Brief’s judgment');
assert.match(home, />What we’re watching</i, 'the analysis layer must state what could confirm or weaken the view');
assert.match(voice, /export const ANALYSIS_SHAPE/, 'all generated analysis must share Alan’s approved reasoning pattern');
for (const requirement of ['State the view in the first sentence', 'State the most likely outcome or direction', 'observable evidence would change the view', 'concrete implication for an investor or operator']) {
  assert.ok(voice.includes(requirement), `analysis voice contract is missing: ${requirement}`);
}
assert.match(happeningBuilder, /ANALYSIS_SHAPE/, 'Briefly explained must use the shared analysis voice contract');
assert.doesNotMatch(topics, /class="be-mark"|class="be-summary"|guideHTML\(/i, 'BE belongs on the main Brief, not quarterly topic pages');
assert.doesNotMatch(nav, /label:\s*'Latest'/i, 'Latest must not compete with Brief in the masthead');
assert.doesNotMatch(footerNav, /label:\s*'Latest'/i, 'Latest must not remain as a duplicate footer destination');
assert.match(home, /id="week-title">Coming up</i, 'homepage must show the next official dates');
assert.match(home, /Known next/i, 'homepage must distinguish scheduled events from a forecast');
assert.doesNotMatch(home, /the real policy rate/i, 'current inflation subtraction must not be labeled a real policy rate');
assert.doesNotMatch(home, /% today|points today/i, 'an older observation must never be described as moving today');
for (const id of ['banxico-usdmxn-fix', 'banxico-inflacion', 'banxico-tasa-objetivo', 'banxico-igae', 'banxico-exports-total', 'banxico-remesas']) {
  assert.match(nowBoard, new RegExp(id), `latest numbers must include ${id}`);
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

assert.doesNotMatch(model, /causal map/i, 'directional rules must not be presented as identified causality');
assert.match(model, /directional scenario map, not a forecast/i,
  'model must state what the tool actually does');

const expectedStanding = `The peso trades at ${Number(latestSeriesValue('banxico-usdmxn-fix')).toFixed(2)} pesos to the dollar; inflation is ${Number(latestSeriesValue('banxico-inflacion')).toFixed(2)}%; the policy rate is ${Number(latestSeriesValue('banxico-tasa-objetivo')).toFixed(2)}%.`;
assert.equal(brief.standing.text, expectedStanding,
  'standing line must match the latest feeds, state the peso unit, and separate the three readings clearly');
assert.equal(brief.standing.live[0].tmpl, 'the peso trades at {v} pesos to the dollar',
  'live standing copy must preserve the peso unit when the number updates');

console.log('launch-copy-contract: ok');
