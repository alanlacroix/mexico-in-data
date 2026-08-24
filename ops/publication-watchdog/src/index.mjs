import { publicationCoversEdition, publicationStopsRecovery, dueEdition, recentActiveRun, recoveryThrottle } from './decision.mjs';

const DEFAULTS = Object.freeze({
  publicationStatusUrl: 'https://mexicobrief.com/data/publication-status.json',
  githubOwner: 'alanlacroix',
  githubRepo: 'mexico-in-data',
  githubWorkflow: 'happening.yml',
  githubRef: 'main',
  graceMinutes: 20,
  recentRunMinutes: 180,
  retryCooldownMinutes: 45,
  failureWindowMinutes: 1440,
  maxFailures: 1,
  heartbeatMaxAgeMinutes: 45,
});

const HEARTBEAT_KEY = 'last-scheduled-check';

function numericEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function config(env) {
  return {
    publicationStatusUrl: env.PUBLICATION_STATUS_URL || DEFAULTS.publicationStatusUrl,
    githubOwner: env.GITHUB_OWNER || DEFAULTS.githubOwner,
    githubRepo: env.GITHUB_REPO || DEFAULTS.githubRepo,
    githubWorkflow: env.GITHUB_WORKFLOW || DEFAULTS.githubWorkflow,
    githubRef: env.GITHUB_REF || DEFAULTS.githubRef,
    graceMinutes: numericEnv(env.WATCHDOG_GRACE_MINUTES, DEFAULTS.graceMinutes),
    recentRunMinutes: numericEnv(env.RECENT_RUN_MINUTES, DEFAULTS.recentRunMinutes),
    retryCooldownMinutes: numericEnv(env.RETRY_COOLDOWN_MINUTES, DEFAULTS.retryCooldownMinutes),
    failureWindowMinutes: numericEnv(env.FAILURE_WINDOW_MINUTES, DEFAULTS.failureWindowMinutes),
    maxFailures: numericEnv(env.MAX_RECOVERY_FAILURES, DEFAULTS.maxFailures),
    heartbeatMaxAgeMinutes: numericEnv(env.HEARTBEAT_MAX_AGE_MINUTES, DEFAULTS.heartbeatMaxAgeMinutes),
  };
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'mexico-brief-publication-watchdog',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function fetchPublicationStatus(url) {
  const target = new URL(url);
  target.searchParams.set('watchdog', String(Date.now()));
  const response = await fetch(target, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });

  // A missing receipt means no edition has been proven live yet.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`publication status returned HTTP ${response.status}`);

  const status = await response.json();
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    throw new Error('publication status was not a JSON object');
  }
  return status;
}

function publicationStatusOverride(env) {
  if (!env.PUBLICATION_STATUS_JSON) return undefined;
  const status = JSON.parse(env.PUBLICATION_STATUS_JSON);
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    throw new Error('PUBLICATION_STATUS_JSON was not a JSON object');
  }
  return status;
}

function workflowRunsUrl(settings) {
  const workflow = encodeURIComponent(settings.githubWorkflow);
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(settings.githubOwner)}/${encodeURIComponent(settings.githubRepo)}/actions/workflows/${workflow}/runs`,
  );
  url.searchParams.set('branch', settings.githubRef);
  url.searchParams.set('per_page', '20');
  return url;
}

async function fetchWorkflowRuns(settings, token) {
  const response = await fetch(workflowRunsUrl(settings), {
    headers: githubHeaders(token),
  });
  if (!response.ok) throw new Error(`GitHub workflow-runs request returned HTTP ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload?.workflow_runs)) {
    throw new Error('GitHub workflow-runs response did not contain workflow_runs');
  }
  return payload.workflow_runs;
}

