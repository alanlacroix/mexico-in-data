#!/usr/bin/env node
// Read-only, no-LLM audit of the proposed core editorial feeds.
// Results describe the machine that runs this command. They do not establish
// availability from GitHub Actions or any other production runner.
import fs from 'node:fs/promises';
import { sourceHosts } from './lib/url-safety.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchArticle } from './lib/fetch-article.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(await fs.readFile(path.join(root, 'pipeline/news-sources.json'), 'utf8'));
const CORE_IDS = [
  'el-economista', 'elfin-economia', 'expansion-empresas', 'bloomberglinea',
  'mexico-business-news', 't21', 'elpais-mexico', 'aristegui-mexico',
  'mexico-news-daily', 'ft-mexico',
];
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'MexicoBriefSourceAudit/1.0 (+https://mexicobrief.com/)';
const environment = process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local-machine';

const decode = (value = '') => String(value)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function xmlItems(body) {
  const blocks = body.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
  return blocks.map((block) => {
    const date = block.match(/<(?:pubDate|published|updated|dc:date)\b[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i)?.[1];
    const href = block.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1]
      || block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1];
    return { date: decode(date).trim(), url: decode(href).trim() };
  });
}

function jsonApiItems(body, source) {
  if (source.format !== 'jsonapi') return [];
  const parsed = JSON.parse(body);
  return (parsed.data || []).map((row) => {
    const attrs = row.attributes || {};
    const relative = attrs.path?.alias || attrs.field_url?.uri || '';
    return {
      date: attrs.created || attrs.changed || '',
      url: relative ? new URL(relative, source.baseUrl || source.url).href : '',
    };
  });
}

async function requestText(url, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow', signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept },
    });
    // Consume the body before clearing the timer. A server that sends headers and
    // then stalls must not leave this audit hanging indefinitely.
    const text = await response.text();
    return {
      ok: response.ok, status: response.status, url: response.url,
      contentType: response.headers.get('content-type') || '', text,
    };
  } finally { clearTimeout(timer); }
}

async function audit(source) {
  const result = {
    id: source.id, name: source.name, registryUrl: source.url,
    registryTier: source.tier, environment, checkedAt: new Date().toISOString(),
    feed: { ok: false }, sampleArticle: { http: { checked: false }, extraction: { checked: false } },
  };
  try {
    const response = await requestText(source.url, 'application/rss+xml, application/atom+xml, application/json, text/xml, */*;q=0.5');
    const body = response.text;
    let items = [];
    try { items = source.format === 'jsonapi' ? jsonApiItems(body, source) : xmlItems(body); }
    catch (error) { result.feed.parseError = error.message; }
    const dates = items.map((item) => new Date(item.date)).filter((date) => Number.isFinite(date.getTime()));
    const newest = dates.sort((a, b) => b - a)[0];
    result.feed = {
      ...result.feed, ok: response.ok && items.length > 0, status: response.status,
      finalUrl: response.url, contentType: response.contentType, bytes: Buffer.byteLength(body), itemCount: items.length,
      newestPublishedAt: newest?.toISOString() || null,
    };
    const sampleUrl = items.find((item) => /^https?:\/\//.test(item.url))?.url;
    if (sampleUrl) {
      try {
        const article = await requestText(sampleUrl, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5');
        result.sampleArticle.http = {
          checked: true, ok: article.ok && /text\/html/i.test(article.contentType) && article.text.length > 1_000,
          url: sampleUrl, status: article.status, finalUrl: article.url,
          contentType: article.contentType, bytes: Buffer.byteLength(article.text),
        };
      } catch (error) { result.sampleArticle.http = { checked: true, ok: false, url: sampleUrl, error: error.message }; }
      const extracted = await fetchArticle(sampleUrl, { allowedHosts: sourceHosts(source) });
      result.sampleArticle.extraction = {
        checked: true, ok: extracted.ok, articleBody: extracted.articleBody,
        textLength: extracted.text.length, fetched: extracted.fetched, finalUrl: extracted.finalUrl,
      };
    }
  } catch (error) { result.feed.error = error.message; }
  return result;
}

const sources = CORE_IDS.map((id) => registry.sources.find((source) => source.id === id));
if (sources.some((source) => !source)) throw new Error('A proposed core source is missing from pipeline/news-sources.json');
const results = [];
for (const source of sources) results.push(await audit(source));
const output = {
  schemaVersion: 2, environment,
  productionRunnerVerified: environment === 'github-actions',
  productionRunnerMeaning: 'Audit executed on GitHub Actions; this does not verify a deployed runtime.',
  results,
};

if (process.argv.includes('--markdown')) {
  console.log('| Source | Feed | Items | Newest source date | HTTP sample | Extracted body | Notes |');
  console.log('|---|---:|---:|---|---:|---:|---|');
  for (const row of results) {
    const note = row.feed.error || row.feed.parseError || (!row.feed.ok ? `HTTP ${row.feed.status ?? 'error'}` : '');
    const http = row.sampleArticle.http;
    const extraction = row.sampleArticle.extraction;
    console.log(`| ${row.name} | ${row.feed.ok ? 'pass' : 'fail'} | ${row.feed.itemCount ?? 0} | ${row.feed.newestPublishedAt || 'unknown'} | ${http.ok ? 'pass' : http.checked ? 'fail' : 'not checked'} | ${extraction.articleBody ? 'pass' : extraction.checked ? 'fail' : 'not checked'} | ${note} |`);
  }
} else console.log(JSON.stringify(output, null, 2));
