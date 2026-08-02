// boards.js — splits the number set into the homepage's two rooms.
//
// Top of the page is what changed since yesterday, so it only carries series that
// genuinely move on a trading day. Bottom of the page is what is true, so it
// carries the monthly and meeting-cadence readings that deserve a sentence.
// A number appears in exactly one room. Order here is the order on the page.

const nowBoard = require('./nowBoard.js');

const TODAY = [
  'banxico-usdmxn-fix',   // the barometer
  'cre-gasolina-regular', // the felt price
  'banxico-cetes-28d',    // the short end
  'fred-ust10',           // why the peso moved
  'banxico-bmv-ipc',      // risk appetite
];

const ECONOMY = [
  'banxico-inflacion',
  'banxico-tasa-objetivo',
  'banxico-igae',
  'banxico-exports-total',
  'banxico-remesas',
];

module.exports = function () {
  const byId = new Map(nowBoard().map((card) => [card.id, card]));
  const pick = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
  return { today: pick(TODAY), economy: pick(ECONOMY) };
};
