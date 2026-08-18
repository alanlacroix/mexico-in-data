import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(FILE), '..');

export function publicationReadiness(brief, editorialDate) {
  const stories = [brief?.lead, ...(Array.isArray(brief?.items) ? brief.items : [])].filter(Boolean);
  if (brief?.meta?.editorialDate !== editorialDate) {
    throw new Error(`Brief editorial date ${brief?.meta?.editorialDate || '(missing)'} does not match ${editorialDate}`);
  }
  const policy = brief?.meta?.selection?.policy;
  const todayCount = stories.filter((story) => story?.lane === 'today' && story?.date === editorialDate).length;
  if (!stories.length) {
    return { publish: false, storyCount: 0, todayCount, reason: 'no selected stories; preserve the last complete edition and retry hourly' };
  }
  if (policy === 'exact-day-plus-carryover-v1' && todayCount === 0) {
    return {
      publish: false,
      storyCount: stories.length,
      todayCount,
      reason: 'weekday edition has no same-day stories; preserve the last complete edition and retry when new reporting arrives',
    };
  }
  return { publish: true, storyCount: stories.length, todayCount, reason: `${stories.length} selected stories` };
}

function writeOutput(result) {
  const lines = [
    `publish=${result.publish}`,
    `story_count=${result.storyCount}`,
    `today_count=${result.todayCount}`,
    `reason=${result.reason}`,
  ].join('\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`);
  console.log(lines);
}

if (process.argv[1] && path.resolve(process.argv[1]) === FILE) {
  const editorialDate = process.env.PUBLICATION_DATE;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(editorialDate || '')) {
    throw new Error(`Invalid publication date: ${editorialDate || '(missing)'}`);
  }
  const brief = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'brief.json'), 'utf8'));
  writeOutput(publicationReadiness(brief, editorialDate));
}
