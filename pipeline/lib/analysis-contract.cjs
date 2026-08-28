'use strict';

// One shared contract for generation, selection, validation, rendering, and live
// verification. A policy/version change forces the exact selected set through the
// current evidence rules once; no layer may silently accept an older panel.
module.exports = {
  ANALYSIS_VERSION: 10,
  ANALYSIS_POLICY: 'every-selected-story-evidence-locked-v5',
  ANALYSIS_FIELDS: ['background', 'view', 'prediction'],
};
