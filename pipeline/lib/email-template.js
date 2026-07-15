// email-template.js — renders the weekly draft and its private review preview.
// The email is deliberately close to the site: white page, black type, green
// rules, short sections. No hero band, category rooms, badges, or generated
// "why it matters" blocks.

const C = {
  paper: '#ffffff',
  ink: '#151515',
  body: '#363632',
  muted: '#6f6e67',
  line: '#deddd6',
  lineSoft: '#ecebe5',
  green: '#087d4d',
  greenDark: '#06663d',
  error: '#a6222f',
};
const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif';
const MONO = '"SF Mono",ui-monospace,Menlo,Monaco,Consolas,monospace';

const esc = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const domainOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};
const paragraphs = (value, className = '') => String(value || '')
  .trim()
  .split(/\n\s*\n/)
  .filter(Boolean)
  .map((paragraph) => `<p${className ? ` class="${className}"` : ''}>${esc(paragraph.trim())}</p>`)
  .join('');

const STYLE = `
  body{margin:0;padding:0;background:${C.paper};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
  img{border:0;max-width:100%;height:auto}
  a{color:${C.greenDark};text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}
  .preheader{display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all}
  .email{background:${C.paper};width:100%;max-width:680px;margin:0 auto;font-family:${SANS};color:${C.body};text-align:left}
  .header{padding:22px 0 15px;border-bottom:1px solid ${C.line}}
  .wordmark{display:inline-block;font-size:20px;line-height:1.15;font-weight:800;letter-spacing:-.01em;color:${C.ink};text-decoration:none;border-bottom:2px solid ${C.green};padding-bottom:4px}
  .meta{font-family:${MONO};font-size:11px;line-height:1.6;color:${C.muted};margin-top:12px}
  .meta a{color:${C.greenDark}}
  .section{padding:24px 0;border-bottom:1px solid ${C.line}}
  .section.last{border-bottom:none}
  .eyebrow{font-family:${MONO};font-size:11px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:${C.greenDark};font-weight:700;margin:0 0 12px}
  .intro{font-size:17px;line-height:1.58;color:${C.body};margin:0}
  .toc{margin:0;padding:0;list-style:none}
  .toc li{margin:0;padding:7px 0;border-top:1px solid ${C.lineSoft};font-size:15px;line-height:1.42}
  .toc li:first-child{border-top:none;padding-top:0}
  .toc a{color:${C.ink};text-decoration:none}
  .toc a:hover{text-decoration:underline}
  h1{font-size:29px;line-height:1.14;letter-spacing:-.025em;color:${C.ink};margin:0 0 14px;font-weight:800}
  h2{font-size:21px;line-height:1.22;letter-spacing:-.015em;color:${C.ink};margin:0 0 9px;font-weight:750}
  h1 a,h2 a{color:${C.ink};text-decoration:none}
  .story{padding:19px 0;border-top:1px solid ${C.lineSoft}}
  .story.first{padding-top:0;border-top:none}
  .story p,.lead-copy p{font-size:16px;line-height:1.62;color:${C.body};margin:0 0 11px}
  .story p:last-child,.lead-copy p:last-child{margin-bottom:0}
  .editor-note{margin:16px 0 0;padding:13px 15px;border-left:3px solid ${C.green};background:#f7faf8;font-size:15.5px;line-height:1.55;color:${C.body}}
  .editor-note b{color:${C.ink}}
  .source{font-family:${MONO};font-size:10.5px;line-height:1.55;color:${C.muted};margin-top:12px}
  .source a{color:${C.greenDark}}
  .number{width:100%;border-collapse:collapse;border-top:1px solid ${C.lineSoft}}
  .number:first-of-type{border-top:none}
  .number td{padding:13px 0;vertical-align:top}
  .number .left{padding-right:18px}
  .number .right{text-align:right;width:42%}
  .number-name{font-size:15.5px;line-height:1.35;font-weight:700;color:${C.ink}}
  .number-meta{font-family:${MONO};font-size:10.5px;line-height:1.5;color:${C.muted};margin-top:4px}
  .number-value{font-size:20px;line-height:1.2;font-weight:750;color:${C.ink}}
  .number-change{font-size:13px;line-height:1.4;color:${C.body};margin-top:4px}
  .status{color:${C.error};font-weight:700}
  .quick{margin:0;padding:0;list-style:none}
  .quick li{padding:11px 0;border-top:1px solid ${C.lineSoft};font-size:15.5px;line-height:1.42;color:${C.ink}}
  .quick li:first-child{border-top:none;padding-top:0}
  .quick a{color:${C.ink};font-weight:650;text-decoration:none}
  .quick .source{display:block;margin-top:3px;font-weight:400}
  .watch{margin:0;padding:0;list-style:none}
  .watch li{padding:12px 0;border-top:1px solid ${C.lineSoft}}
  .watch li:first-child{border-top:none;padding-top:0}
  .watch-date{font-family:${MONO};font-size:10.5px;line-height:1.4;color:${C.greenDark};font-weight:700;text-transform:uppercase}
  .watch-title{font-size:15.5px;line-height:1.4;color:${C.ink};font-weight:700;margin-top:3px}
  .watch-why{font-size:14.5px;line-height:1.5;color:${C.body};margin-top:3px}
  .foot{padding:24px 0 42px;border-top:1px solid ${C.line};font-family:${MONO};font-size:11px;line-height:1.7;color:${C.muted}}
  .foot a{color:${C.greenDark}}
  @media(max-width:720px){
    .email{width:auto!important;margin:0!important}
    .header,.section,.foot{padding-left:20px!important;padding-right:20px!important}
    h1{font-size:27px!important}
  }
  @media(max-width:480px){
    .header{padding-top:18px!important}
    .section{padding-top:21px!important;padding-bottom:21px!important}
    h1{font-size:25px!important}
    h2{font-size:19px!important}
    .story p,.lead-copy p,.intro,.toc li,.quick li{font-size:16px!important}
    .number .right{width:44%!important}
    .number-value{font-size:18px!important}
  }
`;

