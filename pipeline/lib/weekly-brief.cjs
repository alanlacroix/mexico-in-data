'use strict';
const {bilingualFidelityFlags}=require('./bilingual-fidelity.cjs');
const fields=['headline','change','context','reason','before','now','margin'];
function validateWeekly(w,editorialDate){
 const errors=[];
 const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
 const https=x=>{try{const u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password&&!/[?&](token|api_?key|key)=/i.test(u.search);}catch{return false;}};
 const bilingual=(obj,keys,label)=>{for(const key of keys){for(const lang of ['en','es'])if(typeof obj?.[lang]?.[key]!=='string'||!obj[lang][key].trim()||/[<>]/.test(obj[lang][key]))errors.push(`${label}.${lang}.${key} needs plain text`);if(obj?.en?.[key]&&obj?.es?.[key])errors.push(...bilingualFidelityFlags({english:obj.en[key],spanish:obj.es[key]}).map(x=>`${label}.${key}: ${x}`));}};
 if(!w||typeof w!=='object')return ['weeklyBrief must be an object'];
 if(!day(w.start)||!day(w.through)||w.start>w.through||w.through!==editorialDate||Date.parse(w.through)-Date.parse(w.start)>6*86400000)errors.push('weeklyBrief needs a valid coverage interval ending on the editorial date');
 bilingual(w,['overview','method'],'weeklyBrief');
 if(!Array.isArray(w.items)||w.items.length<1||w.items.length>5)errors.push('weeklyBrief needs 1–5 ranked developments');
 const ids=new Set();
 for(const item of (Array.isArray(w.items)?w.items:[])){if(!/^[a-z0-9-]+$/.test(item.id)||ids.has(item.id))errors.push('weeklyBrief development IDs must be safe and unique');ids.add(item.id);bilingual(item,fields,item.id);if(!Array.isArray(item.sources)||!item.sources.length||item.sources.some(s=>!s.source||!https(s.url)))errors.push(`${item.id} needs named HTTPS sources`);}
 if(!Array.isArray(w.dates)||w.dates.length>3)errors.push('weeklyBrief allows up to 3 confirmed dates');
 for(const event of (Array.isArray(w.dates)?w.dates:[])){if(!day(event.date)||event.date<=w.through||!https(event.url)||!event.source||!event.en||!event.es)errors.push('weeklyBrief dates need a future date, source and both languages');else errors.push(...bilingualFidelityFlags({english:event.en,spanish:event.es}));}
 return errors;
}
function readingMinutes(w,locale){const text=[w[locale].overview,w[locale].method,...w.items.flatMap(i=>fields.map(f=>i[locale][f])),...w.dates.map(d=>d[locale])].join(' ');return Math.max(1,Math.ceil(text.split(/\s+/).length/200));}
module.exports={validateWeekly,readingMinutes};
