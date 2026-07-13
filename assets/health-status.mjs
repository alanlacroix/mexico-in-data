/* A successful connector run is not automatically current forever. This small
   shared module is used by both the Brief and Sources page so their freshness
   labels cannot drift apart. */
// The data pipeline is scheduled every six hours. A successful connector does
// not become a failed connector merely because the scheduler has not run. Keep
// that distinction visible: after three missed cycles the refresh is overdue,
// while "Fetch issue" is reserved for a connector that actually failed.
const PIPELINE_CHECK_GRACE_MS = 18 * 3600e3;

export function healthStatus(source, now = new Date()) {
  if (source?.status === 'skipped') return 'Paused';
  if (source?.status === 'failed') return 'Fetch issue';

  const fetched = new Date(source?.finishedAt || source?.fetchedAt);
  if (!source?.scheduledSeparately && !Number.isNaN(fetched.getTime()) && now - fetched > PIPELINE_CHECK_GRACE_MS) {
    return 'Refresh overdue';
  }

  if (source?.status === 'ok_flagged') {
    const flags = Array.isArray(source?.flags) ? source.flags : [];
    return flags.some((flag) => String(flag).startsWith('stale_'))
      ? 'Update expected'
      : 'Review flag';
  }

  // Release timing is already checked by the pipeline's shared freshness rules.
  // A successful fetch with no stale flag means the newest published observation
  // was retrieved, even when its period is several months behind the calendar.
  // Recomputing freshness here from cadence alone produced false warnings for
  // legitimate lags such as IGAE and remittances.
  return source?.status === 'ok' ? 'Current' : 'Update expected';
}

export function summarizeHealth(health, now = new Date()) {
  const counts = { current: 0, expected: 0, reviews: 0, overdue: 0, issues: 0, paused: 0 };
  for (const source of health?.sources || []) {
    const status = healthStatus(source, now);
    if (status === 'Current') counts.current++;
    else if (status === 'Update expected') counts.expected++;
    else if (status === 'Review flag') counts.reviews++;
    else if (status === 'Refresh overdue') counts.overdue++;
    else if (status === 'Fetch issue') counts.issues++;
    else if (status === 'Paused') counts.paused++;
  }
  return counts;
}
