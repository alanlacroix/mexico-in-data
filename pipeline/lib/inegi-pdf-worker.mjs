import { parentPort, workerData } from 'node:worker_threads';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

let task;
try {
  task = getDocument({ data: workerData.bytes, isEvalSupported: false,
    stopAtErrors: true, useWorkerFetch: false, useSystemFonts: false, disableFontFace: true });
  const document = await task.promise;
  if (document.numPages < 1 || document.numPages > 16) throw Error('unexpected page count');
  const pages = [];
  let characters = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
    characters += text.length;
    if (!text || characters > 65536) throw Error('empty or oversized extracted text');
    pages.push(text);
    page.cleanup();
  }
  parentPort.postMessage({ pages });
} catch {
  parentPort.postMessage({ error: 'complete PDF extraction failed' });
} finally {
  if (task) await task.destroy();
  parentPort.close();
}
