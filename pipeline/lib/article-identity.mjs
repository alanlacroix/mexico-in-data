import publicEdition from './public-edition.cjs';
import { safeHttpsUrl } from './url-safety.js';

const HASH = /^[a-f0-9]{64}$/;
const plainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const validUrl = value => typeof value === 'string' && /^https:\/\//i.test(value)
  && !/[\s\\\u0000-\u001f\u007f]/.test(value) && Boolean(safeHttpsUrl(value));

// This is deliberately not general URL canonicalization. Remove only a leading
// www from an exact registered host pair. Reconstruct from the original string:
// URL.href would also rewrite ports, dot segments, escaped bytes, and empty paths.
export function articleIdentity(value, registeredHosts = []) {
  if (typeof value !== 'string') throw new TypeError('Article identity requires a URL string');
  if (!validUrl(value)) return value;
  const matched = /^(https:\/\/)([^/?#]+)([\s\S]*)$/i.exec(value);
  const host = new URL(value).hostname.toLowerCase();
  const base = host.replace(/^www\./, '');
  const registered = new Set([...registeredHosts].map(host => String(host).toLowerCase().replace(/^www\./, '')));
  if (!host.startsWith('www.') || !registered.has(base)) return value;
  return `${matched[1]}${matched[2].replace(/^www\./i, '')}${matched[3]}`;
}

function provenanceRecords(provenance) {
  if (!plainObject(provenance) || provenance.schemaVersion !== 1 || !Array.isArray(provenance.records)) {
    throw new Error('Invalid article provenance: expected schemaVersion 1 and records array');
  }
  const anchors = new Map();
  for (const [index, record] of provenance.records.entries()) {
    if (!plainObject(record) || !validDay(record.editorialDate) || !HASH.test(record.artifactHash || '')
      || typeof record.storyId !== 'string' || !record.storyId.trim() || record.storyId !== record.storyId.trim()
      || !validUrl(record.publishedUrl) || !validUrl(record.feedUrl)) {
      throw new Error(`Invalid article provenance record ${index}`);
    }
    const anchor = JSON.stringify([record.editorialDate, record.artifactHash, record.storyId, record.publishedUrl]);
    if (anchors.has(anchor) && anchors.get(anchor) !== record.feedUrl) {
      throw new Error(`Conflicting article provenance record ${index}`);
    }
    anchors.set(anchor, record.feedUrl);
  }
  return provenance.records;
}

// A sidecar can identify the selected feed article when the published lead was
// changed to a primary source. Its assertion is usable only for the exact valid
// published artifact and card; evidence/citation URLs never establish identity.
// Missing sidecars are empty. Malformed data is a visible pre-generation error;
// well-formed stale or unmatched assertions simply cannot suppress a candidate.
export function publishedProvenanceUrls(editions, provenance = { schemaVersion: 1, records: [] },
  { through, registeredHosts = [] } = {}) {
  const records = provenanceRecords(provenance);
  if (!Array.isArray(editions)) throw new TypeError('Article provenance requires an editions array');
  if (through !== undefined && !validDay(through)) throw new Error('Invalid article provenance through date');
  const eligible = new Map();
  for (const edition of editions) {
    if (!plainObject(edition)
      || (edition.publicationStatus !== undefined && edition.publicationStatus !== 'approved')
      || (through && edition.editorialDate > through)) continue;
    const validation = publicEdition.validateEdition(edition);
    if (!validation.ok) throw new Error(`Invalid published edition for article provenance: ${validation.errors.join('; ')}`);
    const key = `${edition.editorialDate}:${edition.artifactHash}`;
    eligible.set(key, [...edition.stories, ...(edition.weekStories || [])]);
  }
  const urls = new Set();
  for (const record of records) {
    const stories = eligible.get(`${record.editorialDate}:${record.artifactHash}`);
    if (!stories?.some(story => story.id === record.storyId && story.url === record.publishedUrl)) continue;
    urls.add(articleIdentity(record.feedUrl, registeredHosts));
  }
  return urls;
}
