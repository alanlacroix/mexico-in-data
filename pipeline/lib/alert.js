// alert.js — a cron that fails silently is the rot vector (Fable). Every failed
// connector records a structured alert. In CI, run.js writes a machine-readable
// summary that a GitHub Actions step turns into an issue; locally it just prints.
// Alerts are also surfaced on the public data-health page as flags.

import { redact } from './http.js';

const alerts = [];

export function raiseAlert(manifest, err, ctx) {
  const a = {
    id: manifest.id,
    source: manifest.source,
    metric: manifest.metric,
    severity: 'error',
    // redact defensively: alert messages are published via data/health.json
    message: redact(String(err?.message || err)),
    at: ctx?.now || new Date().toISOString(),
  };
  alerts.push(a);
  // eslint-disable-next-line no-console
  console.error(`  ✗ ALERT [${a.id}] ${a.message}`);
  return a;
}

export function noteWarning(manifest, message, ctx) {
  alerts.push({
    id: manifest.id,
    source: manifest.source,
    severity: 'warning',
    message,
    at: ctx?.now || new Date().toISOString(),
  });
}

export function collectedAlerts() {
  return alerts.slice();
}
