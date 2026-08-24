// boards.js — splits the number set into the homepage's two rooms.
//
// Top of the page is a weekly market check, so it only carries series that
// genuinely move through the week. Bottom of the page is what is true, so it
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

// Markets close on different days and the fuel average refreshes through the day, so
// these five rarely share one vintage. Each tile always carries its own observation date.
const dayLabel = (iso) => {
  const parsed = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? iso
    : parsed.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
};

module.exports = function () {
  const byId = new Map(nowBoard().map((card) => [card.id, card]));
  const pick = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);

  const today = pick(TODAY);
  const dates = today.map((card) => card.date).filter(Boolean).sort();
  const newest = dates.at(-1) || null;
  const oldest = dates[0] || null;
  const mixed = Boolean(newest && oldest && newest !== oldest);

  return {
    today: today.map((card) => ({ ...card, olderThanBlock: Boolean(newest && card.date !== newest) })),
    todayVintage: newest && {
      asOf: dayLabel(newest),
      mixed,
      // A stamp, not a sentence. The visible per-item dates already say that some
      // readings are older; a clause explaining that is the page apologising.
      label: `As of ${dayLabel(newest)}`,
    },
    economy: pick(ECONOMY),
  };
};
