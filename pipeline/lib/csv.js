// csv.js — a small, dependency-free CSV parser good enough for the flat gov CSVs
// we ingest (quoted fields, embedded commas, comma/semicolon/pipe delimiters).
// Not a full RFC-4180 implementation; connectors that need more do their own
// streaming parse (see imss.js).

export function detectDelimiter(headerLine) {
  const counts = { ',': 0, ';': 0, '|': 0, '\t': 0 };
  for (const ch of headerLine) if (ch in counts) counts[ch]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

function splitLine(line, delim) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.length > 0);
  if (!lines.length) return { header: [], rows: [] };
  const delim = detectDelimiter(lines[0]);
  const header = splitLine(lines[0], delim).map((h) => h.trim());
  const rows = lines.slice(1).map((l) => splitLine(l, delim));
  return { header, rows, delim };
}

/** Find a header index by trying each matcher (string includes or RegExp), case-insensitive. */
export function findCol(header, matchers) {
  const lower = header.map((h) => h.toLowerCase().trim());
  for (const mtch of matchers) {
    for (let i = 0; i < lower.length; i++) {
      if (mtch instanceof RegExp ? mtch.test(lower[i]) : lower[i] === mtch) return i;
    }
  }
  return -1;
}
