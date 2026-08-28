const SLOT_RANK = Object.freeze({ morning: 1, afternoon: 2 });
const ACTIVE_RUN_STATUSES = new Set(['queued', 'in_progress', 'requested', 'waiting', 'pending']);

const DEFAULT_GRACE_MINUTES = 20;
const DEFAULT_RECENT_RUN_MINUTES = 180;
const MORNING_MINUTE_ET = 9 * 60;
const QUIET_RECHECK_MINUTE_ET = 12 * 60;

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

function easternDate(value) {
  const parts = easternParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
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
    return { editorialDate, slot: 'morning', quietRecheck: minuteOfDay >= QUIET_RECHECK_MINUTE_ET };
  }
  return null;
}

export function publicationCoversEdition(status, due) {
  if (!due || !status || typeof status !== 'object') return false;
  if (status.editorialDate !== due.editorialDate) return false;
  if (status.state && status.state !== 'published') return false;
  if (due.quietRecheck === true && status.quiet === true && status.quietFinal !== true) return false;
  return (SLOT_RANK[status.slot] || 0) >= (SLOT_RANK[due.slot] || Infinity);
}

export function publicationStopsRecovery(status, due) {
  if (!due || !status || typeof status !== 'object') return false;
  if (status.editorialDate !== due.editorialDate) return false;
  // A content deferral remains retryable. Only an explicit infrastructure/code block
  // stops the independent recovery path; its throttle still permits at most one
  // watchdog dispatch, so this cannot recreate the old alert/spend loop.
  if (status.state !== 'blocked') return false;
  return (SLOT_RANK[status.slot] || 0) >= (SLOT_RANK[due.slot] || Infinity);
}

function receiptTime(status) {
  const timestamp = Date.parse(status?.generatedAt || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Production remains the public truth unless the repository contains a strictly
 * newer deferral for the exact edition that is due. That is the one case where a
 * same-day live publication can be known obsolete even though Pages still serves it.
 */
export function resolvePublicationStatus(liveStatus, repositoryStatus, due) {
  const liveTime = receiptTime(liveStatus);
  const repositoryTime = receiptTime(repositoryStatus);
  const repositoryDefersDueEdition = Boolean(due)
    && repositoryStatus?.state === 'deferred'
    && repositoryStatus?.editorialDate === due.editorialDate
    && (SLOT_RANK[repositoryStatus?.slot] || 0) >= (SLOT_RANK[due.slot] || Infinity)
    && liveTime !== null
    && repositoryTime !== null
    && repositoryTime > liveTime;

  return repositoryDefersDueEdition
    ? { status: repositoryStatus, source: 'repository' }
    : { status: liveStatus, source: 'live' };
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

export function recoveryThrottle(runs, editorialDate) {
  const priorDispatch = (Array.isArray(runs) ? runs : []).find((run) => {
    if (run?.event !== 'workflow_dispatch') return false;
    const createdAt = new Date(run?.created_at || '');
    if (Number.isNaN(createdAt.getTime())) return false;
    return easternDate(createdAt) === editorialDate;
  });
  if (priorDispatch) {
    return {
      blocked: true,
      reason: 'the independent recovery allowance was already used for this editorial date',
      runId: priorDispatch.id ?? null,
    };
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
