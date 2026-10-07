import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CENSUS_CALENDAR_URL, censusTradeCalendarEligible, createCensusCalendarLoader, parseCensusCalendar } from '../lib/census-release-calendar.mjs';
import { shapeEvidenceRecord } from '../lib/source-evidence.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const html = fs.readFileSync(new URL('./fixtures/census-ft900-schedule.html', import.meta.url), 'utf8');
const now = new Date('2026-10-07T12:05:00Z');
const item = { url: 'https://elceo.com/economia/census-fixture/', title: 'México exporta productos tecnológicos hacia Estados Unidos' };
const lead = { id: 'article', kind: 'article-body', source: 'El CEO', url: item.url,
  text: 'México exportó productos hacia Estados Unidos, según datos de la Oficina del Censo de Estados Unidos.' };
const eligible = (item, lead) => censusTradeCalendarEligible(item, lead, lead.text);
assert.equal(eligible(item, lead), true);
assert.equal(censusTradeCalendarEligible(item, lead), false);
for (const [title, text] of [
  ['México aumenta 21.2% su superávit comercial con Estados Unidos', 'México aumentó su superávit en el comercio de productos con Estados Unidos, informó la Oficina del Censo.'],
  ['México rompe récord y exporta bienes a EU', 'De acuerdo con cifras de la Oficina del Censo de EU, México incrementó sus exportaciones.'],
  ['U.S. imports from Mexico rise', 'According to U.S. Census Bureau data, imports from Mexico rose.'],
  ["Mexico's goods exports to the United States rise", 'The U.S. Census Bureau reported increased imports from Mexico.'],
]) assert.equal(eligible({ ...item, title }, { ...lead, text }), true, title);
for (const [title, text] of [
  ['La IED de México en Estados Unidos aumenta', 'El Departamento de Comercio informó el dato.'],
  ['México exporta a Francia y negocia aranceles con Estados Unidos', lead.text],
  ['México analiza cómo China exporta bienes a Estados Unidos', 'Los datos de la Oficina del Censo de Estados Unidos, mostraron que China aumentó sus exportaciones.'],
  ['Mexico watches as China exports goods to the United States', 'The U.S. Census Bureau reported goods exports from China.'],
  ['The United States watches China imports from Mexico rise', 'The U.S. Census Bureau reported imports from Mexico.'],
  [item.title, 'The U.S. Census Bureau reported goods imports from China.'],
  ['U.S. imports from China grow alongside trade from Mexico', 'The U.S. Census Bureau reported imports from Mexico.'],
  ['Mexico exports to the EU rise', 'U.S. Census Bureau data showed imports from Mexico.'],
  ['México exporta a China mientras conversa con Estados Unidos', lead.text],
  ['México y Estados Unidos negocian aranceles', lead.text],
  ['U.S. services imports from Mexico rise', 'The U.S. Census Bureau reported increased imports from Mexico.'],
  ["Mexico's exports to the United States rise", 'The U.S. Census Bureau released data showing services imports from Mexico grew.'],
  ['México exporta servicios a Estados Unidos y su industria de bienes crece', lead.text],
  ['México exporta a Estados Unidos', 'Datos de la Oficina del Censo de Estados Unidos, indican que crecieron las exportaciones de servicios.'],
  ['U.S. steel imports from Mexico rise', 'The U.S. Census Bureau reported increased imports from Mexico.'],
  [item.title, 'Los datos de exportación aumentaron. La Oficina del Censo informó sobre la población de Estados Unidos.'],
  [item.title, 'La Oficina del Censo de China informó un aumento de exportaciones hacia Estados Unidos.'],
  [item.title, 'The Canadian Census Bureau reported higher imports from Mexico.'],
  [item.title, 'The Advance Economic Indicators report uses U.S. Census Bureau data on imports from Mexico.'],
]) assert.equal(eligible({ ...item, title }, { ...lead, text }), false, title);
assert.equal(censusTradeCalendarEligible({ ...item, title: item.title + ', según datos de la Oficina del Censo.' }, lead, 'Located body without any source attribution. '.repeat(12)), false);
assert.equal(eligible(item, { ...lead, kind: 'article' }), false);
assert.equal(eligible(item, { ...lead, url: 'https://example.com/background' }), false);
assert.equal(eligible(item, { ...lead, text: lead.text + 'x'.repeat(17000) }), false);

