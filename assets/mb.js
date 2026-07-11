/* mb.js — The Mexico Brief shared render toolkit. Extracted verbatim from index.njk's
   inline <script> so section pages render from the SAME code and the SAME JSON as the
   homepage (a tile and its section exhibit must never disagree). The homepage will be
   migrated onto this module later; until then keep these functions byte-for-byte in sync. */

/* ---- tiny helpers ---- */
const $ = (s) => document.querySelector(s);
export const enNum = (n) => Number(n).toLocaleString('en-US');
async function J(p){ const r=await fetch(p); if(!r.ok) throw new Error(p+' '+r.status); return r.json(); }

/* ---- the series map + composites (module state; loadSeries() populates these) ---- */
export const S = {};
export let NEWS = null, EVENTS = null, HAPPENING = null;

export const MON  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const MONL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export function monLong(iso){ const d=new Date(iso); return isNaN(d)?iso:MONL[d.getUTCMonth()]+' '+d.getUTCFullYear(); }
export function dayShort(iso){ const d=new Date(iso); return isNaN(d)?iso:MON[d.getUTCMonth()]+' '+d.getUTCDate(); }
export function qtrOf(iso){ const d=new Date(iso); if(isNaN(d))return iso; return 'Q'+(Math.floor(d.getUTCMonth()/3)+1)+' '+d.getUTCFullYear(); }
export function relTime(ms){ const s=Math.max(0,(Date.now()-ms)/1000); if(s<5400)return Math.max(1,Math.round(s/60))+' min ago'; if(s<86400)return Math.round(s/3600)+'h ago'; return Math.round(s/86400)+'d ago'; }
export function evDate(e){ const d=new Date(e.date); return {mo:MON[d.getUTCMonth()],day:d.getUTCDate(),y:d.getUTCFullYear()}; }

