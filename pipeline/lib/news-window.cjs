const DEFAULT_WINDOW_HOURS = 36;
const FALLBACK_WINDOW_HOURS = 60;

function eventTimestamp(event) {
  const published = Date.parse(event && event.publishedAt);
  if (Number.isFinite(published)) return published;
  const day = String(event && event.date || '').trim();
  const dated = day ? Date.parse(`${day}T12:00:00Z`) : NaN;
  return Number.isFinite(dated) ? dated : 0;
}

function recentEvents(events, now = new Date(), hours = DEFAULT_WINDOW_HOURS) {
  const end = new Date(now).getTime();
  if (!Number.isFinite(end)) return [];
  const start = end - (hours * 60 * 60 * 1000);
  const futureAllowance = end + (15 * 60 * 1000);
  return (Array.isArray(events) ? events : [])
    .map((event) => ({ ...event, _t: eventTimestamp(event) }))
    .filter((event) => event._t >= start && event._t <= futureAllowance)
    .sort((a, b) => (b.importance || 0) - (a.importance || 0) || b._t - a._t);
}

module.exports = {
  DEFAULT_WINDOW_HOURS,
  FALLBACK_WINDOW_HOURS,
  eventTimestamp,
  recentEvents,
};
