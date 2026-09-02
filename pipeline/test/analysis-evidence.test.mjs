import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { calendarScore, relatedEventScore, standingScore } = require('../lib/analysis-evidence.cjs');
const standing = JSON.parse(fs.readFileSync(new URL('../../data/standing.json', import.meta.url), 'utf8')).facts;
const calendar = JSON.parse(fs.readFileSync(new URL('../../data/events.json', import.meta.url), 'utf8')).events;

const suzuki = {
  section: 'economy',
  title: 'Suzuki increases imports from Japan to offset 50% tariff, adjusts Mexico pricing',
  why: 'Mexico sales fell 18% while the company changed its imported model mix.',
};
const fiscalPath = {
  id: 'std-fiscal-path', topics: ['fiscal', 'economy'],
  fact: 'Public debt and pension costs limit government spending on electricity, water, security and health.',
};
const budget = {
  id: 'federal-budget-package-2027-2026-09-08', kind: 'fiscal',
  label: 'Federal budget package delivered to Congress',
  mechanism: 'Sets proposed government revenue and spending for 2027.',
};
assert.equal(standingScore(suzuki, fiscalPath), 0,
  'an economy section must not turn fiscal policy into context for an auto-import story');
assert.equal(calendarScore(suzuki, budget), 0,
  'an economy section must not manufacture a budget milestone for a company sourcing story');

const cfe = {
  section: 'economy',
  title: 'CFE to rely on private sector for investment funding',
  why: "Mexico's state electric utility CFE will depend on the private sector to finance most of its investments during President Sheinbaum's term.",
};
const acceptedCfeFacts = standing.filter((fact) => standingScore(cfe, fact) > 0).map((fact) => fact.id);
assert.deepEqual(acceptedCfeFacts, ['std-energy-constraint'],
  'a specific electricity overlap must keep genuinely useful energy context');
assert.equal(standingScore({ title: 'Mexico raises tariffs on electric vehicles' },
  standing.find((fact) => fact.id === 'std-energy-constraint')), 0,
'electric vehicles must not be mistaken for the power-grid concept');
assert.equal(standingScore({ title: 'Electric vehicle sales rise in Mexico' },
  standing.find((fact) => fact.id === 'std-energy-constraint')), 0,
'electric vehicle sales must not inherit utility-grid context');
const investment = standing.find((fact) => fact.id === 'std-investment-rate');
assert.ok(standingScore({
  title: 'Holcim invests US$500 million in Mexico to advance circular economy projects',
}, investment) > 0, 'a physical business investment should receive the fixed-investment baseline');
assert.equal(standingScore({
  title: 'An investment fund raises capital for its bond portfolio',
}, investment), 0, 'a financial portfolio must not be treated as physical fixed investment');
assert.equal(standingScore({
  title: 'An energy investment fund raises capital for a bond portfolio',
}, investment), 0, 'an energy fund is not evidence of new physical capacity');
assert.equal(standingScore({
  title: 'Investment in manufacturing stocks rises',
}, investment), 0, 'manufacturing equities are not physical fixed investment');
assert.deepEqual(calendar.filter((item) => calendarScore(cfe, item) > 0), [],
  'the exact CFE story must not inherit a political or federal-budget date');

const exports = {
  section: 'economy',
  title: 'Mexico exports reach a record in July',
  why: 'Monthly goods exports and imports both increased.',
};
assert.ok(standingScore(exports, standing.find((fact) => fact.id === 'std-us-dependence')) > 0,
  'a specific exports overlap must keep genuinely useful trade context');

const antidumping = standing.find((fact) => fact.id === 'std-antidumping-process');
assert.ok(standingScore({
  section: 'us-mexico',
  title: 'Mexico opens anti-dumping investigation into Japanese steel',
  why: 'The Economy Ministry began a trade-remedy investigation after a domestic producer alleged price discrimination.',
}, antidumping) > 0, 'an anti-dumping investigation should receive the official process baseline');
assert.equal(standingScore({
  title: 'City opens dumping investigation after toxic industrial waste was found',
}, antidumping), 0, 'ordinary waste dumping must not inherit trade-remedy context');
assert.equal(standingScore({
  title: 'City launches anti-dumping campaign against industrial waste',
}, antidumping), 0, 'an environmental anti-dumping campaign must not inherit trade-remedy context');