/* ---- formatters ---- */
export function fmt(id,v,units){
  units=units||'';
  if(id==='banxico-reservas') return {v:'$'+enNum(Math.round(v/1000)), s:'bn USD'};
  if(id==='banxico-remesas') return {v:'$'+enNum(Math.round(v)), s:'mn USD'};
  if(id==='banxico-remesas-electronicas') return {v:'$'+enNum(Math.round(v)), s:'mn USD'};
  if(id==='banxico-spei-operaciones') return {v:enNum(Math.round(v/1e6)), s:'mn/mo'};        // millions of transfers per month
  if(id==='banxico-spei-monto') return {v:'$'+(v/1e12).toFixed(1), s:'tn MXN/mo'};           // trillions of pesos per month
  if(id==='banxico-codi-operaciones') return {v:enNum(Math.round(v/1e3)), s:'k ops/mo'};     // thousands of operations per month
  if(id==='wb-gdp-usd') return {v:'$'+(v/1e12).toFixed(2), s:'tn USD'};
  if(id==='wb-population') return {v:(v/1e6).toFixed(1), s:'mn'};
  if(id==='wb-gdp-per-capita') return {v:'$'+enNum(Math.round(v)), s:'USD'};
  if(id==='banxico-pib-crecimiento'||id==='banxico-igae') return {v:(v>=0?'+':'')+v.toFixed(1), s:'%'};
  if(id==='banxico-salario-minimo') return {v:'$'+v.toFixed(2), s:'MXN/day'};
  if(units.includes('per USD')) return {v:v.toFixed(2), s:'MXN/USD'};
  if(units.includes('per liter')) return {v:'$'+v.toFixed(2), s:'MXN/L'};
  if(units.includes('%')) return {v:v.toFixed(1), s:'%'};
  return {v:enNum(Math.round(v)), s:''};
}
export function fmtRem(v){ return {v:'$'+enNum(Math.round(v)), s:'mn USD'}; }
export function stampFor(m, id){
  const cad=(m.cadence||'')+'', v=m.vintage;
  if(id==='banxico-tasa-objetivo') return {cls:'',t:'CURRENT SETTING'};   // a discrete Banxico decision, not live market data
  if(/4-hour|business-daily/.test(cad)) return {cls:'live',t:'● LIVE'};   // genuinely live market data (the peso FIX)
  if(/daily/.test(cad)) return {cls:'',t:'DAILY · '+dayShort(v)};
  if(/weekly/.test(cad)) return {cls:'',t:'WEEKLY · '+dayShort(v)};
  if(/monthly/.test(cad)) return {cls:'',t:'MONTHLY · '+monLong(v)+' data'};
  if(/quarter/.test(cad)) return {cls:'',t:'QUARTERLY · '+qtrOf(v)};
  if(/annual|yearly/.test(cad)) return {cls:'',t:'ANNUAL · '+String(v).slice(0,4)};
  return {cls:'',t:String(v)};
}
export function valueAgo(data,days){ const last=new Date(data[data.length-1].date), tgt=last-days*864e5; let best=data[0],bd=1e18; for(const p of data){const d=Math.abs(new Date(p.date)-tgt);if(d<bd){bd=d;best=p;}} return best.value; }
// Send source links to a human-readable page, not the raw API endpoint.
export function humanSrc(u){ if(!u)return u; if(/SieAPIRest/i.test(u))return 'https://www.banxico.org.mx/SieInternet/'; if(/apidatamexico|tesseract|economia\.gob\.mx\/api/i.test(u))return 'https://www.economia.gob.mx/datamexico/'; return u; }
// Pull the exact series id out of the API endpoint (e.g. .../series/SF43718/datos → SF43718) so the
// disclosure names the precise series, not just the agency (the review's #1 trust ask).
export const seriesId = (u)=>{ const m=/\/series\/([A-Za-z]{2,4}\d+)/.exec(u||''); return m?m[1]:''; };
export const srcDetails = (m)=>{
  const sid=seriesId(m.sourceUrl), ret=m.fetchedAt?new Date(m.fetchedAt).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}):'';
  return `<details class="srcd"><summary>Source &amp; date</summary><div class="src-body">`+
    `<div><b>${m.source||''}</b>${sid?' · series '+sid:''}</div>`+
    (m.vintage?`<div>Observation: ${m.vintage}</div>`:'')+
    (ret?`<div>Retrieved: ${ret}</div>`:'')+
    (m.license?`<div>License: ${m.license}</div>`:'')+
    `<div><a href="${humanSrc(m.sourceUrl)}" target="_blank" rel="noopener">Open the official series ↗</a></div>`+
    `</div></details>`;
};