const record = await parseCensusCalendar(html, now);
assert.equal(record.url, CENSUS_CALENDAR_URL);
assert.match(record.text, /Statistical Month: September 2026\. Data Release: November 4, 2026\. Day: WED/);
assert.match(record.text, /8:30am \(Eastern\)/);
assert.doesNotMatch(record.text, /October 28|October 27|complete table|next release/);
assert.deepEqual(shapeEvidenceRecord(record), record);
assert.match((await parseCensusCalendar(html, new Date('2026-11-04T13:29:00Z'))).text, /November 4, 2026/);
assert.match((await parseCensusCalendar(html, new Date('2026-11-04T13:30:00Z'))).text, /December 8, 2026/);
assert.equal(await parseCensusCalendar(html, new Date('2028-01-01T12:00:00Z')), null);
assert.equal(await parseCensusCalendar(html, new Date('invalid')), null);
const firstSection = html.slice(html.indexOf('<h2'), html.indexOf('<h2', html.indexOf('<h2') + 1));
for (const [label, malformed] of [
  ['wrong heading', html.replace('FT900 U.S. International Trade in Goods and Services', 'Advance Economic Indicators')],
  ['duplicate heading', html.replace('</main>', firstSection + '</main>')],
  ['unclosed table', html.replace('</table>', '')],
  ['unclosed cell', html.replace('</td>', '')],
  ['unclosed row', html.replace('</tr>', '')],
  ['extra table', html.replace('</table>', '</table><table><tr><td>qualifier</td></tr></table>')],
  ['nested table', html.replace('September 2026', '<table><tr><td>September 2026</td></tr></table>')],
  ['renamed column', html.replace('Statistical Month', 'Publication Month')],
  ['row span', html.replace('<td>November 4, 2026', '<td rowspan="2">November 4, 2026')],
  ['column span', html.replace('<td>November 4, 2026', '<td colspan="2">November 4, 2026')],
  ['orphan qualifier', html.replace('</tbody>', '<td>All dates tentative</td></tbody>')],
  ['extra column', html.replace('Statistical Month</th>', 'Statistical Month</th><th>Other</th>')],
  ['bad month', html.replace('September 2026', 'Septober 2026')],
  ['missing month', html.replace('October 2026</td>', 'November 2026</td>')],
  ['duplicate month', html.replace('October 2026</td>', 'September 2026</td>')],
  ['impossible date', html.replace('November 4, 2026', 'November 31, 2026')],
  ['wrong weekday', html.replace('WED</div>', 'THU</div>')],
  ['earlier unknown', html.replace('November 4, 2026', 'TBD').replace('WED</div>', 'TBD</div>')],
  ['unknown footer', html.replace('TBD - To Be Determined', 'Dates depend on approval')],
  ['extra note', html.replace('</table>', '</table><p>Dates may be delayed.</p>')],
  ['note inside table', html.replace('</tbody>', '<p>Dates require approval.</p></tbody>')],
  ['hidden row', html.replace('<tbody>', '<tbody hidden>')],
  ['oversized response', html + 'x'.repeat(256 * 1024)],
]) assert.equal(await parseCensusCalendar(malformed, now), null, label);
for (const [label, wrapper] of [
  ['comment', value => `<!--${value}-->`],
  ['script', value => `<script>${value}</script>`],
  ['template', value => `<template>${value}</template>`],
  ['hidden', value => `<div hidden>${value}</div>`],
  ['attribute', value => `<div data-example="${value.replaceAll('"', "'")}">example</div>`],
]) {
  assert.equal(await parseCensusCalendar(wrapper(firstSection), now), null, label);
  assert.deepEqual(await parseCensusCalendar(wrapper(firstSection) + html, now), record, `${label} cannot replace live source`);
}

