// Verify the exact immutable edition, not a second operational receipt.
import publicEdition from './lib/public-edition.cjs';

const { validateEdition } = publicEdition;
const expectedDate = String(process.env.EDITORIAL_DATE || '').trim();
const expectedHash = String(process.env.ARTIFACT_HASH || '').trim();
const base = String(process.env.PRODUCTION_ORIGIN || 'https://mexicobrief.com').replace(/\/$/, '');

if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) throw new Error('EDITORIAL_DATE is required');
if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('ARTIFACT_HASH is required');

async function fetchEdition() {
  const response = await fetch(`${base}/data/edition.json?hash=${expectedHash}`, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`production returned HTTP ${response.status}`);
  return response.json();
}

let last = 'not checked';
for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    const edition = await fetchEdition();
    const validation = validateEdition(edition);
    if (!validation.ok) throw new Error(`live edition invalid: ${validation.errors.join('; ')}`);
    if (edition.editorialDate !== expectedDate) throw new Error(`live date ${edition.editorialDate}, expected ${expectedDate}`);
    if (edition.artifactHash !== expectedHash) throw new Error(`live hash ${edition.artifactHash}, expected ${expectedHash}`);
    console.log(`production verified: ${edition.editorialDate} · ${edition.stories.length} stories · ${edition.artifactHash}`);
    process.exit(0);
  } catch (error) {
    last = error.message;
    if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
throw new Error(`production did not serve the committed edition: ${last}`);