assert.deepEqual(standing.filter((fact) => standingScore(suzuki, fact) > 0), [],
  'the exact Suzuki story has no standing fact merely because it sits in the economy section');
assert.deepEqual(calendar.filter((item) => calendarScore(suzuki, item) > 0), [],
  'the exact Suzuki story has no fiscal or political calendar connection');
assert.equal(standingScore(suzuki, { id: 'number:banxico-exports-total' }), 0,
  'a company tariff story must not inherit the national monthly exports series');
assert.equal(standingScore(cfe, { id: 'number:banxico-cetes-28d' }), 0,
  'the word financing must not turn Cetes into evidence for a utility investment story');
assert.equal(standingScore(exports, { id: 'number:banxico-usdmxn-fix' }), 0,
  'an exports story must not inherit the peso series merely because exports are dollar-denominated');
assert.ok(standingScore(exports, { id: 'number:banxico-exports-total' }) > 0,
  'the national exports print must retain its own official monthly series');

assert.equal(relatedEventScore(suzuki, {
  section: 'economy', title: 'Mexico presents a water plan', why: 'The government published a report.',
}), 0, 'same section and the word Mexico are not enough to connect two reports');
assert.ok(relatedEventScore(exports, {
  section: 'economy', title: 'Mexico goods exports rise', why: 'The monthly exports release also reports imports.',
}) > 0, 'two meaningful shared terms can connect reports from the same release');
assert.equal(relatedEventScore(suzuki, {
  section: 'us-mexico',
  title: 'President Sheinbaum expresses optimism on US-Mexico tariff negotiations to avert steel, aluminum, and auto duties',
  why: "President Claudia Sheinbaum stated optimism regarding trade negotiations with the United States to prevent unilateral tariffs of 50 percent on steel and aluminum. The negotiations are central to Mexico's trade standing under USMCA.",
}), 0, 'tariffs in opposite directions are not the same prior-event thread');

assert.ok(calendarScore({
  section: 'money', title: 'Banxico holds the policy rate', why: 'The next rate decision depends on inflation.',
}, {
  kind: 'banxico', label: 'Banxico monetary-policy decision', mechanism: 'Sets the overnight policy rate.',
}) > 0, 'specific Banxico and rate language must keep the relevant policy calendar item');
const paymentsFact = standing.find((fact) => fact.id === 'std-payments-system');
assert.equal(standingScore({ title: 'Government begins pension payments' }, paymentsFact), 0,
  'pension disbursements must not inherit digital-payment-rail context');
assert.equal(standingScore({ title: 'Campaign payments do not appear in Morena filings' }, paymentsFact), 0,
  'political payments must not inherit SPEI and CoDi context');
assert.ok(standingScore({ title: 'SPEI instant payments reach more bank customers' }, paymentsFact) > 0,
  'a named digital-payment rail must retain the payments-system standing fact');
assert.ok(calendarScore({
  section: 'economy', title: 'Mexico prepares its federal budget package',
  why: 'The finance ministry will present proposed revenue and spending for 2027.',
}, calendar.find((item) => item.id === 'federal-budget-package-2027-2026-09-08')) > 0,
'a real federal-budget story must keep the statutory September 8 calendar item');
assert.ok(calendarScore({
  section: 'money', title: 'Mexico inflation slows in August',
  why: 'The consumer-price reading will shape the next policy-rate decision.',
}, calendar.find((item) => item.id === 'inegi-cpi-2026-09-09')) > 0,
'an inflation story must keep the next CPI release');
assert.ok(standingScore({
  section: 'politics', title: "Sheinbaum delivers Mexico's second Informe de Gobierno",
}, standing.find((fact) => fact.id === 'std-political-system')) > 0,
'a completed presidential informe should receive the presidential-system baseline');

console.log('analysis-evidence tests: ok');
