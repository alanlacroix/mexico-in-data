import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const template = fs.readFileSync(path.join(root, 'chart.njk'), 'utf8');
const scriptMatch = template.match(/<script type="module">([\s\S]*?)<\/script>/);
assert(scriptMatch, 'chart module script is missing');

let core = scriptMatch[1].replace(
  /^import .*?;$/m,
  `const enNum=n=>Number(n).toLocaleString('en-US');
   const fmt=(id,v,units='')=>({v:Number(v).toFixed(units.includes('%')?1:2),s:units.includes('%')?'%':''});
   const humanSrc=u=>u; const seriesId=()=>''; const valueAgo=()=>null;`
);
const stop = core.indexOf('/* ============================ BINDINGS ============================ */');
assert(stop > 0, 'chart calculation boundary is missing');
core = core.slice(0, stop);

const inputIds = [
  'banxico-usdmxn-fix', 'banxico-tasa-objetivo', 'fred-fedfunds',
  'banxico-inflacion', 'banxico-inflacion-subyacente',
  'banxico-exports-total', 'fred-us-indpro', 'banxico-remesas',
  'banxico-salario-minimo', 'banxico-inpc'
];
const payloads = Object.fromEntries(inputIds.map(id => [
  id,
  JSON.parse(fs.readFileSync(path.join(root, 'data/series', `${id}.json`), 'utf8'))
]));

const checks = `
  Object.assign(store, ${JSON.stringify(payloads)});
  Object.keys(DERIVED).forEach(id=>{ store[id]=DERIVED[id].build(); });

  const pesoIds=['banxico-usdmxn-fix','d-rate-gap'];
  const pesoCommon=latestCompleteCommon(pesoIds);
  if(!pesoCommon)throw new Error('peso question has no complete common period');
  const rawPesoLatest=bucketKey(lastPt('banxico-usdmxn-fix').date,3);
  const now=new Date(),currentKey=now.getUTCFullYear()+'-'+String(now.getUTCMonth()+1).padStart(2,'0');
  if(rawPesoLatest===currentKey&&pesoCommon.key===currentKey)throw new Error('partial current month used as a complete answer');
  if(Object.values(pesoCommon.points).some(p=>bucketKey(p.date,3)!==pesoCommon.key))throw new Error('answer mixes periods');

  const answers=[answerPesoRates(),answerInflation(),answerUsDemand(),answerRemittances(),answerWages()];
  if(answers.some(a=>a.unavailable||!a.asOf))throw new Error('a saved question lacks a dated answer');
  if(!/^(Yes|No|Not cleanly)\\b/.test(answers[1].explain))throw new Error('inflation question does not answer the question directly');
  if(!answers[3].answer.includes('MX$'))throw new Error('converted remittances are not clearly labeled as Mexican pesos');
  if(answers[0].explain.includes('12-month moves'))throw new Error('peso answer overstates the available comparison period');

  store['test-range']={data:Array.from({length:10},(_,i)=>({date:'2025-'+String(i+1).padStart(2,'0')+'-01',value:i+1})),meta:{}};
  const short=availableRanges(['test-range']);
  if(short.has('1Y')||short.has('3Y')||short.has('5Y')||!short.has('MAX'))throw new Error('short data enabled an unsupported range');
  store['test-range']={data:Array.from({length:37},(_,i)=>{const d=new Date(Date.UTC(2022,i,1));return{date:d.toISOString().slice(0,10),value:i+1};}),meta:{}};
  const long=availableRanges(['test-range']);
  if(!long.has('1Y')||!long.has('3Y')||long.has('5Y'))throw new Error('range coverage calculation is wrong');

  if(validMode('not-a-mode')!==null)throw new Error('invalid mode was accepted');
  if(modeAvail(pesoIds).actual)throw new Error('incompatible units were allowed on one actual scale');
  const gap=store['d-rate-gap']; store['d-rate-gap']=null;
  if(!answerPesoRates().unavailable)throw new Error('missing input did not produce an unavailable answer');
  store['d-rate-gap']=gap;

  state.r='MAX';
  const exportRows=buildRows(['banxico-exports-total']);
  const exportCsvLast=exportRows.csv.rows[exportRows.csv.rows.length-1],exportRawLast=lastPt('banxico-exports-total');
  if(exportCsvLast[2]!==exportRawLast.value)throw new Error('single-series CSV changed the source numeric value');
  if(exportCsvLast[3]!==meta('banxico-exports-total').units)throw new Error('single-series CSV unit does not describe its numeric value');
  if(exportRows.cols[1]!==label('banxico-exports-total'))throw new Error('display table repeats a registry unit that may not match its formatted cells');

  const derivedRows=buildRows(['d-remesas-mxn']).csv;
  const derivedLast=derivedRows.rows[derivedRows.rows.length-1],derivedRawLast=lastPt('d-remesas-mxn');
  if(derivedLast[2]!==derivedRawLast.value||derivedLast[3]!==meta('d-remesas-mxn').units)throw new Error('derived-series CSV value and unit do not match');

  const compareIds=['banxico-remesas','d-remesas-mxn'],compare=buildRows(compareIds).csv,aligned=alignAll(compareIds);
  const compareLast=compare.rows[compare.rows.length-1],alignedIndex=aligned.n-1;
  if(compareLast[1]!==aligned.series[0].pts[alignedIndex].value||compareLast[2]!==meta(compareIds[0]).units)throw new Error('first comparison CSV value and unit do not match');
  if(compareLast[5]!==aligned.series[1].pts[alignedIndex].value||compareLast[6]!==meta(compareIds[1]).units)throw new Error('derived comparison CSV value and unit do not match');

  globalThis.__chartContract={period:pesoCommon.key,answers:answers.map(a=>a.asOf)};
`;

const context = { console, URL, Date, Map, Set, Intl, Number, Math, JSON, globalThis: null };
context.globalThis = context;
vm.runInNewContext(core + checks, context, { filename: 'chart-contract.vm.js' });
assert(context.__chartContract?.period, 'chart contract checks did not finish');

assert(template.includes('opts.axisCad||cadOf(ser[0].id)'), 'aligned chart axis does not use the aligned cadence');
assert(template.includes('axisCad:AL.freq'), 'comparison chart does not pass its aligned cadence');
assert(template.includes("state.mode&&!modeAvail(ids)[state.mode]"), 'stored comparison mode is not checked against selected series');
assert(template.includes('Separate scales'), 'separate-scale mode is not named clearly');
assert(template.includes('The selected data do not cover this range'), 'unsupported ranges are not explained');

console.log(`chart-contract: ok (${context.__chartContract.period}; ${context.__chartContract.answers.join(', ')})`);