/* ============ CHART ENGINE (bigger, value-labels, end-labels, hover) ============ */
let CID=0; const CHARTS={};
export function niceStr(v,unit){ unit=unit||''; if(unit==='%')return v.toFixed(v>=10?0:1)+'%'; if(unit==='$')return '$'+(Math.abs(v)>=1000?(v/1000).toFixed(1)+'k':v.toFixed(0)); return v.toFixed(Math.abs(v)>=10?0:1); }
// Multi-series time-series. series=[{name,color,pts:[{date,value}]}]. opts:{unit,band,zero,green}
export function timeChart(series,opts){
  opts=opts||{}; const W=720,H=400,pl=44,pr=104,pt=10,pb=30,iw=W-pl-pr,ih=H-pt-pb;
  const all=series.flatMap(s=>s.pts.map(p=>p.value));
  let mn=opts.min!=null?opts.min:Math.min(...all), mx=opts.max!=null?opts.max:Math.max(...all);
  if(opts.zero){ if(mn>0)mn=0; if(mx<0)mx=0; }
  const pad=(mx-mn)*0.10||1; mn-=pad; mx+=pad;
  const times=series.flatMap(s=>s.pts.map(p=>+new Date(p.date)));
  const dmn=Math.min(...times),dmx=Math.max(...times);
  const X=(t)=>pl+((t-dmn)/((dmx-dmn)||1))*iw, Y=(v)=>pt+ih-((v-mn)/((mx-mn)||1))*ih;
  let g='';
  for(let k=0;k<=4;k++){const v=mn+(mx-mn)*k/4,y=Y(v);g+=`<line class="gl" x1="${pl}" y1="${y.toFixed(1)}" x2="${W-pr}" y2="${y.toFixed(1)}"/><text class="axl" x="${(pl-6).toFixed(1)}" y="${(y+3).toFixed(1)}" text-anchor="end">${niceStr(v,opts.unit)}</text>`;}
  if(opts.band){const y1=Y(opts.band[1]),y0=Y(opts.band[0]);g+=`<rect class="band" x="${pl}" y="${y1.toFixed(1)}" width="${iw.toFixed(1)}" height="${(y0-y1).toFixed(1)}"/><text class="bandl" x="${(pl+5)}" y="${(y1+11).toFixed(1)}">${opts.bandLabel||''}</text>`;}
  if(opts.zero&&mn<0&&mx>0){const yz=Y(0);g+=`<line class="zero" x1="${pl}" y1="${yz.toFixed(1)}" x2="${W-pr}" y2="${yz.toFixed(1)}"/>`;}
  series.forEach((s)=>{ const d=s.pts.map((p,i)=>(i?'L':'M')+X(+new Date(p.date)).toFixed(1)+' '+Y(p.value).toFixed(1)).join(' ');
    const cls=s.color==='green'?'ln2':'ln'; const stroke=s.color==='green'?'var(--green)':(s.color||'var(--ink)');
    g+=`<path class="${cls}" style="stroke:${stroke}" d="${d}"/>`;
    const last=s.pts[s.pts.length-1],lx=X(+new Date(last.date)),ly=Y(last.value);
    g+=`<circle class="dot" style="fill:${stroke}" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.2"/>`;
    g+=`<text class="endlab" style="fill:${stroke}" x="${(lx+7).toFixed(1)}" y="${(ly+4).toFixed(1)}">${s.name} ${niceStr(last.value,opts.unit)}</text>`;
  });
  // x labels: first, last
  const f=series[0].pts, l=f[f.length-1];
  g+=`<text class="axl" x="${pl}" y="${H-8}" text-anchor="start">${opts.xfmt?opts.xfmt(f[0].date):qtrOf(f[0].date)}</text>`;
  g+=`<text class="axl" x="${(W-pr).toFixed(1)}" y="${H-8}" text-anchor="end">${opts.xfmt?opts.xfmt(l.date):qtrOf(l.date)}</text>`;
  const id='ch'+(CID++);
  CHARTS[id]={series,X,Y,pl,pr,pt,pb,W,H,dmn,dmx,unit:opts.unit};
  g+=`<line class="cross" id="${id}-cr" y1="${pt}" y2="${pt+ih}"/>`;
  series.forEach((s,si)=>{const st=s.color==='green'?'var(--green)':(s.color||'var(--ink)');g+=`<circle class="hdot" id="${id}-hd${si}" r="3.5" style="fill:${st}"/>`;});
  return `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${g}</svg>`;
}
// Vertical bars. items=[{label,value,hi}]. opts:{unit,everyLabel,xfmt}
export function barChart(items,opts){
  opts=opts||{}; const W=720,H=380,pl=44,pr=14,pt=14,pb=34,iw=W-pl-pr,ih=H-pt-pb;
  const vals=items.map(d=>d.value); let mx=Math.max(...vals,0),mn=Math.min(...vals,0);
  const pad=(mx-mn)*0.12||1; mx+=pad; if(mn<0)mn-=pad;
  const n=items.length,gap=iw/n,bw=gap*0.66;
  const Y=(v)=>pt+ih-((v-mn)/((mx-mn)||1))*ih; const y0=Y(0);
  let g='';
  for(let k=0;k<=4;k++){const v=mn+(mx-mn)*k/4,y=Y(v);g+=`<line class="gl" x1="${pl}" y1="${y.toFixed(1)}" x2="${W-pr}" y2="${y.toFixed(1)}"/><text class="axl" x="${(pl-6)}" y="${(y+3).toFixed(1)}" text-anchor="end">${niceStr(v,opts.unit)}</text>`;}
  items.forEach((d,i)=>{const x=pl+i*gap+(gap-bw)/2,y=Y(Math.max(0,d.value)),h=Math.abs(Y(d.value)-y0);
    g+=`<rect class="${d.hi?'bar2':'bar'}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,h).toFixed(1)}" rx="1"/>`;
    if(opts.everyLabel&&(i%opts.everyLabel===0||i===n-1)){
      g+=`<text class="vlab" fill="var(--ink-2)" x="${(x+bw/2).toFixed(1)}" y="${(y-5).toFixed(1)}" text-anchor="middle">${niceStr(d.value,opts.unit)}</text>`;
      g+=`<text class="axl" x="${(x+bw/2).toFixed(1)}" y="${H-9}" text-anchor="middle">${opts.xfmt?opts.xfmt(d.label):d.label}</text>`;
    }});
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${g}</svg>`;
}
// Horizontal ranked bars. items=[{label,value,hi}] value in %
export function hbarChart(items,opts){
  opts=opts||{}; const vfmt=opts.vfmt||((v)=>v+'%');
  const W=720,rowH=items.length>7?34:40,pl=156,pr=64,pt=8,H=pt*2+items.length*rowH;
  const mx=Math.max(...items.map(d=>d.value));
  let g='';
  items.forEach((d,i)=>{const y=pt+i*rowH+(rowH-24)/2,bw=(d.value/mx)*(W-pl-pr);
    g+=`<text class="cat" x="${pl-10}" y="${(y+16).toFixed(1)}" text-anchor="end">${d.label}</text>`;
    g+=`<rect class="${d.hi?'bar2':'bar'}" x="${pl}" y="${y}" width="${bw.toFixed(1)}" height="24" rx="2"/>`;
    g+=`<text class="vlab" x="${(pl+bw+7).toFixed(1)}" y="${(y+16).toFixed(1)}" fill="var(--ink)">${vfmt(d.value)}</text>`;});
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${g}</svg>`;
}
// exhibit frame; optional table alt for chart<->table toggle
export function exhibit(no,finding,sub,svg,src,tableHtml,wide){
  const tid='ex'+(CID++);
  const toggle=tableHtml?`<div class="ex-toggle"><button class="on" data-t="chart" data-for="${tid}">Chart</button><button data-t="table" data-for="${tid}">Table</button></div>`:'';
  const tbl=tableHtml?`<div id="${tid}-table" style="display:none">${tableHtml}</div>`:'';
  return `<div class="exwrap${wide?' wide':''}"><div class="ex-tag"></div>`+
    `<div class="ex-head"><div><div class="ex-no">Exhibit ${no}</div><div class="ex-title">${finding}</div><div class="ex-sub">${sub}</div></div>${toggle}</div>`+
    `<div id="${tid}-chart">${svg}</div>${tbl}<div class="ex-src">${src}</div></div>`;
}
export function dataTable(cols,rows){
  return `<div class="dtbl"><table class="dt"><thead><tr>${cols.map((c,i)=>`<th class="${i===0?'k':''}">${c}</th>`).join('')}</tr></thead>`+
    `<tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td class="${i===0?'k':''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
// wire hover + toggles after innerHTML
export function wireCharts(){
  const tip=$('#charttip'); if(!tip) return;
  for(const id in CHARTS){ const el=document.getElementById(id); if(!el||el.__w)continue; el.__w=1; const C=CHARTS[id];
    el.addEventListener('pointermove',(e)=>{
      const r=el.getBoundingClientRect(),sx=(e.clientX-r.left)/r.width*C.W;
      const t=C.dmn+((sx-C.pl)/(C.W-C.pl-C.pr))*(C.dmx-C.dmn);
      const cr=document.getElementById(id+'-cr');
      let rows='',hdr='';
      C.series.forEach((s,si)=>{ let best=s.pts[0],bd=1e18; for(const p of s.pts){const d=Math.abs(+new Date(p.date)-t);if(d<bd){bd=d;best=p;}}
        const px=C.X(+new Date(best.date)),py=C.Y(best.value),st=s.color==='green'?'#0a7d4d':(s.color||'#141414');
        const hd=document.getElementById(id+'-hd'+si); if(hd){hd.setAttribute('cx',px);hd.setAttribute('cy',py);hd.style.opacity=1;}
        if(cr){cr.setAttribute('x1',px);cr.setAttribute('x2',px);cr.style.opacity=1;}
        hdr=qtrOf(best.date);
        rows+=`<div class="tr"><span class="nm"><i style="background:${st}"></i>${s.name}</span><span class="vv">${niceStr(best.value,C.unit)}</span></div>`;
      });
      tip.innerHTML=`<b>${hdr}</b>${rows}`; tip.style.opacity=1;
      tip.style.left=Math.min(e.clientX+14,innerWidth-160)+'px'; tip.style.top=(e.clientY+14)+'px';
    });
    el.addEventListener('pointerleave',()=>{ tip.style.opacity=0; const cr=document.getElementById(id+'-cr'); if(cr)cr.style.opacity=0; C.series.forEach((s,si)=>{const hd=document.getElementById(id+'-hd'+si);if(hd)hd.style.opacity=0;}); });
  }
  document.querySelectorAll('.ex-toggle button').forEach(b=>{ if(b.__w)return; b.__w=1; b.addEventListener('click',()=>{
    const t=b.dataset.t,f=b.dataset.for; b.parentNode.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
    const c=document.getElementById(f+'-chart'),tb=document.getElementById(f+'-table'); if(c)c.style.display=t==='chart'?'':'none'; if(tb)tb.style.display=t==='table'?'':'none';
  }); });
}

/* ---- verdicts + benchmarks (McKinsey voice: quantified, declarative) ---- */
export const VERDICT={
  'banxico-usdmxn-fix':(s)=>{const ago=valueAgo(s.data,365),c=(s.data.at(-1).value-ago)/ago*100;return `The peso is <b>${Math.abs(c).toFixed(1)}% ${c<0?'stronger':'weaker'}</b> than a year ago.`;},
  'banxico-inflacion':(s)=>{const v=s.data.at(-1).value;return `${v<4&&v>2?'Inside':'Above'} Banxico's 3% ± 1 target band.`;},
  'banxico-tasa-objetivo':(s)=>{const v=s.data.at(-1).value,ago=valueAgo(s.data,365),pp=(v-ago).toFixed(2).replace('-','−');return `${v===ago?'Held':(v<ago?'Cut':'Raised')} ${pp} pp over the year — one of the G20's highest real rates.`;},
  'banxico-reservas':(s)=>{const v=s.data.at(-1).value,ago=valueAgo(s.data,365),c=(v-ago)/ago*100;return `${c>=0?'+':''}${c.toFixed(1)}% over the year, near a record high.`;},
  'banxico-remesas':(s)=>{const v=s.data.at(-1).value,ago=valueAgo(s.data,365),c=(v-ago)/ago*100;return `${c>=0?'+':''}${c.toFixed(1)}% year on year — larger than oil exports or FDI.`;},
  'wb-unemployment':(s)=>`${s.data.at(-1).value.toFixed(1)}% — among the world's lowest. Informality (~55% of workers) is the counterpart, tracked separately.`,
  'banxico-pib-crecimiento':(s)=>{const v=s.data.at(-1).value;return `Real GDP is growing <b>${v>=0?'+':''}${v.toFixed(1)}% a year</b> — barely above zero.`;},
  'banxico-igae':(s)=>{const v=s.data.at(-1).value;return `Activity is <b>${v>=0?'+':''}${v.toFixed(1)}%</b> versus a year ago.`;},
  'banxico-inflacion-subyacente':(s)=>{const v=s.data.at(-1).value;return `Core inflation (${v.toFixed(1)}%) is above target — the measure Banxico watches most.`;},
  'banxico-salario-minimo':()=>`Up 2.4× in real terms since 2018 — a policy choice, not market drift.`,
  'cre-gasolina-regular':()=>`National average pump price, refreshed every 4 hours.`
};
export const BENCH={
  'banxico-usdmxn-fix':(s)=>{const w=Math.min(...s.data.slice(-252).map(p=>p.value)),k=Math.max(...s.data.slice(-252).map(p=>p.value));return `vs 12-mo range ${w.toFixed(2)}–${k.toFixed(2)}`;},
  'banxico-inflacion':()=>`vs 3% target (±1)`,
  'banxico-inflacion-subyacente':()=>`vs 3% target (±1)`,
  'banxico-tasa-objetivo':()=>`vs 2024 peak 11.25%`,
  'banxico-pib-crecimiento':()=>`vs US +2.3% · ~2% Mexico trend`,
  'banxico-igae':()=>`vs 0% = no growth`,
  'wb-unemployment':()=>`vs US ~4% · Brazil ~7%`,
  'banxico-remesas':()=>`vs ~4% of GDP`,
  'banxico-reservas':()=>`vs record high`,
  'banxico-salario-minimo':()=>`vs 2018 = 2.4× real`,
  'cre-gasolina-regular':()=>`vs US ~$0.85/L equiv.`
};

