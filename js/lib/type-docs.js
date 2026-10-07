// Conversions for the Document converter. Libraries load only when needed:
// marked (MIT) for Markdown → HTML, turndown + turndown-plugin-gfm (MIT) for
// HTML → Markdown, mammoth (BSD-2) for DOCX → HTML, docx (MIT) to write DOCX.

let td;
async function turndown() {
  if (td) return td;
  const [{ default: TurndownService }, { gfm }] = await Promise.all([
    import('../../vendor/turndown.js'), import('../../vendor/turndown-plugin-gfm.js')]);
  td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**', hr: '---' });
  td.use(gfm);
  // One space after the list marker, as most people write Markdown.
  td.addRule('listItem', {
    filter: 'li',
    replacement(content, node) {
      const parent = node.parentNode;
      let prefix = '- ';
      if (parent.nodeName === 'OL') {
        const start = +(parent.getAttribute('start') || 1);
        prefix = (start + [...parent.children].indexOf(node)) + '. ';
      }
      content = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n(?!$)/gm, '\n' + ' '.repeat(prefix.length));
      return prefix + content.replace(/\n$/, '') + (node.nextSibling ? '\n' : '');
    },
  });
  td.remove(['script', 'style', 'title', 'meta']);
  return td;
}

export async function mdToHtml(md) {
  const { marked } = await import('../../vendor/marked.js');
  return marked.parse(md, { gfm: true, async: false }).trim();
}

export async function htmlToMd(html) {
  return (await turndown()).turndown(html).trim();
}

export const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const txtToHtml = t => t.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>\n')}</p>`).join('\n');

