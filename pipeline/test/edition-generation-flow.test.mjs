// Exercise the real builder through collection-independent fixtures and stubbed
// provider responses. Published Oct 1 prose is an immutable regression fixture;
// no source fetch, paid request, production ledger or public file is touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'data/editions/2026-10-01.json')));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-flow-'));
try {
  fs.cpSync(path.join(root,'pipeline'),path.join(tmp,'pipeline'),{recursive:true});
  fs.writeFileSync(path.join(tmp,'package.json'),'{"type":"module"}');
  const sources=JSON.parse(fs.readFileSync(path.join(root,'pipeline/news-sources.json'))).sources;
  const drafts=Object.fromEntries(fixture.stories.map(story=>[story.url,{
    ...story.en,es:story.es,...Object.fromEntries(['headline','dek','background','view','watch'].map(field=>[`${field}Refs`,['article']])),
  }]));
  const rows=fixture.stories.map(story=>{
    const source=sources.find(source=>new URL(source.url).hostname.replace(/^www\./,'')===new URL(story.url).hostname.replace(/^www\./,''));
    assert.ok(source,story.url);
    return {id:story.id,url:story.url,title:story.es.headline,dek:story.es.dek + ' Información de México.',source:new URL(story.url).hostname,
      sourceName:story.source,sourceId:source.id,tier:source.tier,beat:'economy',lang:'es',published_at:'2026-10-01T12:00:00Z'};
  });
  const runner=`
    import fs from 'node:fs';
    import dns from 'node:dns/promises';
    dns.lookup=async()=>[{address:'93.184.216.34',family:4}];
    const drafts=${JSON.stringify(drafts)};
    const calls=[];
    globalThis.fetch=async(url,init)=>{
      if(String(url).includes('api.anthropic.com')){
        const body=JSON.parse(init.body);const inputs=JSON.parse(body.messages[0].content);
        const audit=body.output_config.format.schema.required.includes('reviews');
        calls.push({audit,indices:inputs.map(row=>row.i)});
        const key=audit?'reviews':'stories';
        let values=inputs.map((row,index)=>['s'+row.i,audit?{ok:process.env.FLOW_CASE!=='audit-reject',problems:[]}:drafts[row.story?.url]||drafts[Object.keys(drafts).find(url=>inputs.length===1)]]);
        if(!audit && calls.length===1 && ['partial','partial-unrepairable'].includes(process.env.FLOW_CASE))values=values.slice(0,1);
        if(!audit && calls.length===2){
          values=inputs.map(row=>{const url=row.evidence.find(e=>e.id==='article').url;return ['s'+row.i,drafts[url]];});
        }
        fs.writeFileSync('calls.json',JSON.stringify(calls));
        const maximumUsage=process.env.FLOW_CASE==='partial-unrepairable' && calls.length===1;
        return {ok:true,json:async()=>({usage:{input_tokens:maximumUsage?new TextEncoder().encode(JSON.stringify(body)).byteLength+1024:1,output_tokens:maximumUsage?body.max_tokens:1},content:[{type:'text',text:JSON.stringify({[key]:Object.fromEntries(values)})}]})};
      }
      const draft=drafts[String(url)];
      if(!draft)return new Response('',{status:404});
      const text=[...Object.values(draft.es),...['headline','dek','background','view','watch'].map(f=>draft[f])].join(' ');
      return new Response('<html><article class="article-body"><p>'+text+'</p></article></html>',{headers:{'content-type':'text/html'}});
    };
    const {main}=await import('./pipeline/build-edition.mjs');
    await main();
  `;
  fs.writeFileSync(path.join(tmp,'run.mjs'),runner);
  for(const scenario of ['complete','partial','partial-unrepairable','audit-reject','budget-block']){
    fs.mkdirSync(path.join(tmp,'data/news'),{recursive:true});
    fs.writeFileSync(path.join(tmp,'data/edition.json'),JSON.stringify(fixture));
    fs.writeFileSync(path.join(tmp,'data/edition-attempts.json'),'{"schemaVersion":1,"attempts":[]}');
    fs.writeFileSync(path.join(tmp,'data/llm-spend.json'),JSON.stringify({'2026-10':scenario==='budget-block'?6:scenario==='partial-unrepairable'?0.02:0}));
    fs.writeFileSync(path.join(tmp,'data/events.json'),'{"events":[]}');
    fs.writeFileSync(path.join(tmp,'data/standing.json'),'{"facts":[]}');
    fs.writeFileSync(path.join(tmp,'data/news/2026-W40.json'),JSON.stringify(rows));
    fs.rmSync(path.join(tmp,'calls.json'),{force:true});
    const before=fs.readFileSync(path.join(tmp,'data/edition.json'),'utf8');
    const result=spawnSync(process.execPath,['run.mjs'],{cwd:tmp,encoding:'utf8',timeout:30000,
      env:{...process.env,GITHUB_ACTIONS:'false',ANTHROPIC_API_KEY:'test-only',LLM_BUDGET_OVERRIDE:'',
        LLM_LEDGER_PATH:path.join(tmp,'data/llm-spend.json'),EDITION_NOW_ISO:'2026-10-01T12:30:00Z',
        PUBLICATION_DATE:'2026-10-01',PUBLICATION_SLOT:'morning',EDITION_SKIP_COLLECTION:'1',
        EDITION_RETRY_FAILED:'0',EDITION_REQUIRE_REVIEW:'0',FLOW_CASE:scenario}});
    const calls=fs.existsSync(path.join(tmp,'calls.json'))?JSON.parse(fs.readFileSync(path.join(tmp,'calls.json'))):[];
    if(scenario==='complete'||scenario==='partial'){
      assert.equal(result.status,0,`${scenario}: ${result.stderr}\n${result.stdout}`);
      const out=JSON.parse(fs.readFileSync(path.join(tmp,'data/edition.json')));
      assert.equal(out.stories.length,3,scenario);
      assert.equal(calls.length,scenario==='partial'?3:2,scenario);
      if(scenario==='partial'){
        assert.equal(calls[1].indices.length,2,'only missing units are repaired');
        assert.ok(!calls[1].indices.includes(calls[0].indices[0]),'passing unit is preserved');
        assert.equal(calls[2].indices.length,3,'independent audit checks all restored units');
      }
    }else{
      assert.notEqual(result.status,0,scenario);
      assert.equal(fs.readFileSync(path.join(tmp,'data/edition.json'),'utf8'),before,'failure preserves last-good bytes');
      if(scenario==='budget-block')assert.equal(calls.length,0,'budget refusal occurs before provider fetch');
      if(scenario==='partial-unrepairable')assert.equal(calls.filter(call=>call.audit).length,0,'an unaffordable partial draft must not spend on an unusable audit');
    }
    assert.ok(calls.length<=3,'no internal model retry runaway');
  }
  console.log('edition generation flow: ok');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