/* ============ tile (one live metric tile — extracted from the homepage board) ============
   Faithful to the homepage's renderBoard tile inner-HTML. opts.src=true appends a small
   source stamp line (used by section pages that want value + as-of + source on each tile). */
export const PP_METRICS=['banxico-tasa-objetivo','banxico-inflacion','banxico-inflacion-subyacente','banxico-pib-crecimiento','banxico-igae','wb-unemployment'];
function dirArrow(s){const d=s.data;if(d.length<2)return '';const a=d.at(-1).value,b=d.at(-2).value;return a>b?'▲':a<b?'▼':'—';}
function tileDelta(id,s){
  const d=s.data; if(d.length<3)return '';
  const cur=d.at(-1).value, ago=valueAgo(d,365); const diff=cur-ago;
  const pp=PP_METRICS.includes(id);
  if(!pp && Math.abs(diff)<Math.abs(ago)*0.005) return '';
  if(pp && Math.abs(diff)<0.05) return `<span class="dl fl">held <small>vs a year ago</small></span>`;
  const cls=diff>0?'up':'dn';
  const mag=pp?((diff>0?'+':'')+diff.toFixed(1)+'pp'):((diff>0?'+':'')+(diff/ago*100).toFixed(1)+'%');
  return `<span class="dl ${cls}">${mag} <small>vs a year ago</small></span>`;
}
function tileVal(id,s){ if(id==='banxico-remesas')return fmtRem(s.data.at(-1).value); return fmt(id,s.data.at(-1).value,s.meta.units); }
/* ---- source-class badge: the honest-source policy made visible (Fable 2026-07-11) ----
   Mexican official data is the CORE; US, multilateral, poll, market and modeled sources are
   CONTEXT, each labeled. Match on the source string. Palette stays closed — green (core) + ink
   (context) only, never six colors; the class lives in the label text, not a new hue. */
