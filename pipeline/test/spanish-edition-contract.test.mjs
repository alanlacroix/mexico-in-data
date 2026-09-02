import assert from 'node:assert/strict';
import fs from 'node:fs';
import publicEdition from '../lib/public-edition.cjs';

const edition = JSON.parse(fs.readFileSync(new URL('../../data/edition.json', import.meta.url), 'utf8'));

assert.equal(publicEdition.validateEdition(edition).ok, true);
assert.ok(edition.stories.length >= 1 && edition.stories.length <= 3);
for (const story of edition.stories) {
  assert.ok(story.en && story.es);
  assert.deepEqual(Object.keys(story.en), Object.keys(story.es));
  for (const field of publicEdition.TEXT_FIELDS) {
    assert.ok(story.en[field].trim(), `${story.id} missing English ${field}`);
    assert.ok(story.es[field].trim(), `${story.id} missing Spanish ${field}`);
  }
}
assert.ok(edition.weekStories.every((story) => story.en?.headline && story.es?.headline));

console.log('Spanish edition contract: ok');
