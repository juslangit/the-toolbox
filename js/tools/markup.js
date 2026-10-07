import { h, field, textarea, checkbox, output, card, grid, tabs, on } from '../ui.js';
import { marked } from '../../vendor/marked.js';
import { textOf } from '../hub.js';

const BASIC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function encode(s, allNonAscii) {
  let out = s.replace(/[&<>"']/g, c => BASIC[c]);
  if (allNonAscii) out = [...out].map(c => c.codePointAt(0) > 126 ? `&#x${c.codePointAt(0).toString(16).toUpperCase()};` : c).join('');
  return out;
}
// A <textarea> decodes entities without ever running markup, so this is safe.
function decode(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

const entities = {
  id: 'entities', name: 'HTML entities', group: 'convert', icon: 'code-xml',
  desc: 'Escape text so it shows as-is in HTML (&lt; &amp; …), or turn entities back into text.',
  keywords: 'html entities escape unescape encode decode amp lt gt',
  render(root) {
    const plain = textarea({ rows: 6, value: 'Harga <b>RM180</b> & "sarapan" percuma — café' });
    const coded = textarea({ rows: 6 });
    const all = checkbox('Also encode every non-ASCII character (é → &#xE9;)');
    const enc = () => { coded.value = encode(plain.value, all.input.checked); };
    plain.addEventListener('input', enc);
    all.input.addEventListener('change', enc);
    coded.addEventListener('input', () => { plain.value = decode(coded.value); });
    root.append(card(grid(field('Text', plain), field('HTML-escaped', coded)), all,
      h('p', { class: 'field-hint' }, 'Type in either box — the other one follows.')));
    enc();
  },
};

const PREVIEW_CSS = `body{font:16px/1.6 system-ui,-apple-system,sans-serif;color:#2a211a;background:#fffaf3;margin:0;padding:18px 22px;}
h1,h2,h3{line-height:1.2}pre{background:#f3ece1;padding:12px;border-radius:8px;overflow:auto}code{font:.9em ui-monospace,Menlo,monospace;background:#f3ece1;padding:1px 4px;border-radius:4px}
pre code{background:none;padding:0}blockquote{margin:0;padding-left:14px;border-left:4px solid #e8a33d;color:#5c4f43}
table{border-collapse:collapse}td,th{border:1px solid #ddd0bd;padding:6px 10px}img{max-width:100%}a{color:#a35f00}`;

const SAMPLE = `# Sample homestay

A **3-bedroom** house, *ten minutes* from town.

## Prices
| Night | RM |
|---|---|
| Weekday | 180 |
| Weekend | 230 |

- Free WiFi and parking
- Check-in from 3pm

> Book on WhatsApp — see [the website](https://kasih-alza.pages.dev).

\`\`\`js
const total = nights * 180;
\`\`\`
`;

const markdown = {
  id: 'markdown', name: 'Markdown preview', group: 'convert', icon: 'file-text',
  desc: 'Write Markdown, see it rendered, and copy the HTML.',
  keywords: 'markdown md html preview render readme convert',
  accepts: ['.md', 'text/markdown', 'text'],
  render(root, incoming) {
    textOf(incoming).then(t => { if (t != null) { src.value = t; src.dispatchEvent(new Event('input')); } });
    const src = textarea({ rows: 18, value: SAMPLE });
    const view = tabs([['preview', 'Preview'], ['html', 'HTML']], 'preview', v => { frame.hidden = v !== 'preview'; html.el.hidden = v !== 'html'; });
    // sandbox="" — the preview can never run scripts from pasted Markdown.
    const frame = h('iframe', { class: 'md-frame', sandbox: '', title: 'Markdown preview' });
    const html = output('HTML', { multiline: true, rows: 18 });
    html.el.hidden = true;
    function run() {
      const out = marked.parse(src.value, { gfm: true, breaks: false });
      html.set(out);
      frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>${PREVIEW_CSS}</style>${out}`;
    }
    root.append(h('div', { class: 'grid2' }, card(field('Markdown', src)), card(view, frame, html.el)));
    on(src, run, 'input', 200);
  },
};

export default [entities, markdown];
export { encode, decode };
