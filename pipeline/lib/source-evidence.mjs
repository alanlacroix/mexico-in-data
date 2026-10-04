import { plainSourceName } from './plain-language.cjs';

// A serialized article record is complete within this byte bound or unusable.
// A prefix can discard the condition or exception that qualifies an earlier claim.
export const MAX_ARTICLE_EVIDENCE_BYTES = 16 * 1024;

const clean = value => String(value || '').trim();
const articleKinds = new Set(['article-body', 'prior-article-body']);

export function shapeEvidenceRecord({ id, kind, source, url, text }) {
  const normalizedKind = clean(kind);
  const normalizedText = clean(text);
  const completeArticle = articleKinds.has(normalizedKind);
  const record = {
    id: clean(id),
    kind: normalizedKind,
    source: plainSourceName(source),
    url: clean(url),
    // Feed/coverage snippets and curated context retain their existing contract.
    text: completeArticle ? normalizedText : normalizedText.slice(0, 2200),
  };
  if (completeArticle && new TextEncoder().encode(JSON.stringify(record)).byteLength > MAX_ARTICLE_EVIDENCE_BYTES) {
    return null;
  }
  return record;
}
