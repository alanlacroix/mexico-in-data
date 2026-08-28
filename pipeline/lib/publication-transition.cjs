'use strict';

function nonPublishedTransition(prior = {}, next = {}) {
  const priorIsCurrentFactualPublication = prior.editorialDate === next.editorialDate
    && (!prior.state || prior.state === 'published')
    && Number(prior.pipelineVersion) === Number(next.pipelineVersion)
    // Positive proof only. Legacy receipts did not carry an explicit quiet flag, so
    // `quiet !== true` misclassified the live Aug. 27 zero-story receipt as factual.
    && Number(prior.selectedStories) > 0;
  if (priorIsCurrentFactualPublication) return { status: prior, retained: true };

  const duplicate = prior.state === next.state
    && prior.editorialDate === next.editorialDate
    && prior.reason === next.reason;
  return { status: duplicate ? prior : next, retained: false };
}

module.exports = { nonPublishedTransition };