async function dispatchWorkflow(settings, token, due) {
  const workflow = encodeURIComponent(settings.githubWorkflow);
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(settings.githubOwner)}/${encodeURIComponent(settings.githubRepo)}/actions/workflows/${workflow}/dispatches`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...githubHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: settings.githubRef,
      inputs: {
        force: 'true',
      },
    }),
  });

  if (response.status !== 200 && response.status !== 204) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`GitHub workflow dispatch returned HTTP ${response.status}: ${detail}`);
  }

  return response.status === 200 ? response.json() : null;
}

function log(level, event, details = {}) {
  const payload = JSON.stringify({ service: 'publication-watchdog', event, ...details });
  if (level === 'error') console.error(payload);
  else console.log(payload);
}

export async function runWatchdog(env, now = new Date()) {
  const settings = config(env);
  const due = dueEdition(now, settings.graceMinutes);
  if (!due) {
    log('info', 'not_due', { checkedAt: now.toISOString() });
    return { action: 'none', reason: 'no edition is due', due: null };
  }

  const overriddenStatus = publicationStatusOverride(env);
  const status = overriddenStatus === undefined
    ? await fetchPublicationStatus(settings.publicationStatusUrl)
    : overriddenStatus;
  if (publicationCoversEdition(status, due)) {
    log('info', 'publication_current', {
      due,
      publicationId: status.publicationId || null,
    });
    return { action: 'none', reason: 'publication is current', due };
  }
  if (publicationStopsRecovery(status, due)) {
    log(status.state === 'blocked' ? 'error' : 'info', `publication_${status.state}`, {
      due,
      publicationId: status.publicationId || null,
      reason: status.reason || null,
    });
    return { action: 'none', reason: `publication is ${status.state}`, due };
  }

  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN secret is not configured');
  const runs = await fetchWorkflowRuns(settings, env.GITHUB_TOKEN);
  const activeRun = recentActiveRun(runs, now, settings.recentRunMinutes);
  if (activeRun) {
    log('info', 'workflow_active', { due, activeRunId: activeRun.id ?? null, status: activeRun.status });
    return {
      action: 'none',
      reason: 'workflow is already queued or in progress',
      due,
      activeRunId: activeRun.id ?? null,
    };
  }

  const throttle = recoveryThrottle(runs, now, {
    cooldownMinutes: settings.retryCooldownMinutes,
    failureWindowMinutes: settings.failureWindowMinutes,
    maxFailures: settings.maxFailures,
  });
  if (throttle.blocked) {
    log(throttle.failures ? 'error' : 'info', 'recovery_throttled', { due, ...throttle });
    if (throttle.failures) {
      throw new Error(`publication is stale and ${throttle.reason} (${throttle.failures} failed runs)`);
    }
    return { action: 'none', reason: throttle.reason, due };
  }

  const dispatchedRun = await dispatchWorkflow(settings, env.GITHUB_TOKEN, due);
  log('info', 'workflow_dispatched', {
    due,
    workflowRunId: dispatchedRun?.workflow_run_id || null,
    liveEditorialDate: status?.editorialDate || null,
    liveSlot: status?.slot || null,
  });
  return { action: 'dispatch', reason: 'publication was stale', due };
}

async function writeHeartbeat(env, heartbeat) {
  if (!env.WATCHDOG_STATE || typeof env.WATCHDOG_STATE.put !== 'function') {
    throw new Error('WATCHDOG_STATE KV binding is not configured');
  }
  await env.WATCHDOG_STATE.put(HEARTBEAT_KEY, JSON.stringify(heartbeat), {
    expirationTtl: 7 * 24 * 60 * 60,
  });
}

async function readHeartbeat(env) {
  if (!env.WATCHDOG_STATE || typeof env.WATCHDOG_STATE.get !== 'function') return null;
  const raw = await env.WATCHDOG_STATE.get(HEARTBEAT_KEY);
  if (!raw) return null;
  const heartbeat = JSON.parse(raw);
  if (!heartbeat || typeof heartbeat !== 'object' || Array.isArray(heartbeat)) {
    throw new Error('watchdog heartbeat was not a JSON object');
  }
  return heartbeat;
}

export async function runScheduledCheck(env, now = new Date()) {
  const checkedAt = now.toISOString();
  try {
    const result = await runWatchdog(env, now);
    await writeHeartbeat(env, { ok: true, checkedAt, result });
    return result;
  } catch (error) {
    try {
      await writeHeartbeat(env, { ok: false, checkedAt, error: error.message });
    } catch (heartbeatError) {
      log('error', 'heartbeat_write_failed', { checkedAt, message: heartbeatError.message });
    }
    throw error;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function checkHealth(env, now = new Date()) {
  const settings = config(env);
  const checks = {
    githubTokenConfigured: Boolean(env.GITHUB_TOKEN),
    stateBindingConfigured: Boolean(env.WATCHDOG_STATE && typeof env.WATCHDOG_STATE.get === 'function'),
    publicationStatusReachable: false,
    githubApiReachable: false,
    heartbeatFresh: false,
    lastScheduledCheckHealthy: false,
    editionCurrentOrRecoveryActive: false,
  };
  const errors = [];
  let livePublication = null;
  let latestWorkflowRun = null;
  let workflowRuns = [];
  let heartbeat = null;

  try {
    livePublication = await fetchPublicationStatus(settings.publicationStatusUrl);
    checks.publicationStatusReachable = true;
  } catch (error) {
    errors.push(`publication status: ${errorMessage(error)}`);
  }

  if (!checks.githubTokenConfigured) {
    errors.push('GITHUB_TOKEN secret is not configured');
  } else {
    try {
      workflowRuns = await fetchWorkflowRuns(settings, env.GITHUB_TOKEN);
      latestWorkflowRun = workflowRuns[0] || null;
      checks.githubApiReachable = true;
    } catch (error) {
      errors.push(`GitHub API: ${errorMessage(error)}`);
    }
  }

  const due = dueEdition(now, settings.graceMinutes);
  const recoveryActive = due
    ? recentActiveRun(workflowRuns, now, settings.recentRunMinutes)
    : null;
  checks.editionCurrentOrRecoveryActive = !due
    || publicationCoversEdition(livePublication, due)
    || Boolean(recoveryActive);
  if (!checks.editionCurrentOrRecoveryActive) {
    errors.push(`${due.editorialDate} ${due.slot} edition is not live and no recovery run is active`);
  }

  if (!checks.stateBindingConfigured) {
    errors.push('WATCHDOG_STATE KV binding is not configured');
  } else {
    try {
      heartbeat = await readHeartbeat(env);
      const heartbeatTime = Date.parse(heartbeat?.checkedAt || '');
      const ageMinutes = Number.isFinite(heartbeatTime)
        ? (now.getTime() - heartbeatTime) / 60_000
        : Infinity;
      checks.heartbeatFresh = ageMinutes >= -5 && ageMinutes <= settings.heartbeatMaxAgeMinutes;
      checks.lastScheduledCheckHealthy = heartbeat?.ok === true;
      if (!heartbeat) errors.push('scheduled heartbeat has not been recorded');
      else if (!checks.heartbeatFresh) errors.push('scheduled heartbeat is stale');
      else if (!checks.lastScheduledCheckHealthy) errors.push(`last scheduled check failed: ${heartbeat.error || 'unknown error'}`);
    } catch (error) {
      errors.push(`watchdog heartbeat: ${errorMessage(error)}`);
    }
  }

  const ok = Object.values(checks).every(Boolean);
  return {
    ok,
    service: 'publication-watchdog',
    dispatchFromHttp: false,
    checkedAt: now.toISOString(),
    checks,
    errors,
    heartbeat,
    livePublication: livePublication ? {
      state: livePublication.state || 'published',
      editorialDate: livePublication.editorialDate || null,
      contentEditorialDate: livePublication.contentEditorialDate || livePublication.editorialDate || null,
      slot: livePublication.slot || null,
      publicationId: livePublication.publicationId || null,
    } : null,
    latestWorkflowRun: latestWorkflowRun ? {
      id: latestWorkflowRun.id ?? null,
      status: latestWorkflowRun.status || null,
      conclusion: latestWorkflowRun.conclusion || null,
      createdAt: latestWorkflowRun.created_at || null,
    } : null,
  };
}

async function healthResponse(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const path = new URL(request.url).pathname;
  if (path !== '/' && path !== '/health') return new Response('Not found', { status: 404 });

  const health = await checkHealth(env);
  const body = request.method === 'HEAD'
    ? null
    : JSON.stringify(health);
  return new Response(body, {
    status: health.ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export default {
  // This route is intentionally read-only. Only the scheduled handler below
  // can invoke runWatchdog and dispatch a GitHub workflow.
  fetch(request, env) {
    return healthResponse(request, env);
  },

  scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime);
    ctx.waitUntil(
      runScheduledCheck(env, now).catch((error) => {
        log('error', 'watchdog_failed', { checkedAt: now.toISOString(), message: error.message });
        throw error;
      }),
    );
  },
};
