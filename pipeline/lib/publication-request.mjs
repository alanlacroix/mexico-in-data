// A repository request is a short-lived dispatch signal, never a budget override.
import fs from 'node:fs';
import newsDay from './news-day.cjs';

export const MAX_REQUEST_WINDOW_MS = 30 * 60 * 1000;
export const PUBLICATION_REQUEST_FILE = new URL('../../ops/publication-request.json', import.meta.url);
const FIELDS = ['editorialDate', 'slot', 'expiresAt', 'purpose'];

export function validatePublicationRequest(value, now = new Date()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== FIELDS.length || !FIELDS.every(key => Object.hasOwn(value, key))) return null;
  if (value.editorialDate !== newsDay.editorialDay(now)
    || !['morning', 'noon'].includes(value.slot)
    || typeof value.purpose !== 'string' || !value.purpose.trim() || value.purpose.length > 200
    || /[\u0000-\u001f\u007f]/.test(value.purpose)
    || typeof value.expiresAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.expiresAt)) return null;
  const remaining = Date.parse(value.expiresAt) - new Date(now).getTime();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > MAX_REQUEST_WINDOW_MS) return null;
  return { ...value };
}

export function readPublicationRequest(file = PUBLICATION_REQUEST_FILE, now = new Date()) {
  try {
    if (fs.statSync(file).size > 4096) return null;
    return validatePublicationRequest(JSON.parse(fs.readFileSync(file, 'utf8')), now);
  } catch { return null; }
}

export function requirePublicationRequest({ event = process.env.TRIGGER_EVENT, now = new Date(), file = PUBLICATION_REQUEST_FILE } = {}) {
  if (event !== 'push') return;
  if (!readPublicationRequest(file, now)) throw new Error('Repository publication request is missing, invalid or expired');
}
