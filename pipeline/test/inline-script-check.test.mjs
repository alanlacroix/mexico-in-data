import assert from 'node:assert/strict';
import { checkInlineScriptsInHtml, findExecutableInlineScripts } from '../lib/inline-script-check.mjs';

const valid = `<!doctype html>
<script>const classic = 1;</script>
<script type="text/javascript; charset=utf-8">let mimeClassic = 2;</script>
<script type="module">import value from './value.js'; export { value };</script>
<script src="/broken.js">const repeated = 1; const repeated = 2;</script>
<script type="application/ld+json">{"not": "javascript"}</script>`;

const executable = findExecutableInlineScripts(valid);
assert.deepEqual(executable.map((script) => script.mode), ['classic', 'classic', 'module']);
assert.equal(checkInlineScriptsInHtml(valid).failures.length, 0, 'valid executable scripts should pass');

const duplicateClassic = checkInlineScriptsInHtml(`
<script>
const POL_RX = /politics/;
const POL_RX = /elections/;
</script>`);
assert.equal(duplicateClassic.checked, 1);
assert.equal(duplicateClassic.failures.length, 1);
assert.equal(duplicateClassic.failures[0].mode, 'classic');
assert.match(duplicateClassic.failures[0].message, /POL_RX.*already been declared/);
assert.equal(duplicateClassic.failures[0].htmlLine, 4);

const duplicateModule = checkInlineScriptsInHtml(`<script type='module'>
export const answer = 1;
const answer = 2;
</script>`);
assert.equal(duplicateModule.failures.length, 1);
assert.equal(duplicateModule.failures[0].mode, 'module');
assert.match(duplicateModule.failures[0].message, /answer.*already been declared/);
assert.equal(duplicateModule.failures[0].htmlLine, 3);

const ignored = checkInlineScriptsInHtml(`
<script SRC="/external.js">const bad = ;</script>
<script type="application/ld+json">{"valid": true}</script>
<script type="importmap">{"imports": {}}</script>`);
assert.equal(ignored.checked, 0);
assert.equal(ignored.failures.length, 0);

console.log('inline-script-check: ok');
