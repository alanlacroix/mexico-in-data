// The six production topic rooms. This registry owns route names and metadata;
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
    label: 'Payments',
    permalink: '/payments.html',
    title: 'Payments · The Mexico Brief',
    description: 'Mexico’s payment rails, cards, e-commerce and cash, using dated Banco de México data.',
  },
  {
    key: 'trade',
    label: 'Trade',
    permalink: '/trade.html',
    title: 'Trade · The Mexico Brief',
    description: 'What Mexico sells and buys, where it goes and how the trade balance is changing.',
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
    label: 'Society & security',
    permalink: '/society.html',
    title: 'Society and security · The Mexico Brief',
    description: 'Mexico’s population, wages, household flows and official security data, with each measure kept on its own clock.',
  },
  {
    key: 'usmexico',
    label: 'U.S.–Mexico',
    permalink: '/us-mexico.html',
    title: 'U.S.–Mexico · The Mexico Brief',
    description: 'The bilateral goods ledger, Mexico’s export exposure and the next official U.S.–Mexico dates.',
  },
];