const SRC_CLASSES=[
  {key:'mx',    label:'MX OFFICIAL',  core:true,  rx:/banco de m|banxico|inegi|hacienda|coneval|conasami|sesnsp|secretar[íi]a de econom|presidencia|\bsre\b|diario oficial|\bdof\b|\bine\b|pemex|\bcfe\b|gobierno|ma[ñn]anera|security cabinet|c[áa]mara de diputad|\bsenado\b|\bcongreso\b|\bcpeum\b|constituci[óo]n|suprema corte|\bscjn\b|\bsat\b|banco de méxico/i},
  {key:'us',    label:'US OFFICIAL',  core:false, rx:/census|\bbea\b|\bbls\b|ustr|white house|federal circuit|court of appeals|u\.s\.|united states|federal reserve/i},
  {key:'multi', label:'MULTILATERAL', core:false, rx:/world bank|banco mundial|\bimf\b|\bfmi\b|ocde|oecd|comtrade|\boec\b|united nations/i},
  {key:'poll',  label:'POLL',         core:false, rx:/mitofsky|atlasintel|\bpoll\b|encuesta|as\/coa|tracker/i},
  {key:'mkt',   label:'MARKET',       core:false, rx:/moody|fitch|s&p|\bmarket\b|\bbmv\b|embi|bloomberg|reuters|\brating/i},
  {key:'model', label:'MODELED',      core:false, rx:/\bmodel|illustrat|estimate/i},
];
export function sourceClass(source){ const t=String(source||''); for(const c of SRC_CLASSES){ if(c.rx.test(t)) return c; } return {key:'other',label:'SOURCE',core:false}; }
export function srcBadge(source){ if(!source) return ''; const c=sourceClass(source); return `<span class="srcb${c.core?' core':''}" title="${c.core?'Mexican official source':'Context source — labeled, not the Mexican-official core'}">${c.label}</span>`; }

