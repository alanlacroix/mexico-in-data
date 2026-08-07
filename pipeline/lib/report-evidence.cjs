'use strict';

const text = (value) => String(value || '').trim();

// Factual Brief copy is generated from the publisher's title and dek. Keep those
// inputs separate from the rewritten title and context so a generated sentence can
// never "prove" itself during the publication check.
function evidenceInputs(event = {}) {
  const evidence = event.reportEvidence || {};
  const inputs = [event.date, evidence.title, evidence.dek, ...(Array.isArray(evidence.facts) ? evidence.facts : [])]
    .map(text)
    .filter(Boolean);
  // Legacy rows predate retained source evidence. Their rewritten headline is a
  // narrower fallback than accepting the rewritten context itself. New rows always
  // carry reportEvidence, and selected legacy rows can be migrated by an editor.
  if (inputs.length <= 1 && text(event.title)) inputs.push(text(event.title));
  return inputs;
}

module.exports = { evidenceInputs };
