'use strict';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function rows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.events)) return value.events;
  return [];
}

function day(value) {
  const text = String(value || '').trim();
  return ISO_DAY.test(text) ? text : '';
}

function stableId(value) {
  return String(value || '').trim();
}

const RESOLUTION_STATUSES = new Set(['postponed', 'cancelled', 'waived']);
function explicitResolution(value, id) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Schedule resolution for ${id} must be an object`);
  }
  const status = stableId(value.status).toLowerCase();
  const source = stableId(value.source);
  const url = stableId(value.url);
  if (!RESOLUTION_STATUSES.has(status)) throw new TypeError(`Schedule resolution for ${id} has an invalid status`);
  if (!source || !/^https?:\/\//i.test(url)) {
    throw new TypeError(`Schedule resolution for ${id} needs linked evidence`);
  }
  return { status, source, url, note: stableId(value.note) };
}

function reconcileExpectedOutcomes({ schedule = [], events = [], priorOutcomes = [], editorialDate } = {}) {
  const currentDay = day(editorialDate);
  if (!currentDay) throw new TypeError('editorialDate must be an ISO date (YYYY-MM-DD)');

  const scheduled = rows(schedule);
  const observed = rows(events);
  const prior = rows(priorOutcomes);
  const observedByScheduleId = new Map();
  const priorByScheduleId = new Map(prior
    .filter((item) => stableId(item?.id))
    .map((item) => [stableId(item.id), item]));

  for (const event of observed) {
    const scheduledEventId = stableId(event?.scheduledEventId);
    if (scheduledEventId && !observedByScheduleId.has(scheduledEventId)) {
      observedByScheduleId.set(scheduledEventId, event);
    }
  }

  const seenScheduleIds = new Set();
  const items = [];

  for (const scheduledEvent of scheduled) {
    if (!scheduledEvent || typeof scheduledEvent !== 'object') continue;

    const id = stableId(scheduledEvent.id);
    const scheduledDay = day(scheduledEvent.date);
    const optedIn = scheduledEvent.outcomeRequired === true;

    if (optedIn && !id) {
      throw new TypeError('Every outcomeRequired schedule entry must have a stable id');
    }
    if (optedIn && !scheduledDay) {
      throw new TypeError(`outcomeRequired schedule entry ${id} must have an ISO date`);
    }
    if (!id || !scheduledDay) continue;
    if (seenScheduleIds.has(id)) throw new TypeError(`Duplicate schedule id: ${id}`);
    seenScheduleIds.add(id);

    const approximate = scheduledEvent.approx === true || scheduledEvent.approximate === true;
    const watchOnly = scheduledEvent.watch === true;
    const required = optedIn && !approximate && !watchOnly;
    const matchedEvent = observedByScheduleId.get(id) || null;
    const priorOutcome = priorByScheduleId.get(id) || null;
    const durablySatisfied = priorOutcome?.status === 'satisfied'
      && day(priorOutcome?.date) === scheduledDay
      && stableId(priorOutcome?.matchedEventId)
      && Array.isArray(priorOutcome?.evidence)
      && priorOutcome.evidence.some((item) => /^https?:\/\//i.test(stableId(item?.url)));
    const resolution = explicitResolution(scheduledEvent.resolution, id);

    let status;
    if (matchedEvent) status = 'satisfied';
    else if (resolution) status = resolution.status;
    else if (durablySatisfied) status = 'satisfied';
    else if (scheduledDay > currentDay) status = 'upcoming';
    else if (scheduledDay === currentDay) status = 'pending';
    else status = required ? 'missing' : 'pending';

    items.push({
      id,
      date: scheduledDay,
      label: String(scheduledEvent.label || '').trim(),
      status,
      outcomeRequired: optedIn,
      approximate,
      watchOnly,
      required,
      hardBlock: required && status === 'missing',
      matchedEvent,
      priorOutcome: durablySatisfied ? priorOutcome : null,
      resolution,
    });
  }

  const byStatus = (status) => items.filter((item) => item.status === status);
  const blockers = items.filter((item) => item.hardBlock);

  return {
    editorialDate: currentDay,
    items,
    upcoming: byStatus('upcoming'),
    pending: byStatus('pending'),
    satisfied: byStatus('satisfied'),
    missing: byStatus('missing'),
    resolved: items.filter((item) => RESOLUTION_STATUSES.has(item.status)),
    blockers,
    ok: blockers.length === 0,
  };
}

module.exports = { reconcileExpectedOutcomes };
