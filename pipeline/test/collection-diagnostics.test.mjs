import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dns from 'node:dns/promises';
import { pathToFileURL } from 'node:url';
import { collectionErrorDetails } from '../collect-news.js';

for (const [message, code] of [
  ['request deadline exceeded', 'DEADLINE_EXCEEDED'],
  ['response exceeds size limit', 'SIZE_LIMIT'],
  ['redirect limit reached', 'REDIRECT_LIMIT'],
  ['redirect left the allowed public destination', 'UNSAFE_REDIRECT'],
  ['URL is not an allowed public HTTPS destination', 'UNSAFE_DESTINATION'],
  ['destination is not public', 'UNSAFE_DESTINATION'],
  ['destination did not resolve exclusively to public addresses', 'UNSAFE_DESTINATION'],
]) assert.deepEqual(collectionErrorDetails(new Error(message)), { error_code: code, error_http_status: null });
for (const status of [403, 429, 500, 503]) assert.deepEqual(collectionErrorDetails(new Error(`HTTP ${status}`)), { error_code: 'HTTP_ERROR', error_http_status: status });
for (const code of ['EAI_AGAIN', 'ENOTFOUND', 'ENODATA', 'EAI_FAIL']) {
  assert.equal(collectionErrorDetails({ code }).error_code, 'DNS_ERROR');
  assert.equal(collectionErrorDetails({ cause: { code } }).error_code, 'DNS_ERROR');
}
for (const code of ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE']) assert.equal(collectionErrorDetails({ cause: { code } }).error_code, 'TRANSPORT_ERROR');
const secret = 'https://user:secret@example.org/?token=private\nAuthorization: private';
for (const error of [undefined, null, secret, {message: secret}, {message:`HTTP 403 ${secret}`}, {message:'HTTP 999'}, {code:secret,cause:{code:secret}}, {message: 'fetch failed',cause:{message:secret}}]) {
  assert.deepEqual(collectionErrorDetails(error), {error_code:'FETCH_ERROR',error_http_status:null});
  assert.deepEqual(collectionErrorDetails(error,'parse'), {error_code:'PARSE_ERROR',error_http_status:null});
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'brief-diagnostics-'));
const originalFetch=globalThis.fetch, originalLookup=dns.lookup, originalLog=console.log;
try {
  fs.mkdirSync(path.join(root,'pipeline/lib'),{recursive:true});fs.mkdirSync(path.join(root,'data/news'),{recursive:true});
  fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
  for(const file of ['collect-news.js','lib/news-trust.js','lib/url-safety.js']) fs.copyFileSync(new URL(`../${file}`,import.meta.url),path.join(root,'pipeline',file));
  fs.writeFileSync(path.join(root,'pipeline/news-sources.json'),JSON.stringify({meta:{beatToTag:{}},sources:[{id:'test',name:'Test',url:'https://example.org/feed',tier:1,mx:true,beat:'economy',lang:'es'}]}));
  const {collectNews}=await import(pathToFileURL(path.join(root,'pipeline/collect-news.js')));
  const valid='<rss><channel><item><title>Mexico investment increases</title><link>https://example.org/mexico-investment</link><pubDate>Fri, 16 Oct 2026 20:09:26 GMT</pubDate></item></channel></rss>';
  const cases=[
    ['http',()=>new Response('',{status:503}),'HTTP_ERROR',503],
    ['oversize',()=>new Response('',{headers:{'content-length':'4194305'}}),'SIZE_LIMIT',null],
    ['redirect',()=>new Response('',{status:302,headers:{location:'https://other.example/feed'}}),'UNSAFE_REDIRECT',null],
    ['redirect-limit',()=>new Response('',{status:302,headers:{location:'https://example.org/feed'}}),'REDIRECT_LIMIT',null],
    ['dns',()=>{throw new Error('fetch must not run after DNS failure');},'DNS_ERROR',null],
    ['deadline',()=>{throw new Error('request deadline exceeded');},'DEADLINE_EXCEEDED',null],
    ['transport',()=>{throw Object.assign(new Error(secret),{code:'ECONNRESET'});},'TRANSPORT_ERROR',null],
    ['unknown',()=>{throw new Error(secret);},'FETCH_ERROR',null],
    ['empty',()=>new Response('<rss><channel/></rss>'),'EMPTY_FEED',null],
    ['valid',()=>new Response(valid),null,null],
  ];
  for(const [label,response,code,status] of cases) for(const legacy of [true,false]) {
    const dir=path.join(root,'data/news');const lastGood='{"meta":{"lastGood":true},"articles":[]}';
    fs.writeFileSync(path.join(dir,'wire.json'),lastGood);fs.writeFileSync(path.join(dir,'2026-W42.json'),'[]');
    fs.writeFileSync(path.join(dir,'health.json'),JSON.stringify({test:{last_success:'2026-10-15T00:00:00Z',consecutive_failures:2,...(!legacy?{error_code:'HTTP_ERROR',error_http_status:429}:{})}}));
    dns.lookup=async()=>{if(label==='dns')throw Object.assign(new Error(secret),{code:'EAI_AGAIN'});return [{address:'8.8.8.8',family:4}];};globalThis.fetch=async()=>response();
    const logs=[];console.log=(line)=>logs.push(line);
    try{await collectNews({now:new Date('2026-10-17T21:00:00Z')});assert.equal(label,'valid');}catch(e){assert.notEqual(label,'valid');assert.match(e.message,/catastrophic news collection failure/);assert.equal(fs.readFileSync(path.join(dir,'wire.json'),'utf8'),lastGood);}
    const h=JSON.parse(fs.readFileSync(path.join(dir,'health.json'))).test;
    assert.equal(h.error_code,code,label);assert.equal(h.error_http_status,status,label);
    assert.equal(h.fetch_ok,label==='valid');assert.equal(h.consecutive_failures,label==='valid'?0:3);
    assert.equal(h.last_success,label==='valid'?'2026-10-17T21:00:00.000Z':'2026-10-15T00:00:00Z');
    assert.equal(h.newest_published_at,label==='valid'?'2026-10-16T20:09:26.000Z':null);
    assert.ok(!JSON.stringify(h).includes('private'));assert.ok(!logs.join('\n').includes('private'));
    if(code)assert.ok(logs.some(x=>x.includes(`[${code}${status?' '+status:''}]`)));
  }
  // Exercise the collector's real phase transition, rather than only its classifier.
  fs.writeFileSync(path.join(root,'pipeline/news-sources.json'),JSON.stringify({meta:{beatToTag:{}},sources:[{id:'json',name:'JSON source',url:'https://example.org/api',format:'jsonapi',tier:1}]}));
  const {collectNews:collectJson}=await import(pathToFileURL(path.join(root,'pipeline/collect-news.js')).href+'?json-parser-case');
  dns.lookup=async()=>[{address:'8.8.8.8',family:4}];globalThis.fetch=async()=>new Response('{invalid private body');
  await assert.rejects(collectJson({now:new Date('2026-10-17T21:01:00Z')}),/catastrophic news collection failure/);
  const parseHealth=JSON.parse(fs.readFileSync(path.join(root,'data/news/health.json'))).json;
  assert.equal(parseHealth.error_code,'PARSE_ERROR');assert.equal(parseHealth.error_http_status,null);
  assert.equal(parseHealth.consecutive_failures,1);assert.equal(parseHealth.last_success,null);
  assert.ok(!JSON.stringify(parseHealth).includes('private'));
} finally {globalThis.fetch=originalFetch;dns.lookup=originalLookup;console.log=originalLog;fs.rmSync(root,{recursive:true,force:true});}
console.log('collection diagnostics: allowlisted codes, redaction, legacy persistence and unchanged health semantics pass');