export function htmlToTxt(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const br of doc.querySelectorAll('br')) br.replaceWith('\n');
  for (const b of doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, tr, div')) b.append('\n');
  for (const li of doc.querySelectorAll('li')) li.prepend('• ');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export async function docxToHtml(buf) {
  if (!globalThis.mammoth) await import('../../vendor/mammoth.js');
  const r = await globalThis.mammoth.convertToHtml({ arrayBuffer: buf });
  return { html: r.value, warnings: r.messages.map(m => m.message) };
}

// --- HTML → DOCX -------------------------------------------------------------
export async function htmlToDocx(html, title = 'Document') {
  const D = await import('../../vendor/docx.js');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const dropped = new Set();
  let listInstance = 0;

  function runs(node, st = {}) {
    const out = [];
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        const text = n.textContent.replace(/\s+/g, ' ');
        if (text) out.push(new D.TextRun({ text, bold: st.b, italics: st.i, strike: st.s, font: st.code ? 'Consolas' : undefined, style: st.link ? 'Hyperlink' : undefined }));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (tag === 'BR') { out.push(new D.TextRun({ break: 1 })); continue; }
      if (tag === 'IMG') { dropped.add('images'); out.push(new D.TextRun({ text: `[image${n.alt ? ': ' + n.alt : ''}]`, italics: true })); continue; }
      if (/^(UL|OL|TABLE|PRE|BLOCKQUOTE|H[1-6]|P|DIV|HR)$/.test(tag)) continue; // handled as blocks
      const next = { ...st };
      if (tag === 'STRONG' || tag === 'B') next.b = true;
      if (tag === 'EM' || tag === 'I') next.i = true;
      if (tag === 'DEL' || tag === 'S') next.s = true;
      if (tag === 'CODE' || tag === 'KBD') next.code = true;
      if (tag === 'A' && n.getAttribute('href') && /^(https?:|mailto:)/.test(n.getAttribute('href'))) {
        out.push(new D.ExternalHyperlink({ link: n.getAttribute('href'), children: runs(n, { ...next, link: true }) }));
        continue;
      }
      out.push(...runs(n, next));
    }
    return out;
  }

  function blocks(node, ctx = {}) {
    const out = [];
    let loose = [];
    const flush = () => {
      if (!loose.length) return;
      const holder = doc.createElement('p');
      holder.append(...loose.map(n => n.cloneNode(true)));
      loose = [];
      if (holder.textContent.trim() || holder.querySelector('img')) out.push(new D.Paragraph({ children: runs(holder), indent: ctx.indent }));
    };
    for (const n of node.childNodes) {
      const tag = n.nodeType === 1 ? n.tagName : null;
      if (!tag || !/^(UL|OL|TABLE|PRE|BLOCKQUOTE|H[1-6]|P|DIV|HR|SECTION|ARTICLE|HEADER|FOOTER|MAIN|FIGURE)$/.test(tag)) { loose.push(n); continue; }
      flush();
      if (/^H[1-6]$/.test(tag)) out.push(new D.Paragraph({ heading: D.HeadingLevel['HEADING_' + tag[1]], children: runs(n) }));
      else if (tag === 'P') out.push(new D.Paragraph({ children: runs(n), indent: ctx.indent }));
      else if (tag === 'HR') out.push(new D.Paragraph({ children: [], border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } } }));
      else if (tag === 'PRE') {
        const lines = n.textContent.replace(/\n$/, '').split('\n');
        out.push(new D.Paragraph({
          shading: { type: D.ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
          children: lines.map((l, i) => new D.TextRun({ text: l, font: 'Consolas', break: i ? 1 : 0 })),
        }));
      } else if (tag === 'BLOCKQUOTE') out.push(...blocks(n, { ...ctx, indent: { left: (ctx.indent?.left || 0) + 720 } }));
      else if (tag === 'UL' || tag === 'OL') out.push(...list(n, 0));
      else if (tag === 'TABLE') out.push(table(n));
      else out.push(...blocks(n, ctx));
    }
    flush();
    return out;
  }

  function list(el, level) {
    const ordered = el.tagName === 'OL';
    const instance = ++listInstance;
    const out = [];
    for (const li of el.children) {
      if (li.tagName !== 'LI') continue;
      const inner = li.cloneNode(true);
      const nested = [...inner.querySelectorAll(':scope > ul, :scope > ol')];
      nested.forEach(x => x.remove());
      for (const p of inner.querySelectorAll(':scope > p')) { p.after(doc.createElement('br')); p.replaceWith(...p.childNodes); }
      const para = ordered
        ? new D.Paragraph({ children: runs(inner), numbering: { reference: 'numbers', level: Math.min(level, 8), instance } })
        : new D.Paragraph({ children: runs(inner), bullet: { level: Math.min(level, 8) } });
      out.push(para);
      for (const sub of li.querySelectorAll(':scope > ul, :scope > ol')) out.push(...list(sub, level + 1));
    }
    return out;
  }

  function table(el) {
    const rows = [...el.querySelectorAll('tr')].map(tr => new D.TableRow({
      children: [...tr.children].map(td => new D.TableCell({
        children: [new D.Paragraph({ children: runs(td, { b: td.tagName === 'TH' }) })],
      })),
    })).filter(r => r);
    if (!rows.length) return new D.Paragraph({ children: [] });
    return new D.Table({ rows, width: { size: 100, type: D.WidthType.PERCENTAGE } });
  }

  const children = blocks(doc.body);
  if (doc.querySelector('[style], font, span[class]')) dropped.add('colours and inline styles');
  const levels = [...Array(9)].map((_, i) => ({
    level: i, format: [D.LevelFormat.DECIMAL, D.LevelFormat.LOWER_LETTER, D.LevelFormat.LOWER_ROMAN][i % 3],
    text: `%${i + 1}.`, alignment: D.AlignmentType.START,
    style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } },
  }));
  const file = new D.Document({
    title, creator: 'The Toolbox',
    numbering: { config: [{ reference: 'numbers', levels }] },
    sections: [{ children: children.length ? children : [new D.Paragraph({ children: [] })] }],
  });
  const blob = await D.Packer.toBlob(file);
  return { blob, dropped: [...dropped] };
}
