import { publicationCoversEdition, dueEdition, recentActiveRun, recoveryThrottle } from './decision.mjs';

const DEFAULTS = Object.freeze({
  publicationStatusUrl: 'https://mexicobrief.com/data/publication-status.json',
  githubOwner: 'alanlacroix',
  githubRepo: 'mexico-in-data',
  githubWorkflow: 'happening.yml',
  githubRef: 'main',
  graceMinutes: 20,
  recentRunMinutes: 180,
  retryCooldownMinutes: 45,
  failureWindowMinutes: 180,
  maxFailures: 3,
});

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
        slot: due.slot,
        reason: `Cloudflare watchdog: ${due.editorialDate} ${due.slot} edition is not live`,
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

  const status = await fetchPublicationStatus(settings.publicationStatusUrl);
  if (publicationCoversEdition(status, due)) {
    log('info', 'publication_current', {
      due,
      publicationId: status.publicationId || null,
    });
    return { action: 'none', reason: 'publication is current', due };
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

function healthResponse(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const path = new URL(request.url).pathname;
  if (path !== '/' && path !== '/health') return new Response('Not found', { status: 404 });

  const body = request.method === 'HEAD'
    ? null
    : JSON.stringify({ ok: true, service: 'publication-watchdog', dispatchFromHttp: false });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export default {
  // This route is intentionally read-only. Only the scheduled handler below
  // can invoke runWatchdog and dispatch a GitHub workflow.
  fetch(request) {
    return healthResponse(request);
  },

  scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime);
    ctx.waitUntil(
      runWatchdog(env, now).catch((error) => {
        log('error', 'watchdog_failed', { checkedAt: now.toISOString(), message: error.message });
        throw error;
      }),
    );
  },
};
