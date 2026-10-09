import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// CI-only real-browser release check. No model/API calls or publication writes.
const root = path.resolve('_site');
const edition = JSON.parse(await fs.readFile(path.join(root, 'data/edition.json'), 'utf8'));
const output = path.resolve(process.env.BROWSER_QA_OUTPUT || '/tmp/mexico-brief-browser-qa');
await fs.mkdir(output, { recursive: true });
const server = http.createServer(async (req, res) => {
  try {
    let route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (route.endsWith('/')) route += 'index.html';
    const file = path.resolve(root, `.${route}`);
    if (!file.startsWith(`${root}/`)) { res.writeHead(403).end(); return; }
    const body = await fs.readFile(file);
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : file.endsWith('.png') ? 'image/png' : 'text/html');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'mexico-brief-chrome-'));
const chrome = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
  '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let browserErrors = ''; chrome.stderr.on('data', b => { browserErrors += b; });
let launchError; chrome.on('error', error => { launchError = error; });
let ws;
const pending = new Map();
let sequence = 0;
const exceptions = [];
function send(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser timed out: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
try {
  let active;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    if (chrome.exitCode !== null || chrome.signalCode) throw new Error(`Chrome exited: ${browserErrors}`);
    try { active = await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8'); break; } catch { await delay(100); }
  }
  assert.ok(active, `Chrome did not start: ${browserErrors}`);
  const [port, socketPath] = active.trim().split('\n');
  ws = new WebSocket(`ws://127.0.0.1:${port}${socketPath}`);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    const job = pending.get(message.id);
    if (job) { clearTimeout(job.timer); pending.delete(message.id); message.error ? job.reject(new Error(JSON.stringify(message.error))) : job.resolve(message.result); }
  });
  const results = [];
  for (const locale of ['en', 'es']) for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: size === 'mobile' }, sessionId);
    await send('Page.navigate', { url: `${origin}/${locale === 'es' ? 'es/' : ''}` }, sessionId);
    let state;
    for (let attempt = 0; attempt < 100; attempt++) {
      const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }, sessionId);
      if (r.result.value === 'complete') {
        const check = await send('Runtime.evaluate', { expression: 'Boolean(document.querySelector("[data-artifact-hash]"))', returnByValue: true }, sessionId);
        if (check.result.value) break;
      }
      await delay(100);
    }
    const result = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `document.fonts.ready.then(() => ({
      artifactHash: document.querySelector('[data-artifact-hash]').dataset.artifactHash,
      date: document.querySelector('.edition-date').innerText,
      title: document.querySelector('#daily-title, #weekly-title').innerText,
      storyCount: document.querySelectorAll('.weekly-item, [data-edition-stories] .development').length,
      warnings: [...document.querySelectorAll('.freshness-alert, .data-alert')].map(e => ({text:e.textContent.trim(),hidden:e.hidden,display:getComputedStyle(e).display,visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)})),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      visibleText: document.body.innerText
    }))` }, sessionId);
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    state = result.result.value;
    const metrics = await send('Page.getLayoutMetrics', {}, sessionId);
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } }, sessionId);
    await fs.writeFile(path.join(output, `${locale}-${size}.png`), Buffer.from(screenshot.data, 'base64'));
    await fs.writeFile(path.join(output, `${locale}-${size}.txt`), state.visibleText);
    results.push({ locale, size, ...state, visibleText: undefined });
    await fs.writeFile(path.join(output, 'observations.json'), JSON.stringify({ status: 'CHECKING', results }, null, 2) + '\n');
    assert.equal(state.artifactHash, edition.artifactHash);
    assert.equal(state.storyCount, edition.stories.length);
    assert.equal(state.horizontalOverflow, false, `${locale}/${size} horizontal overflow`);
    assert.ok(state.warnings.length >= 2);
    assert.ok(state.warnings.every(warning => !warning.visible), `${locale}/${size} visible warning: ${JSON.stringify(state.warnings)}`);
    if (edition.editionType === 'daily') {
      assert.equal(state.title, locale === 'es' ? 'Hoy en México' : 'Today in Mexico');
      const date = new Date(`${edition.editorialDate}T12:00:00Z`).toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      assert.equal(state.date, locale === 'es' ? date.charAt(0).toUpperCase() + date.slice(1) : date);
    }
    const normalize = value => value.replace(/\s+/g, ' ').trim();
    for (const story of edition.stories) for (const field of ['headline', 'dek', 'background', 'view']) {
      assert.ok(normalize(state.visibleText).includes(normalize(story[locale][field])), `missing visible ${locale}/${size}/${story.id}/${field}`);
    }
    await send('Target.closeTarget', { targetId });
  }
  assert.deepEqual(exceptions, [], 'page JavaScript exceptions');
  const report = { status: 'PASS', checkedAt: new Date().toISOString(), editionDate: edition.editorialDate, artifactHash: edition.artifactHash, browser: 'Installed Google Chrome, headless, desktop and mobile viewports', results };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ status: 'FAIL', checkedAt: new Date().toISOString(), message: error.message, browserErrors }, null, 2) + '\n');
  throw error;
} finally {
  if (ws?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} ws.close(); }
  chrome.kill();
  server.close();
  await fs.rm(profile, { recursive: true, force: true });
}
