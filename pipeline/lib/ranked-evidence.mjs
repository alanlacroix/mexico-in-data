// A retry should not spend its only remaining draft on the same rejected
// optional leads when comparably eligible alternatives exist. Keep failed leads
// as fallback, and preserve both scheduled and exact-day priority lanes.
export function rotateDeterministicRejects(rows, { diagnostics, storyId, editorialDate, weekend = false }) {
  const rejected = new Set((diagnostics || [])
    .filter(entry => entry.stage === 'deterministic' && typeof entry.storyId === 'string')
    .map(entry => entry.storyId));
  if (!rejected.size) return rows;
  const demoted = row => Number(rejected.has(storyId(row.item)));
  return rows.slice().sort((a, b) => {
    const scheduled = Number(Boolean(b.item._scheduled)) - Number(Boolean(a.item._scheduled));
    if (scheduled) return scheduled;
    // Do not reorder scheduled releases or defer one because drafting failed.
    if (a.item._scheduled) return 0;
    const exactDay = weekend ? 0 : Number(b.item._editorialDate === editorialDate)
      - Number(a.item._editorialDate === editorialDate);
    return exactDay || demoted(a) - demoted(b);
  });
}

// Resolve a bounded ranked universe before drafting. This changes availability,
// not editorial eligibility: the caller supplies the unchanged readiness gate.
export async function resolveRankedEvidence(rows, { fetchEvidence, ready, editorialDate,
  weekend = false, batchSize = 8, maxCandidates = 24, minimum = 3, maximum = 5 }) {
  const evidenceRows = [];
  for (let offset = 0; offset < Math.min(rows.length, maxCandidates); offset += batchSize) {
    const batch = rows.slice(offset, Math.min(offset + batchSize, maxCandidates));
    evidenceRows.push(...await Promise.all(batch.map(async row => ({
      ...row, evidence: await fetchEvidence(row),
    }))));
    if (evidenceRows.some(row => row.item._scheduled?.requiredForBrief && !ready(row))) {
      throw new Error('required scheduled outcome unavailable: no complete lead evidence');
    }
    const locked = evidenceRows.filter(ready).slice(0, maximum);
    if (locked.length >= minimum && (weekend || locked.some(row => row.item._editorialDate === editorialDate))) break;
  }
  return evidenceRows;
}
