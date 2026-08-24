const SLOT_RANK = Object.freeze({ morning: 1, afternoon: 2 });
const ACTIVE_RUN_STATUSES = new Set(['queued', 'in_progress', 'requested', 'waiting', 'pending']);

const DEFAULT_GRACE_MINUTES = 20;
const DEFAULT_RECENT_RUN_MINUTES = 180;
const DEFAULT_RETRY_COOLDOWN_MINUTES = 45;
const DEFAULT_FAILURE_WINDOW_MINUTES = 1440;
const DEFAULT_MAX_FAILURES = 1;
const MORNING_MINUTE_ET = 9 * 60;

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function easternParts(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) throw new TypeError('now must be a valid date');

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
}

/**
 * Return the day's single publication slot once it should already be live.
 * The grace period gives the normal GitHub schedule the first chance to
 * publish before recovery intervenes. There is deliberately no afternoon
 * cutoff: the editorial product has one edition per day.
 */
export function dueEdition(now = new Date(), graceMinutes = DEFAULT_GRACE_MINUTES) {
  const parts = easternParts(now);
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  const grace = positiveNumber(graceMinutes, DEFAULT_GRACE_MINUTES);
  const editorialDate = `${parts.year}-${parts.month}-${parts.day}`;

  if (minuteOfDay >= MORNING_MINUTE_ET + grace) {
    return { editorialDate, slot: 'morning' };
  }
  return null;
}

export function publicationCoversEdition(status, due) {
  if (!due || !status || typeof status !== 'object') return false;
  if (status.editorialDate !== due.editorialDate) return false;
  if (status.state && status.state !== 'published') return false;
  return (SLOT_RANK[status.slot] || 0) >= (SLOT_RANK[due.slot] || Infinity);
}

export function publicationStopsRecovery(status, due) {
  if (!due || !status || typeof status !== 'object') return false;
  if (status.editorialDate !== due.editorialDate) return false;
  if (!['deferred', 'blocked'].includes(status.state)) return false;
  return (SLOT_RANK[status.slot] || 0) >= (SLOT_RANK[due.slot] || Infinity);
}

export function recentActiveRun(runs, now = new Date(), recentRunMinutes = DEFAULT_RECENT_RUN_MINUTES) {
  const currentTime = (now instanceof Date ? now : new Date(now)).getTime();
  if (Number.isNaN(currentTime)) throw new TypeError('now must be a valid date');
  const windowMs = positiveNumber(recentRunMinutes, DEFAULT_RECENT_RUN_MINUTES) * 60_000;

  return (Array.isArray(runs) ? runs : []).find((run) => {
    if (!ACTIVE_RUN_STATUSES.has(run?.status)) return false;

    const timestamp = run.run_started_at || run.created_at || run.updated_at;
    if (!timestamp) return true;
    const startedAt = Date.parse(timestamp);
    if (!Number.isFinite(startedAt)) return true;

    const ageMs = currentTime - startedAt;
    return ageMs >= -5 * 60_000 && ageMs <= windowMs;
  }) || null;
}

function ageMinutes(run, now) {
  const timestamp = run?.run_started_at || run?.created_at || run?.updated_at;
  const time = Date.parse(timestamp || '');
  return Number.isFinite(time) ? (now.getTime() - time) / 60_000 : Infinity;
}

export function recoveryThrottle(runs, now = new Date(), {
  cooldownMinutes = DEFAULT_RETRY_COOLDOWN_MINUTES,
  failureWindowMinutes = DEFAULT_FAILURE_WINDOW_MINUTES,
  maxFailures = DEFAULT_MAX_FAILURES,
} = {}) {
  const clock = now instanceof Date ? now : new Date(now);
  const list = Array.isArray(runs) ? runs : [];
  const recentDispatch = list.find((run) => run?.event === 'workflow_dispatch'
    && ageMinutes(run, clock) >= -5 && ageMinutes(run, clock) < positiveNumber(cooldownMinutes, DEFAULT_RETRY_COOLDOWN_MINUTES));
  if (recentDispatch) return { blocked: true, reason: 'a recovery run was dispatched recently', runId: recentDispatch.id ?? null };

  // One independent recovery attempt is enough for a given editorial day. The primary
  // workflow already gets hourly chances, so three identical watchdog dispatches only
  // repeat spend and notifications when the failure is deterministic.
  const failures = list.filter((run) => run?.event === 'workflow_dispatch'
    && run?.status === 'completed' && run?.conclusion === 'failure'
    && ageMinutes(run, clock) >= 0 && ageMinutes(run, clock) < positiveNumber(failureWindowMinutes, DEFAULT_FAILURE_WINDOW_MINUTES));
  if (failures.length >= positiveNumber(maxFailures, DEFAULT_MAX_FAILURES)) {
    return { blocked: true, reason: 'recovery failure limit reached', failures: failures.length };
  }
  return { blocked: false };
}

export function watchdogDecision({
  now = new Date(),
  status = null,
  runs = [],
  graceMinutes = DEFAULT_GRACE_MINUTES,
  recentRunMinutes = DEFAULT_RECENT_RUN_MINUTES,
} = {}) {
  const due = dueEdition(now, graceMinutes);
  if (!due) return { action: 'none', reason: 'no edition is due', due: null };

  if (publicationCoversEdition(status, due)) {
    return { action: 'none', reason: 'publication is current', due };
  }
  if (publicationStopsRecovery(status, due)) {
    return { action: 'none', reason: `publication is ${status.state}`, due };
  }

  const activeRun = recentActiveRun(runs, now, recentRunMinutes);
  if (activeRun) {
    return {
      action: 'none',
      reason: 'workflow is already queued or in progress',
      due,
      activeRunId: activeRun.id ?? null,
    };
  }

  return { action: 'dispatch', reason: 'publication is stale and no active run exists', due };
}
