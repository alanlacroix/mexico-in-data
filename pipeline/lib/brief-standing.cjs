'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function readSeries(id) {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'series', `${id}.json`), 'utf8'));
    return (doc.data || [])
      .filter((row) => row && row.value != null)
      .map((row) => ({ t: Date.parse(row.date), v: Number(row.value), date: row.date }))
      .filter((row) => Number.isFinite(row.t) && Number.isFinite(row.v))
      .sort((a, b) => a.t - b.t);
  } catch {
    return [];
  }
}

function board() {
  const items = [];
  const peso = readSeries('banxico-usdmxn-fix');
  if (peso.length) items.push({
    id: 'board-peso', label: 'the peso',
    text: `the peso trades at ${peso.at(-1).v.toFixed(2)} pesos to the dollar`,
    source: 'Banco de México', url: '/economy.html',
    series: 'banxico-usdmxn-fix', tmpl: 'the peso trades at {v} pesos to the dollar',
  });
  const inflation = readSeries('banxico-inflacion');
  if (inflation.length) items.push({
    id: 'board-inflation', label: 'inflation',
    text: `inflation is ${inflation.at(-1).v.toFixed(2)}%`,
    source: 'INEGI', url: '/economy.html',
    series: 'banxico-inflacion', tmpl: 'inflation is {v}%',
  });
  const rate = readSeries('banxico-tasa-objetivo');
  if (rate.length) items.push({
    id: 'board-rate', label: 'the policy rate',
    text: `the policy rate is ${rate.at(-1).v.toFixed(2)}%`,
    source: 'Banco de México', url: '/economy.html',
    series: 'banxico-tasa-objetivo', tmpl: 'the policy rate is {v}%',
  });
  const growth = readSeries('banxico-pib-crecimiento');
  if (growth.length) {
    const value = growth.at(-1).v;
    items.push({
      id: 'board-growth', label: 'growth',
      text: `growth is running near ${(value >= 0 ? '+' : '') + value.toFixed(1)}%`,
      source: 'INEGI', url: '/economy.html',
    });
  }
  return items;
}

function buildStanding(items = board()) {
  const selected = items.filter((item) => ['board-peso', 'board-inflation', 'board-rate'].includes(item.id));
  if (!selected.length) return null;
  const sentence = selected.map((item) => item.text).join('; ');
  return {
    text: sentence ? sentence[0].toUpperCase() + sentence.slice(1) + '.' : '',
    live: selected.map((item) => ({ series: item.series, tmpl: item.tmpl })),
    refs: selected.map((item) => item.id),
    href: '/economy.html',
    source: 'Banco de México / INEGI',
  };
}

module.exports = { board, buildStanding };