export function tile(t,opts){
  opts=opts||{}; const s=S[t.id];
  if(!s) return `<div class="tile"><div class="tl">${t.l}</div><div class="tv" style="font-size:15px;color:var(--amber2)">NOT YET WIRED</div><div class="tb">feed unavailable</div></div>`;
  const h=tileVal(t.id,s),st=stampFor(s.meta,t.id),arw=dirArrow(s),bf=BENCH[t.id];
  const src=opts.src?`<span class="tsrc">${s.meta.source||''}</span>`:'';
  return `<div class="tile" data-go="${t.id}"><div class="tl">${t.l}</div><div class="tv">${h.v} <small>${h.s}</small></div>`+
    tileDelta(t.id,s)+
    `<div class="tb">${bf?bf(s):(t.per?'<span class="arw">'+arw+'</span> '+t.per:'')}</div>`+
    `<span class="stamp ${st.cls}">${st.t}${t.ph?'<span class="chip-ph">'+t.ph+'</span>':''}</span>`+src+
    `<div class="tbadge">${srcBadge(s.meta.source)}</div>`+`</div>`;
}

/* ============ metric rows ============ */
export function mrow(cfg){
  const s=S[cfg.id];
  if(!s) return construccion({l:cfg.label,src:cfg.src||'feed in progress',cad:cfg.cad||'',eta:cfg.eta||''});
  const h=cfg.id==='banxico-remesas'?fmtRem(s.data.at(-1).value):fmt(cfg.id,s.data.at(-1).value,s.meta.units),st=stampFor(s.meta,cfg.id),vf=VERDICT[cfg.id],bf=BENCH[cfg.id];
  return `<div class="mrow" data-metric="${cfg.id}"><div class="mr-top"><span class="mr-label">${cfg.label}</span><span class="stamp ${st.cls}">${st.t}${cfg.ph?'<span class="chip-ph">'+cfg.ph+'</span>':''}</span></div>`+
    `<div class="mr-main"><span class="mr-val">${h.v} <small>${h.s}</small></span></div>`+
    (vf?`<div class="mr-verdict">${vf(s)}</div>`:'')+(bf?`<div class="mr-bench">${bf(s)}</div>`:'')+srcDetails(s.meta)+`</div>`;
}
export function construccion(o){ return `<div class="constr-lite"><span class="cl-l">${o.l}</span><span class="cl-s">not yet wired</span><span class="cl-d">${o.src}${o.cad?' · '+o.cad:''}</span></div>`; }
export function staticRow(o){
  return `<div class="mrow"><div class="mr-top"><span class="mr-label">${o.label}</span><span class="stamp">${o.stamp}</span></div>`+
    `<div class="mr-main"><span class="mr-val">${o.value} <small>${o.unit||''}</small></span></div>`+
    (o.verdict?`<div class="mr-verdict">${o.verdict}</div>`:'')+(o.bench?`<div class="mr-bench">${o.bench}</div>`:'')+
    `<details class="srcd"><summary>Source &amp; date</summary><div class="src-body">Source: <a href="${o.srcUrl}" target="_blank" rel="noopener">${o.srcName}</a></div></details></div>`;
}
export function sectionHead(no,title,dek){ return `<div class="section-head"><span class="no">${no}</span><h2>${title}</h2>${dek?`<p class="dek">${dek}</p>`:''}</div>`; }
export function fwd(html){ return `<div class="fwdline">Forward · ${html}</div>`; }
export function bandHead(t){ return `<div class="band"><span class="bl">${t}</span></div>`; }
export function tagChip(t){ return `<span class="wtag ${t||''}">${t||'econ'}</span>`; }

