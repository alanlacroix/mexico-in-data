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
