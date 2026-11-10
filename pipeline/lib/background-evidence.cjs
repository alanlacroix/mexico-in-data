'use strict';

// Calendar records establish release timing, not independent reporting/context.
// Keep every other non-article record subject to the existing background rule.
const independentBackgroundEvidence = evidence => evidence.filter(item => item && item.id !== 'article' && item.kind !== 'calendar');
module.exports = { independentBackgroundEvidence };
