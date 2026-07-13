// freshness.js — one release-aware definition of "current" for the pipeline,
// publication checks, and tests. Observation dates and fetch times are different:
// a successful fetch today does not make a 2024 observation current, while an
// annual 2025 observation is not 18 months old just because it is stored as "2025".

const DAY = 86_400_000;

// Grace starts at the END of the observation period. The window is deliberately
// wide enough for normal publication lag plus one missed cycle. A source-specific
// manifest may override it with thresholds.freshnessGraceDays.
const RULES = [
  { key: '4-hour', test: /4[- ]?hour/i, graceDays: 2 },
  { key: 'business-daily', test: /business[- ]?daily/i, graceDays: 6 },
  { key: 'daily', test: /daily/i, graceDays: 8 },
  { key: 'weekly', test: /weekly/i, graceDays: 21 },
  { key: 'monthly', test: /monthly/i, graceDays: 100 },
  { key: 'quarter', test: /quarter/i, graceDays: 220 },
  // Structural releases such as municipal poverty are intentionally not judged
  // on an annual clock. 2–5-year / ~5-yearly sources remain current until the
  // next release window has genuinely passed.
  { key: 'multi-year', test: /(?:[2-9]|~\s*[2-9])\s*(?:[-–]\s*[2-9]\s*)?[- ]?year/i, graceDays: 2_375 },
  { key: 'annual', test: /annual|yearly/i, graceDays: 730 },
];

export function cadenceRule(cadence) {
  return RULES.find((rule) => rule.test.test(String(cadence || ''))) || null;
}

/** Return the end of the period represented by a vintage string. */
export function observationPeriodEnd(vintage, cadence = '') {
  const value = String(vintage || '').trim();
  let match;
  if ((match = /^(\d{4})$/.exec(value))) {
    return new Date(Date.UTC(Number(match[1]), 11, 31, 23, 59, 59, 999));
  }
  if ((match = /^(\d{4})-(\d{2})$/.exec(value))) {
    const year = Number(match[1]), month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    if (/quarter/i.test(String(cadence))) {
      const quarterEndMonth = Math.floor((month - 1) / 3) * 3 + 3;
      return new Date(Date.UTC(year, quarterEndMonth, 0, 23, 59, 59, 999));
    }
    return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  }
  if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value))) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const exact = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    if (exact.getUTCFullYear() !== year || exact.getUTCMonth() !== month - 1 || exact.getUTCDate() !== day) return null;
    if (/quarter/i.test(String(cadence))) {
      const quarterEndMonth = Math.floor((month - 1) / 3) * 3 + 3;
      return new Date(Date.UTC(year, quarterEndMonth, 0, 23, 59, 59, 999));
    }
    if (/monthly/i.test(String(cadence))) return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return exact;
  }
  return null;
}

/**
 * @returns {{ key:string, stale:boolean, ageDays:number, graceDays:number, periodEnd:string }|null}
 */
export function freshnessStatus(manifest, vintage, now = new Date()) {
  const rule = cadenceRule(manifest?.cadence);
  if (!rule) return null;
  const end = observationPeriodEnd(vintage, manifest?.cadence);
  if (!end) return null;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return null;
  const ageDays = Math.max(0, (nowMs - end.getTime()) / DAY);
  const override = manifest?.thresholds?.freshnessGraceDays;
  const graceDays = Number.isFinite(override) ? override : rule.graceDays;
  return {
    key: rule.key,
    stale: ageDays > graceDays,
    ageDays,
    graceDays,
    periodEnd: end.toISOString(),
  };
}

export function stalenessFlag(manifest, vintage, now = new Date()) {
  const status = freshnessStatus(manifest, vintage, now);
  return status?.stale ? `stale_${status.key}_${Math.round(status.ageDays)}d` : null;
}
