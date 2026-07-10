// email-template.js — the one renderer. Pure function: a draft object in, a full
// standalone HTML email out. build-email.js renders the draft; send-email.js sends
// the exact bytes this produced, so what Alan approves is what subscribers get.
//
// Email-client reality: Gmail strips `var()` and `:root`; classic Outlook ignores
// `max-width` on divs. So the palette is literal hex, the brand band and board
// colors are inlined (they have no dark-mode override, so it is safe), and the
// layout is a centered table with an Outlook ghost-table wrapper. Apple Mail gets
// the full treatment (dark mode); Gmail and Outlook degrade to clean light. Same
// tokens as mexicobrief.com, one look.

// ---- palette (mirrors the site's :root, resolved to literal hex) ----
const C = {
  ground: '#e9e8e2', paper: '#ffffff', line: '#ecebe4', line2: '#e0dfd7',
  ink: '#15150e', body: '#2c2c27', mut: '#706f66',
  green: '#0a7d4d', greenD: '#06663d',
  upBg: '#daf0e2', upFg: '#076b41', downBg: '#f8e0e2', downFg: '#b0182d',
  flatBg: '#eeede7', flatFg: '#6b6a62', foot: '#f6f5f0',
};
const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif';
const SERIF = '"Iowan Old Style","Charter","Palatino Linotype",Georgia,serif';
const MONO = '"SF Mono",ui-monospace,Menlo,monospace';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// category → pill class + label (top-of-the-week tags)
const CAT = {
  'us-mexico': { cls: 'us', label: 'US–Mexico' },
  politics: { cls: 'pol', label: 'Politics' },
  fintech: { cls: '', label: 'Fintech' },
  companies: { cls: '', label: 'Companies' },
  economy: { cls: '', label: 'Economy' },
  markets: { cls: 'mkt', label: 'Markets' },
  deals: { cls: '', label: 'Deals' },
};
const catCls = { us: 'color:#0b5c86;background:#d9edf7', pol: 'color:#7a4d09;background:#f4ead0', mkt: `color:${C.downFg};background:${C.downBg}`, '': `color:${C.greenD};background:${C.upBg}` };

