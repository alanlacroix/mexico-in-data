import fs from 'node:fs';
import history from './lib/edition-history.cjs';
const edition = JSON.parse(fs.readFileSync(new URL('../data/edition.json', import.meta.url), 'utf8'));
history.archivePublishedEdition(edition);
console.log(`Archive: ${edition.editorialDate}`);
