// Checks for the Web & dev extras (meta tags, request builder, Tailwind).
import { set, val } from '../helpers.mjs';

const CURL = `curl -X PUT 'https://api.example.com/items/7?lang=ms' -H 'Content-Type: application/json' -H "Authorization: Bearer t0k3n" -H 'X-Trace: 42' --data-raw '{"name":"Kopi O","qty":2}'`;

export default {
  'meta-tags': [
    `(${val('.output textarea')}.includes('<meta property="og:title" content="Homestay Kasih Alza') && ${val('.output textarea')}.includes('<meta name="twitter:card" content="summary_large_image">') ? '' : 'og:title missing')`,
    set('input.input', 'A & B "quoted" <tag>', 0),
    `(${val('.output textarea')}.includes('<title>A &amp; B &quot;quoted&quot; &lt;tag&gt;</title>') ? '' : 'title not escaped')`,
    set('input.input', 'x'.repeat(70), 0),
    `(document.querySelector('.tips').textContent.includes('70 characters') && document.querySelector('.g-title').textContent.length === 60 ? '' : 'long title not warned/cut')`,
  ],
  request: [
    `(${val('.output textarea')}.startsWith("curl -X POST 'https://api.example.com/bookings?lang=en'") ? '' : 'default curl: ' + ${val('.output textarea')}.slice(0, 60))`,
    set('textarea', CURL, 0),
    `[...document.querySelectorAll('.btn.primary')].find(b => b.textContent.includes('Load')).click()`,
    'new Promise(r => setTimeout(r, 200))',
    `(() => { const s = document.querySelectorAll('select'); const ins = [...document.querySelectorAll('.kv-in')].map(i => i.value);
      if (s[0].value !== 'PUT') return 'method ' + s[0].value;
      if (s[1].value !== 'json' || s[2].value !== 'bearer') return 'body/auth ' + s[1].value + ' ' + s[2].value;
      if (ins.join('|') !== 'lang|ms|X-Trace|42') return 'tables ' + ins.join('|');
      const c = ${val('.output textarea')};
      return c.includes("-H 'Authorization: Bearer t0k3n'") && c.includes('"name": "Kopi O"') && c.includes("https://api.example.com/items/7?lang=ms") ? '' : 'curl out: ' + c; })()`,
    `document.querySelector('.tabs button[data-v=python]').click()`,
    `(${val('.output textarea')}.includes('requests.put(url, params=params, headers=headers, json=payload)') && ${val('.output textarea')}.includes('"qty": 2,') ? '' : 'python: ' + ${val('.output textarea')})`,
    set('textarea', 'curl https://x.test -u ali:rahsia -d a=1 -d b=2', 0),
    `[...document.querySelectorAll('.btn.primary')].find(b => b.textContent.includes('Load')).click()`,
    `(() => { const s = document.querySelectorAll('select'); return s[0].value === 'POST' && s[1].value === 'form' && s[2].value === 'basic' && ${val('.output textarea')}.includes('auth=("ali", "rahsia")') ? '' : 'form+basic: ' + s[0].value + s[1].value + s[2].value; })()`,
  ],
  tailwind: [
    set('input.input', 'p-4', 0),
    `(document.querySelector('.tw-resolved .tw-css')?.textContent === 'padding: calc(var(--spacing) * 4);' && document.querySelector('.tw-resolved').textContent.includes('1rem') ? '' : 'p-4: ' + document.querySelector('.tw-resolved')?.textContent)`,
    set('input.input', 'bg-sky-500/50', 0),
    `(document.querySelector('.tw-resolved .tw-css')?.textContent.includes('color-mix(in oklab, var(--color-sky-500) 50%, transparent)') ? '' : 'colour opacity')`,
    set('input.input', 'grid-template-columns', 0),
    `(document.querySelectorAll('.tw-row').length >= 3 && document.querySelector('.tw-list').textContent.includes('grid-cols-<n>') ? '' : 'search rows ' + document.querySelectorAll('.tw-row').length)`,
  ],
};