const STYLE = `
  body{margin:0;padding:0;background:${C.ground};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
  img{border:0;max-width:100%}
  a{text-decoration:none}
  .email{background:${C.paper};width:100%;max-width:680px;margin:0 auto;border:1px solid ${C.line2};border-radius:10px;overflow:hidden;font-family:${SANS};color:${C.body};text-align:left}
  .topbar{padding:12px 26px;font-family:${MONO};font-size:12px;color:${C.mut};border-bottom:1px solid ${C.line}}
  .topbar a{color:${C.greenD}}
  .band{background:${C.green};text-align:center;padding:22px 26px}
  .band .wm{font-family:${SERIF};font-weight:700;font-size:25px;color:#ffffff;letter-spacing:.01em}
  .band .sub{font-family:${MONO};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#bfe6d1;margin-top:6px}
  .pad{padding:22px 26px;border-top:1px solid ${C.line}}
  .pad.first{border-top:none}
  .lead{font-size:16.5px;line-height:1.6;color:${C.body};margin:0}.lead b{color:${C.ink}}
  .eyebrow{font-family:${MONO};font-size:12.5px;letter-spacing:.09em;text-transform:uppercase;color:${C.greenD};font-weight:700}
  .eyebrow .floor{color:${C.mut};font-weight:400;letter-spacing:.04em}
  .lead-item{padding:18px 0 4px;border-top:1px solid ${C.line}}
  .lead-item.first{border-top:none;padding-top:14px}
  .cat{display:inline-block;font-family:${MONO};font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;border-radius:5px;padding:3px 9px}
  .hl{font-size:20px;font-weight:800;color:${C.ink};line-height:1.22;margin:9px 0 0;letter-spacing:-.01em}
  .hl a{color:${C.ink}}
  .lead-item.first .hl{font-size:24px}
  .isum{font-size:16px;line-height:1.58;color:${C.body};margin-top:8px}.isum b{color:${C.ink}}
  .why{font-size:15.5px;line-height:1.55;color:${C.body};margin-top:9px;padding-left:13px;border-left:3px solid ${C.green}}.why b{color:${C.ink}}
  .srclink{font-family:${MONO};font-size:11.5px;color:${C.mut};margin-top:8px}.srclink a{color:${C.greenD}}
  .board{width:100%;border-collapse:collapse;margin-top:12px}
  .board td{padding:11px 0;vertical-align:middle;border-bottom:1px solid ${C.line}}
  .board tr:last-child td{border-bottom:none}
  .arw{width:24px;font-size:14px;text-align:center}
  .up{color:${C.upFg}}.dn{color:${C.downFg}}.fl{color:${C.flatFg}}
  .nm{font-size:16px;font-weight:700;color:${C.ink}}
  .nm small{display:block;font-family:${MONO};font-size:10.5px;font-weight:400;color:${C.mut};margin-top:1px}
  .val{text-align:right;font-size:18px;font-weight:700;color:${C.ink};padding-right:13px;font-family:${SERIF}}
  .chg{text-align:right;white-space:nowrap}
  .pill{display:inline-block;font-family:${MONO};font-size:12.5px;font-weight:600;padding:5px 9px;border-radius:7px}
  .pill.up{background:${C.upBg};color:${C.upFg}}.pill.dn{background:${C.downBg};color:${C.downFg}}.pill.fl{background:${C.flatBg};color:${C.flatFg}}
  .chg small{display:block;font-family:${MONO};font-size:10px;color:${C.mut};margin-top:3px}
  .subsrc{font-family:${MONO};font-size:11px;color:${C.mut};margin-top:10px;line-height:1.6}
  .item{padding:11px 0;border-bottom:1px solid ${C.line}}.item:last-child{border-bottom:none}
  .item .t{font-size:16px;font-weight:700;color:${C.ink};line-height:1.35}.item .t a{color:${C.ink}}
  .item .d{font-size:15.5px;line-height:1.5;color:${C.body};margin-top:3px}.item .d b{color:${C.ink}}
  .item .m{font-family:${MONO};font-size:11px;color:${C.mut};margin-top:4px}.item .m a{color:${C.greenD}}
  .chip{font-family:${MONO};font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:${C.greenD};background:${C.upBg};border-radius:4px;padding:2px 6px;margin-right:6px}
  ul.watch{list-style:none;margin:12px 0 0;padding:0}
  ul.watch li{margin-bottom:11px;font-size:15.5px;line-height:1.45;color:${C.body}}
  ul.watch li .dt{display:inline-block;font-family:${MONO};font-size:12px;font-weight:600;color:${C.greenD};min-width:62px}
  ul.watch li b{color:${C.ink}}
  .foot{background:${C.foot};border-top:1px solid ${C.line};padding:20px 26px 26px;font-family:${MONO};font-size:12px;color:${C.mut};line-height:1.7}
  .foot a{color:${C.greenD}}
  @media (max-width:520px){.pad,.topbar,.band,.foot{padding-left:18px;padding-right:18px}}
  @media (prefers-color-scheme:dark){
    body{background:#17181c}
    .email{background:#1e1f24;border-color:#33343a}
    .topbar{border-color:#2c2d33;color:#98978e}
    .pad{border-color:#2c2d33}
    .lead,.isum,.item .d,ul.watch li{color:#c7c6bd}
    .lead b,.hl,.hl a,.nm,.val,.isum b,.item .t,.item .t a,.item .d b,ul.watch li b,.why b{color:#f2f1ea}
    .why{color:#c7c6bd}
    .board td,.item{border-color:#2c2d33}
    .foot{background:#191a1e;border-color:#2c2d33;color:#98978e}
  }
`;

function boardRow(r) {
  // colors inlined too — these have no dark-mode override, so it's safe and survives <style>-stripping clients
  const M = { up: ['#076b41', '#daf0e2', '▲', 'up'], down: ['#b0182d', '#f8e0e2', '▼', 'dn'], flat: ['#6b6a62', '#eeede7', '—', 'fl'] };
  const [fg, bg, arw, cls] = M[r.arrow] || M.flat;
  return `<tr>
    <td class="arw ${cls}" style="color:${fg}">${arw}</td>
    <td class="nm">${esc(r.name)}<small>${esc(r.sub)}</small></td>
    <td class="val">${esc(r.val)}</td>
    <td class="chg"><span class="pill ${cls}" style="background:${bg};color:${fg}">${esc(r.pillTxt)}</span><small>${esc(r.note)}</small></td>
  </tr>`;
}

function leadItem(it, first) {
  const c = CAT[it.room] || CAT.economy;
  const style = catCls[c.cls] || catCls[''];
  const why = it.why ? `<div class="why"><b>Why it matters:</b> ${esc(it.why)}</div>` : '';
  const dom = domainOf(it.url);
  const realTag = it.real ? ` <span style="color:${C.greenD}">· from the wire</span>` : '';
  const src = it.url
    ? `<div class="srclink">${esc(it.sourceName || dom)}${it.date ? ' · ' + esc(it.date) : ''} · <a href="${esc(it.url)}">${esc(dom)} ↗</a>${realTag}</div>`
    : '';
  return `<div class="lead-item${first ? ' first' : ''}">
    <span class="cat" style="${style}">${esc(c.label)}</span>
    <div class="hl">${it.url ? `<a href="${esc(it.url)}">${esc(it.headline)}</a>` : esc(it.headline)}</div>
    <div class="isum">${esc(it.summary)}${why}${src}</div>
  </div>`;
}

