import assert from 'node:assert/strict';
import fs from 'node:fs';
import dns from 'node:dns/promises';
import { calendarEvidenceRecord, calendarDateFlags, CALENDAR_DATE_CONTRACT } from '../lib/calendar-evidence.mjs';
import { shapeEvidenceRecord } from '../lib/source-evidence.mjs';
import { evidenceFor, deterministicDraftCheck } from '../build-edition.mjs';
import scheduled from '../lib/scheduled-candidate.cjs';

const events = JSON.parse(fs.readFileSync(new URL('../../data/events.json', import.meta.url))).events;
const event = events.find(event => event.label === 'USMCA next annual joint review');
assert.equal(event.approx, true);
assert.equal(event.datePrecision, 'year');
const record = shapeEvidenceRecord(calendarEvidenceRecord(event));
assert.match(record.text, /^2027 \(year only;/);
assert.match(record.text, /USMCA next annual joint review/);
assert.match(record.text, /agreement remains in force/);
assert.doesNotMatch(JSON.stringify(record), /2027-07-01|July|julio/);
assert.equal(calendarEvidenceRecord({ ...event, date: '2027-01-01' }).id, record.id);
assert.match(record.url, /FR-2026-10-05/);
assert.deepEqual(scheduled.dueScheduledRows([event], event.date), [], 'approximate annual review is never an exact required outcome');

const exact = calendarEvidenceRecord({ date: '2027-01-12', approx: false, label: 'USMCA comments deadline', source: 'USTR', sourceUrl: 'https://example.com/deadline', mechanism: 'Submit comments by 11:59 p.m. EST.' });
assert.equal(exact.id, 'calendar:2027-01-12');
assert.match(exact.text, /^2027-01-12: USMCA comments deadline/);
assert.deepEqual(calendarDateFlags('Comments close January 12, 2027.', [exact]), []);
for (const text of ['The review is July 1, 2027.', 'La revisión es el 1 de julio de 2027.', 'The review is on 2027-07-01.', 'The review is in July 2027.', 'La revisión será en julio de 2027.', 'The review is tentatively July 1, 2027.']) {
  assert.ok(calendarDateFlags(text, [record]).length, text);
}
for (const text of ['The review is in 2027; its exact date remains unannounced.', 'La revisión será en 2027; la fecha exacta está pendiente.']) {
  assert.deepEqual(calendarDateFlags(text, [record]), []);
}
const unrelated = { id: 'article', kind: 'article-body', text: 'On July 1, 2026, officials met. The vote was 1 to 7 in 2027.' };
assert.ok(calendarDateFlags('The review is July 1, 2027.', [record, unrelated]).length, 'unrelated day and year values cannot establish an exact date');
const confirmation = { ...unrelated, text: 'The review will be held on 2027-07-01.' };
assert.deepEqual(calendarDateFlags('The review is July 1, 2027.', [record, confirmation]), []);
assert.deepEqual(calendarDateFlags('La revisión es el 1 de julio de 2027.', [record, confirmation]), []);
const estimate = shapeEvidenceRecord(calendarEvidenceRecord({ ...event, datePrecision: undefined }));
assert.match(estimate.text, /approximate scheduling estimate/);
assert.ok(calendarDateFlags('The review is July 1, 2027.', [estimate]).length);
assert.deepEqual(calendarDateFlags('The review is tentatively July 1, 2027.', [estimate]), []);
assert.deepEqual(calendarDateFlags('La revisión es aproximadamente el 1 de julio de 2027.', [estimate]), []);
assert.ok(calendarDateFlags('Estimated revenues increased. The review is July 1, 2027.', [estimate]).length);
assert.ok(calendarDateFlags('Estimated revenues increased and the review is July 1, 2027.', [estimate]).length);
assert.ok(calendarDateFlags('La revisión será en Mayo de 2027.', [record]).length);
assert.deepEqual(calendarDateFlags('The review may occur in 2027.', [record]), []);
const draft = { headline: 'The review is July 1, 2027.', headlineRefs: [record.id], es: { headline: 'La revisión es el 1 de julio de 2027.' } };
assert.ok(deterministicDraftCheck({ evidence: [record] }, draft).includes('headline: calendar date precision or certainty is unsupported'));

const savedLookup = dns.lookup;
const savedFetch = globalThis.fetch;
try {
  dns.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  globalThis.fetch = async () => new Response(`<article><p>${'Officials discuss the USMCA trade agreement and its annual joint review. '.repeat(15)}</p></article>`);
  const packet = await evidenceFor({ title: 'USMCA joint review', url: 'https://publisher.example/trade', sourceName: 'Publisher' }, [], [event], []);
  assert.deepEqual(packet.find(row => row.kind === 'calendar'), record, 'production evidence selection preserves the uncertainty boundary');
  const auditPacket = packet.map(({ id, text }) => ({ id, text }));
  assert.match(auditPacket.find(row => row.id === record.id).text, /year only;/);
  assert.doesNotMatch(JSON.stringify(auditPacket), /2027-07-01/);
} finally {
  dns.lookup = savedLookup;
  globalThis.fetch = savedFetch;
}
const builder = fs.readFileSync(new URL('../build-edition.mjs', import.meta.url), 'utf8');
assert.match(builder, /DRAFT_GATE_CONTRACT = `\$\{CALENDAR_DATE_CONTRACT\}/);
assert.match(builder, /system: `\$\{CALENDAR_DATE_CONTRACT\} You are the final independent/);
assert.ok(CALENDAR_DATE_CONTRACT.includes('both languages'));
console.log('calendar evidence: approximate dates, year precision, draft/audit propagation and exact deadlines pass');
