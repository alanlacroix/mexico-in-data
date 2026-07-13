import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const JAVASCRIPT_MIME_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-ecmascript',
  'application/x-javascript',
  'text/ecmascript',
  'text/javascript',
  'text/javascript1.0',
  'text/javascript1.1',
  'text/javascript1.2',
  'text/javascript1.3',
  'text/javascript1.4',
  'text/javascript1.5',
  'text/jscript',
  'text/livescript',
  'text/x-ecmascript',
  'text/x-javascript',
]);

function parseAttributes(source) {
  const attributes = new Map();
  const pattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(source))) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function executableMode(attributes) {
  if (attributes.has('src')) return null;
  if (!attributes.has('type')) return 'classic';
  const type = attributes.get('type').trim().toLowerCase();
  if (!type) return 'classic';
  if (type === 'module') return 'module';
  const mime = type.split(';', 1)[0].trim();
  return JAVASCRIPT_MIME_TYPES.has(mime) ? 'classic' : null;
}

function lineAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (source.charCodeAt(index) === 10) line += 1;
  return line;
}

export function findExecutableInlineScripts(html) {
  const scripts = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  let tagIndex = 0;
  while ((match = pattern.exec(html))) {
    tagIndex += 1;
    const mode = executableMode(parseAttributes(match[1]));
    if (!mode) continue;
    const contentOffset = match.index + match[0].indexOf('>') + 1;
    scripts.push({
      code: match[2],
      mode,
      startLine: lineAt(html, contentOffset),
      tagIndex,
    });
  }
  return scripts;
}

function syntaxMessage(output, fallback) {
  return output.match(/SyntaxError:\s*([^\n]+)/)?.[1]?.trim() || fallback;
}

function checkClassic(script) {
  const filename = `inline-script-${script.tagIndex}.js`;
  try {
    new vm.Script(script.code, { filename });
    return null;
  } catch (error) {
    const relativeLine = Number(String(error.stack || '').match(new RegExp(`${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+)`))?.[1] || 1);
    return {
      htmlLine: script.startLine + relativeLine - 1,
      message: error.message || 'invalid classic JavaScript',
    };
  }
}

function checkModule(script) {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    encoding: 'utf8',
    input: script.code,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) return { htmlLine: script.startLine, message: result.error.message };
  if (result.status === 0) return null;
  const output = `${result.stderr || ''}\n${result.stdout || ''}`;
  const relativeLine = Number(output.match(/^\[stdin\]:(\d+)/m)?.[1] || 1);
  return {
    htmlLine: script.startLine + relativeLine - 1,
    message: syntaxMessage(output, `module syntax check exited ${result.status ?? 'without a status'}`),
  };
}

export function checkInlineScriptsInHtml(html) {
  const scripts = findExecutableInlineScripts(html);
  const failures = [];
  for (const script of scripts) {
    const failure = script.mode === 'module' ? checkModule(script) : checkClassic(script);
    if (failure) failures.push({ ...failure, mode: script.mode, tagIndex: script.tagIndex });
  }
  return { checked: scripts.length, failures };
}
