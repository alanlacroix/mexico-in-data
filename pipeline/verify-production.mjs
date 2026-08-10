const BASE_URL = (process.env.PRODUCTION_URL || 'https://mexicobrief.com').replace(/\/$/, '');
const EXPECTED_ID = process.env.PUBLICATION_ID;
const EXPECTED_DATE = process.env.PUBLICATION_DATE;
const EXPECTED_SLOT = process.env.PUBLICATION_SLOT;
const TIMEOUT_MS = Number(process.env.LIVE_VERIFY_TIMEOUT_MS || 8 * 60 * 1000);
const INTERVAL_MS = Number(process.env.LIVE_VERIFY_INTERVAL_MS || 15000);
const SLOT_RANK = { morning: 1, afternoon: 2 };

function assertExpectedInputs() {
  if (!EXPECTED_ID || !EXPECTED_DATE || !SLOT_RANK[EXPECTED_SLOT]) {
    throw new Error('PUBLICATION_ID, PUBLICATION_DATE and PUBLICATION_SLOT are required');
  }
}

async function get(path, type = 'json') {
  const joiner = path.includes('?') ? '&' : '?';
  const response = await fetch(`${BASE_URL}${path}${joiner}publication=${encodeURIComponent(EXPECTED_ID)}&t=${Date.now()}`, {
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return type === 'text' ? response.text() : response.json();
}

export async function checkProduction() {
  assertExpectedInputs();
  const status = await get('/data/publication-status.json');
  if (status.publicationId !== EXPECTED_ID) throw new Error(`production still serves ${status.publicationId || 'no publication receipt'}`);
  if (status.editorialDate !== EXPECTED_DATE) throw new Error(`production editorial date is ${status.editorialDate || 'missing'}`);
  if ((SLOT_RANK[status.slot] || 0) < SLOT_RANK[EXPECTED_SLOT]) throw new Error(`production slot is ${status.slot || 'missing'}`);

  const brief = await get('/data/brief.json');
  if (brief.meta?.editorialDate !== EXPECTED_DATE) throw new Error(`live brief date is ${brief.meta?.editorialDate || 'missing'}`);
  if (!Array.isArray(brief.items) || brief.items.length > 4) throw new Error('live brief has an invalid story set');
  if (brief.meta?.selection?.policy !== 'importance-first-v1'
      || !Array.isArray(brief.meta?.selection?.receipt)) {
    throw new Error('live brief is missing its selection audit');
  }
  if (brief.meta.selection.receipt.some((row) => /analysis/i.test(String(row.reason || '')))) {
    throw new Error('live brief selection still depends on optional analysis');
  }
  const eventStatus = await get('/data/event-status.json');
  if (eventStatus.meta?.editorialDate !== EXPECTED_DATE) throw new Error('live scheduled-outcome audit has the wrong date');
  if (Number(eventStatus.meta?.blockers) > 0) throw new Error('live edition has an unresolved scheduled-outcome blocker');

  // These assertions have to track the page. They were still looking for the "Mexico
  // today" headline and a data-editorial-date attribute, both of which the 2026-08-02
  // rebuild removed, so every publication since has been marked failed after it had
  // already published correctly. Assert what the feed actually renders: the wordmark, the
  // brief itself, and the edition's own date in the dateline.
  const homepage = await get('/', 'text');
  if (!/THE MEXICO BRIEF/i.test(homepage) || !/id="sec-brief"/.test(homepage)) {
    throw new Error('live homepage contract failed');
  }
  const longDate = new Date(`${EXPECTED_DATE}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  if (!homepage.includes(longDate)) {
    throw new Error(`live homepage does not render the ${EXPECTED_DATE} edition`);
  }
  return status;
}

async function main() {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastMessage = '';
  while (Date.now() <= deadline) {
    try {
      const status = await checkProduction();
      console.log(`production verified: ${status.editorialDate} ${status.slot} ${status.publicationId}`);
      return;
    } catch (error) {
      if (error.message !== lastMessage) {
        console.log(`waiting for production: ${error.message}`);
        lastMessage = error.message;
      }
      if (process.argv.includes('--once')) throw error;
      await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    }
  }
  throw new Error(`Production did not publish ${EXPECTED_ID} within ${Math.round(TIMEOUT_MS / 60000)} minutes: ${lastMessage}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