function sourceLine(item) {
  const url = item?.url || '';
  const source = item?.sourceName || domainOf(url);
  if (!source && !url && !item?.date) return '';
  const parts = [];
  if (source) parts.push(esc(source));
  if (item?.date) parts.push(esc(item.date));
  if (url) parts.push(`<a href="${esc(url)}">Source ↗</a>`);
  return `<div class="source">${parts.join(' · ')}</div>`;
}

function editorNote(value) {
  return value ? `<div class="editor-note"><b>My read:</b> ${esc(value)}</div>` : '';
}

function leadSection(item) {
  if (!item) return '';
  const headline = item.url
    ? `<a href="${esc(item.url)}">${esc(item.headline)}</a>`
    : esc(item.headline);
  return `<div class="section" id="the-week">
    <div class="eyebrow">The week</div>
    <h1>${headline}</h1>
    <div class="lead-copy">${paragraphs(item.summary)}</div>
    ${editorNote(item.editorNote)}
    ${sourceLine(item)}
  </div>`;
}

function supportingStory(item, index) {
  const headline = item.url
    ? `<a href="${esc(item.url)}">${esc(item.headline)}</a>`
    : esc(item.headline);
  return `<div class="story${index === 0 ? ' first' : ''}" id="worth-knowing-${index + 1}">
    <h2>${headline}</h2>
    ${paragraphs(item.summary)}
    ${editorNote(item.editorNote)}
    ${sourceLine(item)}
  </div>`;
}

function numberRow(row) {
  const source = row.sourceUrl
    ? `<a href="${esc(row.sourceUrl)}">${esc(row.source || domainOf(row.sourceUrl))} ↗</a>`
    : esc(row.source || '');
  const meta = [row.period ? esc(row.period) : '', source, row.status ? `<span class="status">${esc(row.status)}</span>` : '']
    .filter(Boolean)
    .join(' · ');
  return `<table role="presentation" class="number" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td class="left">
      <div class="number-name">${esc(row.name)}</div>
      ${meta ? `<div class="number-meta">${meta}</div>` : ''}
    </td>
    <td class="right">
      <div class="number-value">${esc(row.current)}</div>
      ${row.change ? `<div class="number-change">${esc(row.change)}</div>` : ''}
    </td>
  </tr></table>`;
}

function quickUpdate(item) {
  const headline = item.url
    ? `<a href="${esc(item.url)}">${esc(item.headline)}</a>`
    : esc(item.headline);
  const source = [item.sourceName, item.date].filter(Boolean).map(esc).join(' · ');
  return `<li>${headline}${source ? `<span class="source">${source}</span>` : ''}</li>`;
}

function watchItem(item) {
  const title = item.sourceUrl
    ? `<a href="${esc(item.sourceUrl)}" style="color:${C.ink};text-decoration:none">${esc(item.w)}</a>`
    : esc(item.w);
  return `<li>
    <div class="watch-date">${esc(item.dt)}</div>
    <div class="watch-title">${title}</div>
    ${item.why ? `<div class="watch-why">${esc(item.why)}</div>` : ''}
  </li>`;
}

