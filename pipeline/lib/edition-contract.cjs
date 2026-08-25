'use strict';

// Bump only when a deterministic pipeline change requires the current day's stored
// artifact to be rebuilt. The receipt makes that migration happen once.
const PIPELINE_VERSION = 2;

module.exports = { PIPELINE_VERSION };
