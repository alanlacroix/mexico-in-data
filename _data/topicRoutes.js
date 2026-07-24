// The six production topic rooms. This registry owns route names and metadata;
// the page renderer owns the data. Keeping the list here prevents the masthead,
// topic switcher and generated pages from quietly drifting apart.
module.exports = [
  {
    key: 'economy',
    label: 'Economy & money',
    permalink: '/economy.html',
    title: 'Economy and money · The Mexico Brief',
    description: 'A quarterly review of Mexico’s growth, inflation, interest rates, peso and investment, supported by dated original sources.',
  },
  {
    key: 'payments',
    label: 'Payments',
    permalink: '/payments.html',
    title: 'Payments · The Mexico Brief',
    description: 'A quarterly review of Mexico’s payment rails, cards, e-commerce and cash, using dated Banco de México and INEGI data.',
  },
  {
    key: 'trade',
    label: 'Trade',
    permalink: '/trade.html',
    title: 'Trade · The Mexico Brief',
    description: 'A quarterly review of what Mexico sells and buys, where it goes and what could change its North American manufacturing model.',
  },
  {
    key: 'politics',
    label: 'Politics',
    permalink: '/politics.html',
    title: 'Politics · The Mexico Brief',
    description: 'A quarterly review of Mexico’s political capacity, institutions, budget choices and the official calendar ahead.',
  },
  {
    key: 'society',
    label: 'Society & security',
    permalink: '/society.html',
    title: 'Society and security · The Mexico Brief',
    description: 'A quarterly review of Mexico’s population, work, household finances and security, with each measure kept on its own clock.',
  },
  {
    key: 'usmexico',
    label: 'U.S. and Mexico',
    permalink: '/us-mexico.html',
    title: 'U.S. and Mexico · The Mexico Brief',
    description: 'A quarterly review of the U.S.–Mexico relationship: trade, investment, migration, energy and the official dates ahead.',
  },
];