export function renderEmail(draft) {
  const atAGlance = (draft.atAGlance || []).length ? `<div class="section">
    <div class="eyebrow">In this brief</div>
    <ul class="toc">${draft.atAGlance.map((item) => `<li><a href="${esc(item.href || '#')}">${esc(item.text)} →</a></li>`).join('')}</ul>
  </div>` : '';
  const intro = draft.intro ? `<div class="section"><div class="eyebrow">A note from me</div>${paragraphs(draft.intro, 'intro')}</div>` : '';
  const lead = leadSection(draft.lead);
  const supporting = (draft.supporting || []).length ? `<div class="section">
    <div class="eyebrow">Also this week</div>
    ${draft.supporting.map(supportingStory).join('')}
  </div>` : '';
  const numbers = (draft.numbers || []).length ? `<div class="section" id="numbers">
    <div class="eyebrow">Numbers that changed</div>
    ${draft.numbers.map(numberRow).join('')}
  </div>` : '';
  const quick = (draft.quickUpdates || []).length ? `<div class="section">
    <div class="eyebrow">Other updates</div>
    <ul class="quick">${draft.quickUpdates.map(quickUpdate).join('')}</ul>
  </div>` : '';
  const watch = (draft.watch || []).length ? `<div class="section last" id="next-week">
    <div class="eyebrow">Next week</div>
    <ul class="watch">${draft.watch.map(watchItem).join('')}</ul>
  </div>` : '';
  const issueMeta = [draft.dateLabel, draft.readMin ? `${draft.readMin} min` : ''].filter(Boolean).map(esc).join(' · ');

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(draft.subject || 'The Mexico Brief')}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="preheader">${esc(draft.previewText || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff"><tr><td align="center" style="padding:0 10px">
<!--[if mso]><table role="presentation" width="680" align="center" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff"><tr><td><![endif]-->
  <div class="email">
    <div class="header">
      <a class="wordmark" href="https://mexicobrief.com">THE MEXICO BRIEF</a>
      <div class="meta">${issueMeta}${draft.viewUrl ? ` · <a href="${esc(draft.viewUrl)}">View online</a>` : ''} · <a href="https://mexicobrief.com/sources">Sources</a></div>
    </div>
    ${atAGlance}
    ${intro}
    ${lead}
    ${supporting}
    ${numbers}
    ${quick}
    ${watch}
    <div class="foot">
      <a href="https://mexicobrief.com">The Mexico Brief</a> · <a href="https://mexicobrief.com/sources">Sources</a><br>
      Reply to this email if something looks wrong or there is a source I should add.${draft.footerExtra || ''}
    </div>
  </div>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

// The preview includes draft-only errors and Alan's three questions. None of
// this banner appears in the rendered email handed to Beehiiv.
export function renderPreview(draft) {
  const html = renderEmail(draft);
  const errors = draft.draftErrors || [];
  const flags = draft.lintFlags || [];
  const questions = draft.reviewQuestions || [];
  const cost = draft._cost != null ? ` · ~$${draft._cost.toFixed(3)}` : '';
  const problemLines = errors.map((item) => `<li><b>${esc(item.slot)}:</b> ${esc(item.headline)}. ${esc(item.error)}</li>`).join('');
  const flagLines = flags.map((flag) => `<li>${esc(flag)}</li>`).join('');
  const questionLines = questions.map((question) => `<li>${esc(question)}</li>`).join('');
  const warning = !draft._llm
    ? '<div style="color:#ffd08a;margin-top:7px">Fallback mode. Any source descriptions still require review.</div>'
    : '';
  const checks = problemLines || flagLines
    ? `<div style="max-width:900px;margin:8px auto 0;text-align:left;color:#ffd0d5"><b>Fix before sending:</b><ul style="margin:5px 0 0;padding-left:20px">${problemLines}${flagLines}</ul></div>`
    : '<div style="color:#a6dfbd;margin-top:7px">No source or copy errors in the generated sections.</div>';
  const review = questionLines
    ? `<div style="max-width:900px;margin:9px auto 0;text-align:left"><b>Alan:</b><ol style="margin:5px 0 0;padding-left:22px">${questionLines}</ol></div>`
    : '';
  const banner = `<div style="font-family:${MONO};background:#151515;color:#f7f7f2;padding:13px 18px;font-size:12px;line-height:1.55;text-align:center">
    DRAFT · ${esc(draft.week || '')} · ${draft.lead ? '1 lead' : 'no lead'} · ${(draft.supporting || []).length} supporting · ${esc(draft.readMin || 1)} min${cost}
    ${warning}${checks}${review}
  </div>`;
  return html.replace('<body>', `<body>\n${banner}`);
}

export { esc, domainOf };
