// store.js — the capture store writer (Supabase / PostgREST), zero-dependency.
// Fail-soft by design: with no SUPABASE_URL + SUPABASE_SERVICE_KEY set, every call
// is a no-op and the pipeline runs exactly as before. Set the two secrets and
// capture switches on. Writes go through PostgREST with the service key over plain
// fetch, so there is nothing to install.
//
// Tables: mb_items (every pulled item + judgments), mb_item_bodies (raw text),
// mb_issues (each built issue). Schema in pipeline/db/schema.sql.

const URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';

export const hasStore = () => !!(URL && KEY);

async function upsert(table, rows, onConflict) {
  if (!hasStore() || !rows.length) return { ok: hasStore(), n: 0 };
  const r = await fetch(`${URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`store ${table} ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return { ok: true, n: rows.length };
}

// bodies can be large; send them in chunks so a run never posts a giant payload
async function upsertChunked(table, rows, onConflict, size = 25) {
  let n = 0;
  for (let i = 0; i < rows.length; i += size) n += (await upsert(table, rows.slice(i, i + size), onConflict)).n;
  return { ok: hasStore(), n };
}

// GET the subset of ids that already have a stored body, so we never refetch them
export async function existingBodyIds(ids) {
  if (!hasStore() || !ids.length) return new Set();
  const found = new Set();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const q = `${URL}/rest/v1/mb_item_bodies?select=item_id&item_id=in.(${batch.map(encodeURIComponent).join(',')})`;
    const r = await fetch(q, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(45000) });
    if (r.ok) for (const row of await r.json()) found.add(row.item_id);
  }
  return found;
}

// Read back the most recent built issues (for continuity in the summarizer context)
export async function recentIssues(limit = 8) {
  if (!hasStore()) return [];
  const q = `${URL}/rest/v1/mb_issues?select=week,issue_no,built_at,draft&order=built_at.desc&limit=${limit}`;
  const r = await fetch(q, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(45000) });
  return r.ok ? r.json() : [];
}

export const upsertItems = (items) => upsertChunked('mb_items', items, 'id', 200);
export const upsertBodies = (bodies) => upsertChunked('mb_item_bodies', bodies, 'item_id', 20);
export const upsertIssue = (issue) => upsert('mb_issues', [issue], 'week');
