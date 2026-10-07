// Checks for the Text & type drawer (js/tools/type.js).
import { set, val, wait, giveFile, until } from '../helpers.mjs';

const click = text => `[...document.querySelectorAll('.tool-body button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}).click()`;
const outVal = label => `[...document.querySelectorAll('.output')].find(o => o.querySelector('.field-label').textContent === ${JSON.stringify(label)}).querySelector('input,textarea').value`;
const field = label => `[...document.querySelectorAll('.tool-body label.field')].find(l => l.querySelector('.field-label').textContent.startsWith(${JSON.stringify(label)})).querySelector('input,textarea,select')`;
const setField = (label, v) => `(async () => { const el = ${field(label)}; el.value = ${JSON.stringify(String(v))}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); await new Promise(r => setTimeout(r, 300)); })()`;

export default {
  'large-type': [
    set('textarea', 'HI'), wait(200),
    `(() => { const i = document.querySelector('.ty-lt-inner'), s = parseFloat(i.style.fontSize); window.__ltBig = s; return s > 150 && i.scrollHeight <= document.querySelector('.ty-lt-stage').clientHeight + 1 ? '' : 'short text not big: ' + s; })()`,
    set('textarea', 'Kasih Alza Homestay WiFi password: tukang-kayu-lompat-pagar-77 and a long sentence that must wrap onto several lines'), wait(200),
    `(() => { const i = document.querySelector('.ty-lt-inner'), st = document.querySelector('.ty-lt-stage'), s = parseFloat(i.style.fontSize); return s < window.__ltBig && s > 10 && i.scrollHeight <= st.clientHeight + 1 && i.scrollWidth <= i.clientWidth + 1 ? '' : 'long text does not fit: ' + s; })()`,
    `document.querySelector('.tool-body .check input').click()`, wait(200),
    `(document.querySelectorAll('.ty-lt-ch').length === [...'Kasih Alza Homestay WiFi password: tukang-kayu-lompat-pagar-77 and a long sentence that must wrap onto several lines'].length && document.querySelectorAll('.ty-lt-ch.digit').length === 2 ? '' : 'character boxes wrong: ' + document.querySelectorAll('.ty-lt-ch').length)`,
    `document.querySelector('.ty-lt-stage').click()`, wait(200),
    `(document.querySelector('.ty-lt-full') ? '' : 'full screen overlay missing')`,
    `(document.querySelector('.ty-lt-full').click(), document.querySelector('.ty-lt-full') ? 'overlay did not close' : '')`,
  ],
  glyphs: [
    until(`document.querySelectorAll('.ty-glyph').length > 50`),
    `(document.querySelector('.ty-glyph[data-cp="65"]') ? '' : 'Basic Latin block not shown')`,
    set('.tool-body input[type=search]', 'snowman'), wait(300),
    `(document.querySelector('.ty-glyph').dataset.cp === '9731' ? '' : 'first snowman result: ' + document.querySelector('.ty-glyph')?.dataset.cp)`,
    `document.querySelector('.ty-glyph').click()`,
    `(${outVal('Code point')} === 'U+2603' && ${outVal('UTF-8 bytes')} === 'E2 98 83' && ${outVal('UTF-16 units')} === '2603' && ${outVal('CSS')} === '\\\\2603' && document.querySelector('.ty-glyph-name').textContent === 'SNOWMAN' ? '' : 'snowman facts: ' + ${outVal('Code point')} + ' ' + ${outVal('UTF-8 bytes')} + ' ' + ${outVal('CSS')})`,
    set('.tool-body input[type=search]', 'U+1F600'), wait(300),
    `(${outVal('UTF-16 units')} === 'D83D DE00' && ${outVal('UTF-8 bytes')} === 'F0 9F 98 80' && document.querySelector('.ty-glyph-name').textContent === 'GRINNING FACE' ? '' : 'emoji facts: ' + ${outVal('UTF-16 units')})`,
    set('.tool-body input[type=search]', 'ڠ'), wait(300),
    `(document.querySelector('.ty-glyph-name').textContent === 'ARABIC LETTER AIN WITH THREE DOTS ABOVE' && document.querySelector('.ty-glyph-head').textContent.includes('Jawi') ? '' : 'jawi nga: ' + document.querySelector('.ty-glyph-name').textContent)`,
  ],
  'paper-sizes': [
    `(document.querySelector('.big-say').textContent === 'A4: 210 × 297 mm' ? '' : 'A4 headline: ' + document.querySelector('.big-say').textContent)`,
    `(document.querySelector('.kv').textContent.includes('595.28 × 841.89 pt') && document.querySelector('.kv').textContent.includes('2,480 × 3,508 px') ? '' : 'A4 in pt/px: ' + document.querySelector('.kv').textContent)`,
    `(document.querySelectorAll('.ty-paper-svg rect').length === 13 ? '' : 'comparison rects ' + document.querySelectorAll('.ty-paper-svg rect').length)`,
    `(() => { const s = document.querySelector('select'); s.value = 'us'; s.dispatchEvent(new Event('change')); [...document.querySelectorAll('.ty-paper-table tbody tr')].find(r => r.firstChild.textContent === 'Letter').click(); document.querySelectorAll('.tabs button')[2].click(); })()`,
    `(document.querySelector('.big-say').textContent === 'Letter: 8.5 × 11 in' && document.querySelector('.kv').textContent.includes('612 × 792 pt') ? '' : 'Letter: ' + document.querySelector('.big-say').textContent)`,
  ],
  'line-height': [
    `(${outVal('Unitless (best for CSS)')} === '1.525' && ${outVal('Pixels')} === '24.4px' ? '' : 'lh 16/66: ' + ${outVal('Unitless (best for CSS)')} + ' ' + ${outVal('Pixels')})`,
    setField('Baseline grid', '8'),
    `(${outVal('Unitless (best for CSS)')} === '1.5' && ${outVal('Pixels')} === '24px' && ${outVal('rem')} === '1.5rem' ? '' : 'lh grid 8: ' + ${outVal('Unitless (best for CSS)')} + ' ' + ${outVal('Pixels')})`,
    `(document.querySelector('.ty-lh-preview').style.lineHeight === '1.5' ? '' : 'preview line-height ' + document.querySelector('.ty-lh-preview').style.lineHeight)`,
  ],
  'px-rem': [
    `(${field('rem')}.value === '1.5' && ${field('Points (pt)')}.value === '18' && ${field('em')}.value === '1.5' ? '' : '24px: rem ' + ${field('rem')}.value)`,
    setField('rem', '0.875'),
    `(${field('Pixels (px)')}.value === '14' ? '' : '0.875rem → px ' + ${field('Pixels (px)')}.value)`,
    setField('Root font size', '10'),
    `(${field('rem')}.value === '1.4' ? '' : 'base 10 (from 14px): ' + ${field('rem')}.value)`,
    setField('Pixels (px)', '144'),
    `(${field('Viewport width')}.value === '10' ? '' : '144px of 1440 vw: ' + ${field('Viewport width')}.value)`,
  ],
  'type-units': [
    `(${field('Picas')}.value === '1' && ${field('Pixels (px)')}.value === '16' && ${field('Millimetres')}.value === '4.2333' && ${field('Q ')}.value === '16.9333' ? '' : '12pt: ' + ${field('Picas')}.value + ' ' + ${field('Pixels (px)')}.value + ' ' + ${field('Millimetres')}.value)`,
    setField('Inches', '1'),
    `(${field('Points (pt)')}.value === '72' && ${field('Millimetres')}.value === '25.4' && ${field('Pixels (px)')}.value === '96' && ${field('em')}.value === '6' ? '' : '1in: ' + ${field('Points (pt)')}.value)`,
    setField('Pixels per inch', '300'),
    `(${field('Pixels (px)')}.value === '300' ? '' : '1in at 300dpi: ' + ${field('Pixels (px)')}.value)`,
  ],
  'font-explorer': [
    giveFile('input[type=file]', `fetch('fonts/bricolage.woff2').then(r => r.blob()).then(b => new File([b], 'bricolage.woff2', { type: 'font/woff2' }))`),
    until(`document.querySelector('.ty-font-meta')`, 10000),
    `(document.querySelector('.ty-font-meta').textContent.includes('Bricolage Grotesque') && document.querySelector('.ty-font-meta').textContent.includes('WOFF2') ? '' : 'font meta: ' + document.querySelector('.ty-font-meta')?.textContent.slice(0, 160))`,
    `(document.querySelector('input[data-axis="wght"]') && +document.querySelector('input[data-axis="wght"]').max === 800 ? '' : 'wght axis missing')`,
    `(document.querySelectorAll('.ty-font-glyph').length > 100 && document.querySelector('.ty-font-glyph path').getAttribute('d') !== null ? '' : 'glyph grid ' + document.querySelectorAll('.ty-font-glyph').length)`,
    `(() => { const s = document.querySelector('input[data-axis="wght"]'); s.value = 300; s.dispatchEvent(new Event('input')); return document.querySelector('.ty-font-tester').style.fontVariationSettings.includes('300') ? '' : 'axis slider does not drive the tester'; })()`,
    giveFile('input[type=file]', `new File(['not a font at all'], 'x.ttf')`), wait(300),
    `(document.querySelector('.note.error')?.textContent.includes('does not look like a font') ? '' : 'bad font not refused')`,
  ],
  scratchpad: [
    set('textarea', 'pear\napple\nPear\napple\nbanana\n10\n9'),
    click('Remove duplicates'),
    `(${val('textarea')} === 'pear\\napple\\nPear\\nbanana\\n10\\n9' ? '' : 'dedupe: ' + JSON.stringify(${val('textarea')}))`,
    click('Natural sort'),
    `(${val('textarea')} === '9\\n10\\napple\\nbanana\\npear\\nPear' ? '' : 'natural: ' + JSON.stringify(${val('textarea')}))`,
    click('Sort A–Z'),
    `(${val('textarea')} === '10\\n9\\napple\\nbanana\\nPear\\npear' ? '' : 'az: ' + JSON.stringify(${val('textarea')}))`,
    click('Undo'),
    `(${val('textarea')} === '9\\n10\\napple\\nbanana\\npear\\nPear' ? '' : 'undo: ' + JSON.stringify(${val('textarea')}))`,
    set('textarea', 'Café  “déjà vu”  ' + '\n\n' + 'naïve'),
    click('Remove accents'), click('Straight quotes'), click('Trim spaces'), click('Remove empty lines'),
    `(${val('textarea')} === 'Cafe  "deja vu"\\nnaive' ? '' : 'accents/quotes/trim: ' + JSON.stringify(${val('textarea')}))`,
    set('textarea', 'id-12 and id-345'), setField('Find', 'id-(\\d+)'), setField('Replace with', '#$1'),
    `document.querySelector('.tool-body .checks input').click()`, click('Replace all'),
    `(${val('textarea')} === '#12 and #345' ? '' : 'regex replace: ' + ${val('textarea')})`,
    `(document.querySelector('.ty-counts').textContent.startsWith('3 words') ? '' : 'counts: ' + document.querySelector('.ty-counts').textContent)`,
  ],
  'doc-convert': [
    until(`document.querySelectorAll('.output textarea')[0].value.includes('<h1>')`),
    `(() => { const o = ${outVal('Result')}; return o.includes('<h1>Sample notes</h1>') && o.includes('<strong>bold</strong>') && o.includes('<table>') ? '' : 'md→html: ' + o.slice(0, 120); })()`,
    // Round trip: feed the HTML back in and ask for Markdown.
    `(async () => { const html = ${outVal('Result')}; const [from, to] = document.querySelectorAll('.tool-body select'); const src = document.querySelector('.tool-body textarea'); from.value = 'html'; to.value = 'md'; src.value = html; from.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 900)); })()`,
    `(() => { const md = ${outVal('Result')}; const want = ${JSON.stringify(`# Sample notes

Some **bold** and *italic* text with a [link](https://example.com).

- First item
- Second item

1. One
2. Two

> A quote.

| Name | Qty |
| --- | --- |
| Tea | 2 |`)}; return md === want ? '' : 'round trip differs: ' + JSON.stringify(md); })()`,
    // Markdown → DOCX, then read the .docx back with mammoth.
    `(async () => { const [from, to] = document.querySelectorAll('.tool-body select'); from.value = 'md'; to.value = 'docx'; document.querySelector('.tool-body textarea').value = '# Title\\n\\nSome **strong** words.\\n\\n- a\\n- b'; to.dispatchEvent(new Event('change')); })()`,
    until(`document.querySelector('.ty-docx-out .big-say')`, 10000),
    `(document.querySelector('.ty-docx-out .big-say').textContent.includes('.docx is ready') ? '' : 'docx not offered')`,
    `(async () => { const D = await import('/js/lib/type-docs.js'); const r = await D.htmlToDocx('<h1>Title</h1><p>Some <strong>strong</strong> words.</p><ul><li>a</li><li>b</li></ul>'); const back = await D.docxToHtml(await r.blob.arrayBuffer()); return back.html.includes('<h1>Title</h1>') && back.html.includes('<strong>strong</strong>') && back.html.includes('<li>a</li>') ? '' : 'docx round trip: ' + back.html; })()`,
  ],
};
