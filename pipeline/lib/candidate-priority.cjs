'use strict';

// Cost caps must never become hidden editorial filters. Exact scheduled outcomes
// enter the curator first, followed by reports the event log has not processed.
// Recurring coverage already represented in the log uses the remaining room.
function prioritizeCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : []).slice().sort((a, b) =>
    Number(Boolean(b?._scheduled)) - Number(Boolean(a?._scheduled))
    || Number(Boolean(a?._alreadyPublished)) - Number(Boolean(b?._alreadyPublished))
    || (Date.parse(b?.published_at || b?.publishedAt || '') || 0)
      - (Date.parse(a?.published_at || a?.publishedAt || '') || 0));
}

module.exports = { prioritizeCandidates };
