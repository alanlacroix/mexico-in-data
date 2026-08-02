// The production topic rooms. Trade folded into U.S.–Mexico on 2026-08-01 (Fable):
// its export composition became a slot there and /trade.html now 301s to it. This registry owns route names and metadata;
// the page renderer owns the data. Keeping the list here prevents the masthead,
// topic switcher and generated pages from quietly drifting apart.
module.exports = [
  {
    key: 'economy',
    label: 'Economy & money',
    permalink: '/economy.html',
    title: 'Economy and money · The Mexico Brief',
    description: 'Mexico’s growth, inflation, interest rates and peso, with dated official readings and the underlying data.',
  },
  {
    key: 'payments',
    label: 'Payments & fintech',
    permalink: '/payments.html',
    title: 'Payments and fintech · The Mexico Brief',
    description: 'Mexico’s payment rails, cards, fintech regulation, e-commerce and cash, using dated Banco de México data.',
  },
  {
    key: 'politics',
    label: 'Politics',
    permalink: '/politics.html',
    title: 'Politics · The Mexico Brief',
    description: 'The dated political decisions and official calendar that matter for Mexico.',
  },
  {
    key: 'society',
    label: 'Security & society',
    permalink: '/society.html',
    title: 'Security and society · The Mexico Brief',
    description: 'Mexico’s official security data, population, wages and household flows, with each measure kept on its own clock.',
  },
  {
    key: 'usmexico',
    label: 'US & Mexico',
    permalink: '/us-mexico.html',
    title: 'US and Mexico · The Mexico Brief',
    description: 'The bilateral goods ledger, Mexico’s export exposure, and the dates that reprice the relationship.',
  },
];
