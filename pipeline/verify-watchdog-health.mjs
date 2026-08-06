const healthUrl = process.env.WATCHDOG_HEALTH_URL || process.argv[2];
if (!healthUrl) throw new Error('WATCHDOG_HEALTH_URL is not configured');

const target = new URL(healthUrl);
target.searchParams.set('check', String(Date.now()));

const response = await fetch(target, {
  headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  signal: AbortSignal.timeout(15_000),
});

let health = null;
try {
  health = await response.json();
} catch {
  throw new Error(`publication watchdog returned HTTP ${response.status} without JSON health`);
}

if (!response.ok || health?.ok !== true) {
  const detail = Array.isArray(health?.errors) && health.errors.length
    ? health.errors.join('; ')
    : `HTTP ${response.status}`;
  throw new Error(`publication watchdog is unhealthy: ${detail}`);
}

console.log(JSON.stringify({
  ok: true,
  checkedAt: health.checkedAt,
  heartbeatCheckedAt: health.heartbeat?.checkedAt || null,
  livePublication: health.livePublication || null,
}));
