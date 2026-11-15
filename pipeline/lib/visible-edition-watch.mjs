import { parseDocument, DomUtils } from 'htmlparser2';
import reading from './weekly-reading.cjs';

const normalized = value => String(value || '').replace(/\s+/g, ' ').trim();
function hidden(node) {
  for (let current = node; current; current = current.parent) {
    const attrs = current.attribs || {};
    if (['script', 'style', 'template', 'noscript'].includes(current.name)
      || Object.hasOwn(attrs, 'hidden') || attrs['aria-hidden'] === 'true'
      || /(?:^|\s)(?:hidden|visually-hidden|sr-only)(?:\s|$)/.test(attrs.class || '')
      || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs.style || '')) return true;
  }
  return false;
}

function visibleText(node) {
  if (hidden(node)) return '';
  if (node.type === 'text') return node.data;
  return (node.children || []).map(visibleText).join('');
}

// Match the reviewed weekly units by identity and text, never by artifact hash
// alone. Historical independently authored weekly explanations remain untouched.
export function assertVisibleEditionWatch(html, edition, locale) {
  const document = parseDocument(html);
  for (const item of edition.weeklyBrief?.items || []) {
    const copy = reading.weeklyReading(item, edition.stories, locale);
    if (!copy?.watch) continue;
    const blocks = DomUtils.findAll(node => node.attribs?.id === `development-${item.id}`, document.children);
    if (blocks.length !== 1 || hidden(blocks[0])) throw new Error(`missing visible ${locale} story ${item.id}`);
    const paragraphs = DomUtils.findAll(node => node.name === 'p'
      && !hidden(node) && normalized(visibleText(node)) === normalized(copy.watch), blocks[0].children);
    if (paragraphs.length !== 1) throw new Error(`missing or duplicated visible ${locale} watch for ${item.id}`);
  }
}
