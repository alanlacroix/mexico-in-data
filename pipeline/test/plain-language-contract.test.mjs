import assert from 'node:assert/strict';
import plainLanguage from '../lib/plain-language.cjs';

const { plainExplanation, plainHeadline, plainSourceName } = plainLanguage;

assert.equal(
  plainHeadline('USTR recommends tighter USMCA auto rules of origin'),
  'US trade office recommends tighter North American auto content rules',
);
assert.equal(
  plainHeadline('Mexico and the US launch the first annual USMCA review'),
  'Mexico and the US launch the first annual review of the US-Mexico-Canada trade agreement',
);
assert.equal(
  plainHeadline('INEGI estimates GDP growth at 1.7%'),
  "Mexico's statistics agency estimates economic growth at 1.7%",
);
assert.equal(
  plainExplanation('Article 23.6 of USMCA lets citizens file complaints. USTR reviews them.'),
  'Article 23.6 of the US-Mexico-Canada Agreement lets citizens file complaints. US trade office reviews them.',
);
assert.equal(
  plainExplanation("INEGI's IOAE is an early, unofficial estimate of economic activity published ahead of the formal GDP report."),
  "Mexico's statistics agency publishes an early estimate of economic activity before the formal gross domestic product report.",
);
assert.equal(
  plainExplanation('Mexico\'s statistics agency already uses its full name.'),
  'Mexico\'s statistics agency already uses its full name.',
);
assert.equal(
  plainExplanation('The Office of the U.S. Trade Representative (USTR) opened the review.'),
  'The US trade office opened the review.',
);
assert.equal(plainSourceName('USTR'), 'US Trade Representative');
assert.equal(plainSourceName('INEGI'), "Mexico's statistics agency (INEGI)");
assert.equal(
  plainHeadline('BIS warns Banxico while CNBV reviews Mexican FIBRAs'),
  "International central-bank group warns Mexico's central bank while Mexico's banking regulator reviews Mexican real estate investment trusts",
);
assert.equal(
  plainExplanation('The Recaudación Federal Participable (RFP) is the pool shared with states.'),
  'Federal revenue sharing is the pool shared with states.',
);
assert.equal(
  plainHeadline('Forced-labor complaint over Chinese camera imports tests USMCA mechanism'),
  'Forced-labor complaint over Chinese camera imports tests labor rules in the US-Mexico-Canada trade agreement',
);
assert.equal(
  plainHeadline('US Fed (FOMC) monetary-policy decision'),
  'US central bank policy decision',
);

console.log('plain-language contract: ok');