/* ============ loader — fetch the needed data/*.json into S + composites ============
   Base path is ./data/... exactly as the homepage uses it (resolves the same from any
   root-level page, e.g. /money.html). Missing files resolve to null / a skipped series,
   never an exception — callers render "not yet wired" rather than an error. */
const MONEY_SERIES=['banxico-usdmxn-fix','banxico-inflacion','banxico-inflacion-subyacente','banxico-tasa-objetivo','banxico-reservas','banxico-remesas'];
// Curated developments for one section — the event log (happening.json) filtered to a section,
// most-recent first. Public surfaces render THIS, never the raw news wire (curated-only law,
// Fable 2026-07-11). HAPPENING is populated by loadSeries(); markup reuses each page's existing
// .wire / .wi / .wt / .wm styles.
export function renderDevelopments(section, opts){
  opts=opts||{};
  const ev=((HAPPENING&&HAPPENING.events)||[]).filter(e=>e.section===section)
    .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0, opts.max||6);
  if(!ev.length) return `<div style="font-family:var(--mono);font-size:11px;color:var(--mut);padding:12px 0">No major developments logged yet.</div>`;
  return `<div class="wire">`+ev.map(e=>{
    const ext=/^https?:/.test(e.url||''); const d=e.date?new Date(e.date+'T00:00:00'):null;
    const dd=d&&!isNaN(d)?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';
    return `<div class="wi"><div class="wbody"><a class="wt" href="${e.url||'#'}"${ext?' target="_blank" rel="noopener"':''}>${e.title||''}</a><div class="wm">${e.source||''}${dd?' · '+dd:''}</div></div></div>`;
  }).join('')+`</div>`;
}

export async function loadSeries(ids){
  const SER=ids||MONEY_SERIES;
  const [news,events,happening,...ser]=await Promise.all([
    J('./data/news/wire.json').catch(()=>J('./data/news.json').catch(()=>null)),
    J('./data/events.json').catch(()=>null),
    J('./data/happening.json').catch(()=>null),
    ...SER.map(id=>J('./data/series/'+id+'.json').then(s=>({id,s})).catch(()=>({id,s:null})))
  ]);
  ser.forEach(x=>{ if(x.s) S[x.id]=x.s; });
  NEWS=news; EVENTS=events; HAPPENING=happening;
  return { S, NEWS, EVENTS, HAPPENING };
}

export { hbarChart as hbar, barChart as bar };
