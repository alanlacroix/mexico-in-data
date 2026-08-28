'use strict';

// One shared contract for generation, selection, validation, rendering, and live
// verification. A policy/version change forces the exact selected set through the
// current evidence rules once; no layer may silently accept an older panel.
module.exports = {
  ANALYSIS_VERSION: 11,
  ANALYSIS_POLICY: 'every-selected-story-evidence-locked-v7',
  ANALYSIS_REPAIR_PREDECESSOR: 'every-selected-story-evidence-locked-v6',
  ANALYSIS_FIELDS: ['background', 'view', 'prediction'],
};