function roomItem(it) {
  const dom = domainOf(it.url);
  const chip = it.chip ? `<span class="chip">${esc(it.chip)}</span>` : '';
  const link = it.url ? `<a href="${esc(it.url)}">${esc(dom)} ↗</a>` : '';
  const title = it.url ? `<a href="${esc(it.url)}">${esc(it.t)}</a>` : esc(it.t);
  const dek = it.d ? `<div class="d">${esc(it.d)}</div>` : '';
  const meta = (chip || it.source || link)
    ? `<div class="m">${chip}${esc(it.source || '')}${it.date ? ' · ' + esc(it.date) : ''}${link ? ' · ' + link : ''}</div>`
    : '';
  return `<div class="item"><div class="t">${title}</div>${dek}${meta}</div>`;
}

// ---- the full document ----
export function renderEmail(d) {
  const topOfWeek = (d.topOfWeek || []).map((it, i) => leadItem(it, i === 0)).join('');
  const board = (d.board || []).map(boardRow).join('');
  const rooms = (d.rooms || []).filter((r) => r.items && r.items.length).map((r) => `
    <div class="pad">
      <div class="eyebrow">${esc(r.eyebrow)}${r.floor ? ` <span class="floor">${esc(r.floor)}</span>` : ''}</div>
      ${r.items.map(roomItem).join('')}
    </div>`).join('');
  const watch = (d.watch || []).length ? `
    <div class="pad">
      <div class="eyebrow">What to watch</div>
      <ul class="watch">${d.watch.map((w) => `<li><span class="dt">${esc(w.dt)}</span> ${esc(w.w)}</li>`).join('')}</ul>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(d.subject || 'The Mexico Brief')}</title>
<style>${STYLE}</style>
</head>
<body>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:26px 10px 60px">
<!--[if mso]><table role="presentation" width="680" align="center" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff"><tr><td><![endif]-->
  <div class="email">
    <div class="topbar">${esc(d.dateLabel || '')}${d.viewUrl ? ` · <a href="${esc(d.viewUrl)}">View online</a>` : ''} · <a href="https://mexicobrief.com/sources">Sources</a></div>
    <div class="band" style="background:#0a7d4d"><div class="wm">THE MEXICO BRIEF</div><div class="sub">Your week in Mexico${d.issue ? ' · issue ' + d.issue : ''}</div></div>

    <div class="pad first"><p class="lead">${d.intro}</p></div>

    ${topOfWeek ? `<div class="pad"><div class="eyebrow">Top of the week</div>${topOfWeek}</div>` : ''}

    ${board ? `<div class="pad">
      <div class="eyebrow">The board</div>
      <table class="board" role="presentation">${board}</table>
      <div class="subsrc">Computed by code from wired sources. Pills show the direction each number moved.</div>
    </div>` : ''}

    ${rooms}
    ${watch}

    <div class="foot">
      Built for Alan, open to anyone. Data from Banxico, INEGI, the US Census Bureau, and the Federal Register. News from a trusted-source allowlist, summarized from the article text and linked, never from memory. <a href="https://mexicobrief.com/sources">mexicobrief.com/sources</a>.
      ${d.footerExtra || ''}
    </div>
  </div>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

// Preview page = the exact send email with a thin approve banner on top, for Alan's
// Sunday review. Never sent; just committed and viewable at /email-preview.html.
export function renderPreview(d) {
  const html = renderEmail(d);
  const usd = d._cost != null ? `~$${d._cost.toFixed(3)} to generate` : '';
  const flags = d.lintFlags || [];
  const voice = !d._llm
    ? `<span style="color:#f0b76b">fallback mode: source blurbs, no model summaries (set ANTHROPIC_API_KEY)</span>`
    : flags.length
      ? `<span style="color:#f0b76b">⚠ voice check (${flags.length}): ${esc(flags.join(' · '))}</span>`
      : `<span style="color:#8fd3ae">✓ voice: clean</span>`;
  const banner = `<div style="font-family:${MONO};background:${C.ink};color:#f2f1ea;padding:12px 18px;font-size:12.5px;line-height:1.6;text-align:center">
    DRAFT PREVIEW · issue ${esc(d.issue || '?')} · ${esc(d.week || '')} · ${(d.topOfWeek || []).length} lead${(d.topOfWeek || []).length === 1 ? '' : 's'} · ${esc(d.readMin || 3)}-min read · ${esc(usd)}<br>
    ${voice}<br>
    <span style="color:#8fd3ae">To send: run the “send-email” GitHub Action for this week. Default-hold. Nothing sends on its own.</span>
  </div>`;
  return html.replace('<body>', `<body>\n${banner}`);
}

export { esc, domainOf };
