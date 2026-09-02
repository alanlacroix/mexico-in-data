const DEFAULTS = Object.freeze({
  githubOwner: 'alanlacroix',
  githubRepo: 'mexico-in-data',
  githubWorkflow: 'happening.yml',
  githubRef: 'main',
  heartbeatMaxAgeMinutes: 45,
});
const HEARTBEAT_KEY = 'last-scheduled-check';
const CLAIM_TTL_SECONDS = 7 * 24 * 60 * 60;

function settings(env) {
  return {
    githubOwner: env.GITHUB_OWNER || DEFAULTS.githubOwner,
    githubRepo: env.GITHUB_REPO || DEFAULTS.githubRepo,
    githubWorkflow: env.GITHUB_WORKFLOW || DEFAULTS.githubWorkflow,
    githubRef: env.GITHUB_REF || DEFAULTS.githubRef,
    heartbeatMaxAgeMinutes: Number(env.HEARTBEAT_MAX_AGE_MINUTES) || DEFAULTS.heartbeatMaxAgeMinutes,
  };
}

export function easternClock(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('now must be valid');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    editorialDate: `${parts.year}-${parts.month}-${parts.day}`,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function dueSlot(now = new Date()) {
  const clock = easternClock(now);
  if (clock.minuteOfDay < 9 * 60) return null;
  return { editorialDate: clock.editorialDate, slot: clock.minuteOfDay < 12 * 60 ? 'morning' : 'noon' };
}

function requireBindings(env) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN secret is not configured');
  if (!env.WATCHDOG_STATE || typeof env.WATCHDOG_STATE.get !== 'function'
      || typeof env.WATCHDOG_STATE.put !== 'function' || typeof env.WATCHDOG_STATE.delete !== 'function') {
    throw new Error('WATCHDOG_STATE KV binding is not configured');
  }
}

function claimKey(due) {
  return `edition-dispatch:${due.editorialDate}:${due.slot}`;
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'mexico-brief-edition-clock',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function dispatch(settingsValue, token, due) {
  const workflow = encodeURIComponent(settingsValue.githubWorkflow);
  const url = `https://api.github.com/repos/${encodeURIComponent(settingsValue.githubOwner)}/${encodeURIComponent(settingsValue.githubRepo)}/actions/workflows/${workflow}/dispatches`;
  const response = await fetch(url, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify({ ref: settingsValue.githubRef, inputs: { slot: due.slot } }),
  });
  if (response.status !== 204) {
    const error = new Error(`GitHub workflow dispatch returned HTTP ${response.status}`);
    error.code = 'github-dispatch-http';
    throw error;
  }
}

export async function runClock(env, now = new Date()) {
  requireBindings(env);
  const due = dueSlot(now);
  if (!due) return { action: 'none', reason: 'before the morning slot', due: null };
  const key = claimKey(due);
  if (await env.WATCHDOG_STATE.get(key)) return { action: 'none', reason: 'slot already dispatched', due };

  // KV is not a lock. It prevents ordinary repeats; build-edition's committed slot
  // ledger is the second, authoritative idempotency boundary if duplicate Worker
  // invocations race or GitHub's backup schedule fires too.
  await env.WATCHDOG_STATE.put(key, JSON.stringify({ claimedAt: now.toISOString() }), { expirationTtl: CLAIM_TTL_SECONDS });
  try {
    await dispatch(settings(env), env.GITHUB_TOKEN, due);
    console.log(JSON.stringify({ service: 'edition-clock', event: 'dispatched', ...due }));
    return { action: 'dispatch', reason: 'slot claimed', due };
  } catch (error) {
    await env.WATCHDOG_STATE.delete(key);
    throw error;
  }
}

async function writeHeartbeat(env, heartbeat) {
  await env.WATCHDOG_STATE.put(HEARTBEAT_KEY, JSON.stringify(heartbeat), { expirationTtl: CLAIM_TTL_SECONDS });
}

async function readHeartbeat(env) {
  if (!env.WATCHDOG_STATE || typeof env.WATCHDOG_STATE.get !== 'function') return null;
  const value = await env.WATCHDOG_STATE.get(HEARTBEAT_KEY);
  if (!value) return null;
  return JSON.parse(value);
}

export async function runScheduledCheck(env, now = new Date()) {
  const checkedAt = now.toISOString();
  try {
    const result = await runClock(env, now);
    await writeHeartbeat(env, { ok: true, checkedAt, result });
    return result;
  } catch (error) {
    // Health is public. Persist a stable class, never a GitHub response body or
    // exception string that could contain operational details.
    try { await writeHeartbeat(env, { ok: false, checkedAt, errorCode: error.code || 'scheduled-check-failed' }); } catch { /* binding error is reported below */ }
    throw error;
  }
}

export async function checkHealth(env, now = new Date()) {
  const checks = {
    githubTokenConfigured: Boolean(env.GITHUB_TOKEN),
    stateBindingConfigured: Boolean(env.WATCHDOG_STATE && typeof env.WATCHDOG_STATE.get === 'function'),
    heartbeatFresh: false,
    lastScheduledCheckHealthy: false,
  };
  const errors = [];
  if (!checks.githubTokenConfigured) errors.push('GITHUB_TOKEN secret is not configured');
  if (!checks.stateBindingConfigured) errors.push('WATCHDOG_STATE KV binding is not configured');
  let heartbeat = null;
  if (checks.stateBindingConfigured) {
    try {
      heartbeat = await readHeartbeat(env);
      const age = (now.getTime() - Date.parse(heartbeat?.checkedAt || '')) / 60000;
      checks.heartbeatFresh = Number.isFinite(age) && age >= -5 && age <= settings(env).heartbeatMaxAgeMinutes;
      checks.lastScheduledCheckHealthy = heartbeat?.ok === true;
      if (!heartbeat) errors.push('scheduled heartbeat has not been recorded');
      else if (!checks.heartbeatFresh) errors.push('scheduled heartbeat is stale');
      else if (!checks.lastScheduledCheckHealthy) errors.push(`last scheduled check failed: ${heartbeat.errorCode || 'unknown-error'}`);
    } catch {
      errors.push('heartbeat state is unreadable');
    }
  }
  return {
    ok: Object.values(checks).every(Boolean),
    service: 'edition-clock',
    dispatchFromHttp: false,
    checkedAt: now.toISOString(),
    checks,
    errors,
    heartbeat,
  };
}

async function respond(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (url.pathname !== '/' && url.pathname !== '/health') return new Response('Not found', { status: 404 });
  const health = await checkHealth(env);
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(health), {
    status: health.ok ? 200 : 503,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  fetch: respond,
  scheduled(_controller, env, context) {
    context.waitUntil(runScheduledCheck(env));
  },
};
