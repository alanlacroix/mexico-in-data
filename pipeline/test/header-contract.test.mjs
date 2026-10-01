import assert from 'node:assert/strict';
import fs from 'node:fs';
import uiStrings from '../../_data/uiStrings.js';
import {validateProductionPage} from '../verify-production.mjs';
const hash='a'.repeat(64);
for(const [locale,route] of [['en','/'],['es','/es/']]){
  const good=`<article data-artifact-hash="${hash}"><span class="mast-tag">${uiStrings[locale].tagline}</span></article>`;
  assert.doesNotThrow(()=>validateProductionPage(good,route,hash));
  assert.throws(()=>validateProductionPage(good.replace(hash,'b'.repeat(64)),route,hash),/approved artifact/);
  assert.throws(()=>validateProductionPage(good.replace(uiStrings[locale].tagline,'old weekly copy'),route,hash),/current bilingual header/);
}
const sources=JSON.parse(fs.readFileSync(new URL('../news-sources.json',import.meta.url))).sources;
const direct=new Set(sources.filter(s=>s.type!=='gnews' && !new URL(s.url).hostname.includes('news.google.'))
  .map(s=>new URL(s.url).hostname.replace(/^www\./,'')));
assert.ok(direct.size>=50,'50+ claim must remain backed by distinct direct source hosts, excluding aggregator feeds');
assert.match(uiStrings.en.tagline,/50\+ news sources/);assert.match(uiStrings.es.tagline,/más de 50 fuentes/);
console.log(`header contract: ok (${direct.size} distinct direct source hosts)`);