let calls = 0;
const fetchText = async (url, options) => {
  calls++;
  assert.equal(url, CENSUS_CALENDAR_URL);
  assert.deepEqual(options.allowedHosts, ['www.census.gov', 'census.gov']);
  assert.equal(options.maxBytes, 256 * 1024);
  assert.equal(options.timeoutMs, 10000);
  return { url, text: html };
};
const load = createCensusCalendarLoader({ now, fetchText });
assert.equal(await load(item, { ...lead, kind: 'article' }, lead.text), null);
assert.equal(calls, 0);
assert.deepEqual(await Promise.all([load(item, lead, lead.text), load(item, lead, lead.text)]), [record, record]);
assert.equal(calls, 1);
await createCensusCalendarLoader({ now, fetchText })(item, lead, lead.text);
assert.equal(calls, 2, 'a new edition fetches fresh evidence');
let failures = 0;
const unavailable = createCensusCalendarLoader({ now, fetchText: async () => { failures++; throw Error('timeout'); } });
assert.deepEqual(await Promise.all([unavailable(item, lead, lead.text), unavailable(item, lead, lead.text)]), [null, null]);
assert.equal(failures, 1);
assert.equal(await createCensusCalendarLoader({ now, fetchText: async () => ({ url: 'http://127.0.0.1/', text: html }) })(item, lead, lead.text), null);
assert.equal(await createCensusCalendarLoader({ fetchText })(item, lead, lead.text), null, 'no wall-clock fallback');

// Exercise the real evidenceFor boundary with a source stub, never a provider call.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-census-evidence-'));
try {
  fs.cpSync(path.join(root, 'pipeline'), path.join(tmp, 'pipeline'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(tmp, 'pipeline/lib/fetch-article.js'), `export async function fetchArticle(){return globalThis.fixtureArticle;}`);
  const runner = `
    import assert from 'node:assert/strict';
    import { evidenceFor } from './pipeline/build-edition.mjs';
    const item=${JSON.stringify({ ...item, dek: 'Mexican exports grew.', _coverage: Array.from({ length: 4 }, (_, i) => ({ url: `https://example.com/${i}`, source: 'Other reporting', title: 'Mexican exports', summary: 'Source context.' })) })};
    const record=${JSON.stringify(record)};
    let calls=0;const load=async()=>{calls++;return record;};
    globalThis.fixtureArticle={ok:true,articleBody:true,text:${JSON.stringify(lead.text)}};
    const standing=[0,1].map(i=>({id:'standing-'+i,fact:'Mexican exports supply goods.',source:'Official source',url:'https://example.org/'+i}));
    const calendar=[{id:'other',date:'2026-11-05',label:'Mexican exports',source:'Official source',sourceUrl:'https://example.net/calendar'}];
    const evidence=await evidenceFor(item,standing,calendar,[],load);
    assert.equal(evidence.length,6);assert.deepEqual(evidence[1],record);assert.equal(calls,1);
    globalThis.fixtureArticle={ok:true,articleBody:false,text:'fallback'};
    const snippet=await evidenceFor({...item,_coverage:[]},[],[],[],load);
    assert.equal(snippet.length,1);assert.equal(snippet[0].kind,'article');assert.equal(calls,1);
    globalThis.fixtureArticle={ok:true,articleBody:true,text:'x'.repeat(17000)};
    assert.deepEqual(await evidenceFor(item,[],[],[],load),[]);assert.equal(calls,1);
  `;
  fs.writeFileSync(path.join(tmp, 'check.mjs'), runner);
  const result = spawnSync(process.execPath, ['check.mjs'], { cwd: tmp, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log('Census calendar: source scope, timing, failures, cache and evidence boundary pass');
