// Small UI pieces shared by the PDF & print tools.
import { h, row, dropzone, download, fmtBytes, note } from '../ui.js';
import { sendBtn } from '../hub.js';
import { pdfLib, openView, renderPage, zipFiles, isPdf, bytesOf, pdfFile, baseName } from './pdf-core.js';

export const PDF_ACCEPT = 'application/pdf,.pdf';

// A drop area for PDFs that also offers a made-up sample to try the tool with.
export function pdfDrop({ multiple = false, label, onfiles, sample = 8 }) {
  const dz = dropzone({
    accept: PDF_ACCEPT, multiple,
    label: label || (multiple ? 'Drop PDFs here, or tap to choose' : 'Drop a PDF here, or tap to choose one'),
    onfiles: files => {
      const ok = files.filter(isPdf);
      if (!ok.length) { err.error('That is not a PDF.'); return; }
      err.clear();
      onfiles(ok);
    },
  });
  const err = note();
  const btn = sample && h('button', {
    class: 'btn small ghost pdf-sample', type: 'button',
    onclick: async () => onfiles([await samplePdf(sample)]),
  }, 'No PDF to hand? Try a sample');
  return h('div', { class: 'stack pdf-drop' }, dz, err.el, btn);
}

// A made-up document: numbered, coloured pages so the result of each tool is easy to see.
export async function samplePdf(pages = 8, name = 'sample.pdf') {
  const { PDFDocument, StandardFonts, rgb } = await pdfLib();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const tints = [[.91, .64, .24], [.37, .72, .69], [.88, .46, .31], [.65, .72, .42], [.85, .54, .66], [.78, .61, .88], [.5, .65, .91], [.85, .76, .48]];
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([595.28, 841.89]);
    const [r, g, b] = tints[(i - 1) % tints.length];
    p.drawRectangle({ x: 56, y: 70, width: 483.28, height: 715.89, borderColor: rgb(r, g, b), borderWidth: 6 });
    p.drawRectangle({ x: 56, y: 640, width: 483.28, height: 145.89, color: rgb(r, g, b) });
    p.drawText(String(i), { x: 297.64 - font.widthOfTextAtSize(String(i), 220) / 2, y: 330, size: 220, font, color: rgb(r * .6, g * .6, b * .6) });
    p.drawText(`Page ${i}`, { x: 80, y: 690, size: 40, font, color: rgb(1, 1, 1) });
    p.drawText('Sample document made by The Toolbox', { x: 80, y: 110, size: 14, font: body, color: rgb(.35, .35, .35) });
  }
  doc.setTitle('Sample');
  return pdfFile(await doc.save(), name);
}

// Download + Send to… for one or more result files. el.files holds them (tests read it).
export function resultBox(zipName = 'files.zip') {
  const info = h('p', { class: 'pdf-result-info' });
  let files = [];
  const dl = h('button', {
    class: 'btn primary', type: 'button',
    onclick: async () => {
      if (!files.length) return;
      if (files.length === 1) download(files[0].name, files[0]);
      else download(zipName, await zipFiles(files));
    },
  }, 'Download');
  const el = h('div', { class: 'pdf-result', hidden: true }, info, row(dl, sendBtn(() => (files.length ? { files } : null))));
  el.files = [];
  return {
    el,
    set(list, text) {
      files = [].concat(list).filter(Boolean);
      el.files = files;
      el.hidden = !files.length;
      info.textContent = text || (files.length === 1 ? `${files[0].name} — ${fmtBytes(files[0].size)}` : `${files.length} files`);
      dl.textContent = files.length > 1 ? `Download all (${files.length} files, .zip)` : 'Download';
    },
    clear() { files = []; el.files = []; el.hidden = true; },
    get files() { return files; },
  };
}

// Renders the first few pages of a PDF as small pictures.
export async function previewPages(container, bytes, { max = 4, width = 240, label } = {}) {
  container.replaceChildren();
  const view = await openView(bytes);
  try {
    const n = Math.min(max, view.numPages);
    for (let i = 1; i <= n; i++) {
      const c = await renderPage(await view.getPage(i), { width: width * 2 });
      c.className = 'pdf-sheet';
      container.append(h('figure', { class: 'pdf-fig' }, c, h('figcaption', {}, label ? label(i) : `Page ${i}`)));
    }
    if (view.numPages > n) container.append(h('p', { class: 'field-hint' }, `…and ${view.numPages - n} more`));
    return view.numPages;
  } finally { view.destroy(); }
}

// Runs fn with the button disabled, showing errors in the note.
export async function busy(btn, err, fn) {
  if (btn) btn.disabled = true;
  err?.clear();
  try { return await fn(); }
  catch (e) { console.warn(e); err?.error(e?.message || String(e)); return null; }
  finally { if (btn) btn.disabled = false; }
}

// A loaded PDF: bytes plus a line saying what it is.
export async function readPdf(file) {
  const bytes = await bytesOf(file);
  return { file, bytes, name: baseName(file.name) };
}
