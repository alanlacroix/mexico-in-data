import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blockPath = path.join(ROOT, 'ops', 'publication-block.json');

if (fs.existsSync(blockPath)) {
  fs.rmSync(blockPath);
  console.log('publication circuit breaker cleared');
}
