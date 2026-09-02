'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { bilingualFidelityFlags } = require('./bilingual-fidelity.cjs');

const SCHEMA_VERSION = 1;
const TEXT_FIELDS = ['headline', 'dek', 'background', 'view', 'watch'];
const DAILY_LANES = new Set(['today', 'key-development']);
const WEEKEND_LANES = new Set(['weekend', 'week-recap']);

const clean = (value) => String(value || '').trim();
const narrativeErrors = (value) => {
  const text = clean(value);
  const errors = [];
  if (!text) return ['is empty'];
  if (/[<>]|[\u0000-\u001f\u007f-\u009f]/.test(text)) errors.push('contains markup or control characters');
  if (/\b(?:source\s*title|source\s*dek|sourceTitle|sourceDek|reportEvidence|evidence\s+strings?|input\s+labels?)\b/i.test(text)) {
    errors.push('contains internal prompt or schema narration');
  }
  return errors;
};
const validDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
const validIso = (value) => Number.isFinite(Date.parse(clean(value)));
const validHttps = (value) => {
  try {
    const url = new URL(clean(value));
    return url.protocol === 'https:' && !url.username && !url.password
      && !/(?:^|[?&])(?:token|apikey|api_key|key)=/i.test(url.search);
  } catch { return false; }
};
const previousDay = (day) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};
const mondayOf = (day) => {
  const date = new Date(`${day}T12:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
};
const weekendDay = (day) => [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());

function canonicalEdition(edition) {
  const copy = JSON.parse(JSON.stringify(edition || {}));
  delete copy.artifactHash;
  return `${JSON.stringify(copy)}\n`;
}

function editionHash(edition) {
  return crypto.createHash('sha256').update(canonicalEdition(edition)).digest('hex');
}

function validateEdition(edition) {
  const errors = [];
  if (!edition || typeof edition !== 'object' || Array.isArray(edition)) return { ok: false, errors: ['edition must be an object'] };
  if (edition.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (!validDay(edition.editorialDate)) errors.push('editorialDate must be YYYY-MM-DD');
  if (!validIso(edition.generatedAt)) errors.push('generatedAt must be an ISO timestamp');
  if (!['morning', 'noon', 'migration'].includes(edition.slot)) errors.push('slot must be morning, noon, or migration');
  if (!['daily', 'weekend-recap'].includes(edition.editionType)) errors.push('editionType must be daily or weekend-recap');
  if (!/^[a-f0-9]{64}$/.test(clean(edition.candidateSignature))) errors.push('candidateSignature must be a sha256 hash');
  if (!edition.summary || !clean(edition.summary.en) || !clean(edition.summary.es)) errors.push('summary must contain English and Spanish');
  else {
    for (const locale of ['en', 'es']) for (const error of narrativeErrors(edition.summary[locale])) errors.push(`summary.${locale} ${error}`);
  }

  const stories = Array.isArray(edition.stories) ? edition.stories : [];
  const weekStories = Array.isArray(edition.weekStories) ? edition.weekStories : [];
  if (stories.length < 1 || stories.length > 3) errors.push('stories must contain 1 to 3 items');
  if (weekStories.length < 1 || weekStories.length > 21) errors.push('weekStories must contain 1 to 21 items');
  const ids = new Set();
  const urls = new Set();
  const todayCount = stories.filter((story) => story?.date === edition.editorialDate).length;
  const weekend = weekendDay(edition.editorialDate);
  if (edition.editionType === 'daily' && weekend) errors.push('a weekend editorial date must use weekend-recap');
  if (edition.editionType === 'weekend-recap' && !weekend) errors.push('weekend-recap requires Saturday or Sunday');
  if (edition.editionType === 'daily' && todayCount < 1) errors.push('a daily edition needs at least one exact-day story');

  for (const [index, story] of stories.entries()) {
    const label = `stories[${index}]`;
    if (!clean(story?.id)) errors.push(`${label}.id is missing`);
    else if (ids.has(story.id)) errors.push(`${label}.id is duplicated`);
    ids.add(story?.id);
    if (!validDay(story?.date)) errors.push(`${label}.date must be YYYY-MM-DD`);
    if (!validIso(story?.publishedAt)) errors.push(`${label}.publishedAt must be an ISO timestamp`);
    if (!clean(story?.section)) errors.push(`${label}.section is missing`);
    if (!clean(story?.source)) errors.push(`${label}.source is missing`);
    if (!validHttps(story?.url)) errors.push(`${label}.url must be HTTPS`);
    else if (urls.has(story.url)) errors.push(`${label}.url is duplicated`);
    urls.add(story?.url);

    if (edition.editionType === 'daily') {
      if (!DAILY_LANES.has(story?.lane)) errors.push(`${label}.lane is invalid for a daily edition`);
      if (story?.lane === 'today' && story.date !== edition.editorialDate) errors.push(`${label} today lane has the wrong date`);
      if (story?.lane === 'key-development' && story.date !== previousDay(edition.editorialDate)) errors.push(`${label} key-development must be from the previous day`);
    } else {
      if (!WEEKEND_LANES.has(story?.lane)) errors.push(`${label}.lane is invalid for a weekend recap`);
      const start = mondayOf(edition.editorialDate);
      if (validDay(story?.date) && (story.date < start || story.date > edition.editorialDate)) errors.push(`${label}.date falls outside the current week`);
      if (story?.lane === 'weekend' && ![0, 6].includes(new Date(`${story.date}T12:00:00Z`).getUTCDay())) errors.push(`${label} weekend lane is not Saturday or Sunday`);
    }

    const evidence = Array.isArray(story?.evidence) ? story.evidence : [];
    const evidenceIds = new Set();
    for (const [evidenceIndex, item] of evidence.entries()) {
      if (!clean(item?.id)) errors.push(`${label}.evidence[${evidenceIndex}].id is missing`);
      else if (evidenceIds.has(item.id)) errors.push(`${label}.evidence id ${item.id} is duplicated`);
      evidenceIds.add(item?.id);
      if (!clean(item?.kind)) errors.push(`${label}.evidence[${evidenceIndex}].kind is missing`);
      if (!clean(item?.source)) errors.push(`${label}.evidence[${evidenceIndex}].source is missing`);
      if (!validHttps(item?.url)) errors.push(`${label}.evidence[${evidenceIndex}].url must be HTTPS`);
    }
    if (evidence.length < 2) errors.push(`${label} needs the article and at least one independent evidence source`);
    if (!evidence.some((item) => item?.id === 'article' && item?.url === story.url)) {
      errors.push(`${label} needs its exact article in evidence`);
    }

    for (const locale of ['en', 'es']) {
      if (!story?.[locale] || typeof story[locale] !== 'object') {
        errors.push(`${label}.${locale} is missing`);
        continue;
      }
      for (const field of TEXT_FIELDS) {
        if (!clean(story[locale][field])) errors.push(`${label}.${locale}.${field} is missing`);
        else for (const error of narrativeErrors(story[locale][field])) errors.push(`${label}.${locale}.${field} ${error}`);
      }
    }
    if (story?.en && story?.es) {
      for (const field of TEXT_FIELDS) {
        for (const error of bilingualFidelityFlags({ english: story.en[field], spanish: story.es[field] })) {
          errors.push(`${label}.${field} ${error}`);
        }
      }
    }
    const refs = story?.evidenceRefs && typeof story.evidenceRefs === 'object' ? story.evidenceRefs : {};
    for (const field of TEXT_FIELDS) {
      const fieldRefs = Array.isArray(refs[field]) ? refs[field] : [];
      if (!fieldRefs.length || fieldRefs.length > 3) errors.push(`${label}.evidenceRefs.${field} must contain 1 to 3 ids`);
      for (const ref of fieldRefs) if (!evidenceIds.has(ref)) errors.push(`${label}.evidenceRefs.${field} contains unknown id ${ref}`);
    }
  }

  const weekIds = new Set();
  const weekUrls = new Set();
  const weekStart = validDay(edition.editorialDate) ? mondayOf(edition.editorialDate) : '';
  for (const [index, story] of weekStories.entries()) {
    const label = `weekStories[${index}]`;
    if (!clean(story?.id)) errors.push(`${label}.id is missing`);
    else if (weekIds.has(story.id)) errors.push(`${label}.id is duplicated`);
    weekIds.add(story?.id);
    if (!validDay(story?.date)) errors.push(`${label}.date must be YYYY-MM-DD`);
    else if (weekStart && (story.date < weekStart || story.date > edition.editorialDate)) errors.push(`${label}.date falls outside the edition week`);
    if (!validIso(story?.publishedAt)) errors.push(`${label}.publishedAt must be an ISO timestamp`);
    if (!clean(story?.section)) errors.push(`${label}.section is missing`);
    if (!clean(story?.source)) errors.push(`${label}.source is missing`);
    if (!validHttps(story?.url)) errors.push(`${label}.url must be HTTPS`);
    else if (weekUrls.has(story.url)) errors.push(`${label}.url is duplicated`);
    weekUrls.add(story?.url);
    for (const locale of ['en', 'es']) {
      if (!clean(story?.[locale]?.headline)) errors.push(`${label}.${locale}.headline is missing`);
      else for (const error of narrativeErrors(story[locale].headline)) errors.push(`${label}.${locale}.headline ${error}`);
      if (!clean(story?.[locale]?.dek)) errors.push(`${label}.${locale}.dek is missing`);
      else for (const error of narrativeErrors(story[locale].dek)) errors.push(`${label}.${locale}.dek ${error}`);
    }
  }
  for (const story of stories) {
    if (!weekIds.has(story.id)) {
      errors.push(`current story ${story.id} is missing from weekStories`);
      continue;
    }
    const weekly = weekStories.find((item) => item.id === story.id);
    for (const field of ['date', 'section', 'source', 'url', 'publishedAt']) {
      if (weekly?.[field] !== story[field]) errors.push(`current story ${story.id} disagrees with weekStories.${field}`);
    }
    for (const locale of ['en', 'es']) {
      for (const field of ['headline', 'dek']) {
        if (weekly?.[locale]?.[field] !== story?.[locale]?.[field]) errors.push(`current story ${story.id} disagrees with weekStories.${locale}.${field}`);
      }
    }
  }

  if (/^[a-f0-9]{64}$/.test(clean(edition.artifactHash)) && edition.artifactHash !== editionHash(edition)) {
    errors.push('artifactHash does not match the edition content');
  } else if (!/^[a-f0-9]{64}$/.test(clean(edition.artifactHash))) {
    errors.push('artifactHash must be a sha256 hash');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function withArtifactHash(edition) {
  const out = JSON.parse(JSON.stringify(edition));
  out.artifactHash = editionHash(out);
  return out;
}

function atomicWriteEdition(file, edition) {
  const checked = withArtifactHash(edition);
  const validation = validateEdition(checked);
  if (!validation.ok) throw new Error(`invalid edition: ${validation.errors.join('; ')}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(checked, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch { /* renamed or never created */ }
  }
  return checked;
}

module.exports = {
  SCHEMA_VERSION,
  TEXT_FIELDS,
  atomicWriteEdition,
  canonicalEdition,
  editionHash,
  mondayOf,
  previousDay,
  validateEdition,
  weekendDay,
  withArtifactHash,
};
