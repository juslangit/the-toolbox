// Web & dev extras: meta tag generator, request builder, Tailwind v4 cheat sheet.
import { h, field, input, textarea, select, output, note, row, card, tabs, on, copyBtn, dropzone, toast } from '../ui.js';
import { sendBtn, textOf } from '../hub.js';
import { emptyRequest, parseCurl, GENERATORS } from '../lib/codes-request.js';
import { GROUPS as TW, resolve as twResolve, remOf } from '../lib/codes-tailwind.js';

const textSend = get => sendBtn(() => { const t = get(); return t ? { text: t } : null; });
const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const host = u => { try { return new URL(u).host; } catch { return ''; } };
const cut = (s, n) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;

// --- meta tags ------------------------------------------------------------------------
const meta = {
  id: 'meta-tags', name: 'Meta tag generator', group: 'dev', icon: 'tag',
  desc: 'The <head> tags for search and social sharing, with previews for Google, X, Facebook and WhatsApp.',
  keywords: 'meta tags open graph og twitter card x seo head social share preview favicon theme colour whatsapp facebook',
  render(root) {
    const f = {
      title: input({ value: 'Homestay Kasih Alza — family rooms in Kuala Terengganu' }),
      desc: textarea({ rows: 3, mono: false, value: 'Clean family rooms ten minutes from the beach, with breakfast, free parking and WiFi. Book direct for the best price.' }),
      url: input({ mono: true, value: 'https://example.com/' }),
      image: input({ mono: true, value: 'https://example.com/og.jpg', placeholder: 'https://… (1200 × 630)' }),
      alt: input({ value: 'The front of the homestay at sunset' }),
      site: input({ value: 'Kasih Alza' }),
      card: select([['summary_large_image', 'Large image'], ['summary', 'Small square image']], 'summary_large_image'),
      handle: input({ mono: true, placeholder: '@yourhandle' }),
      type: select([['website', 'website'], ['article', 'article'], ['product', 'product'], ['profile', 'profile']], 'website'),
      locale: input({ mono: true, value: 'en_GB' }),
      theme: h('input', { type: 'color', class: 'swatch-input', value: '#e8a33d' }),
      icon: input({ mono: true, value: '/favicon.ico' }),
      apple: input({ mono: true, value: '/apple-touch-icon.png' }),
    };
    const snippet = output('Paste into <head>', { multiline: true, rows: 14 });
    const warns = h('ul', { class: 'tips' });
    const previews = h('div', { class: 'meta-previews' });
    let localImg = null;
    const pick = dropzone({ accept: 'image/*', label: 'Preview with a local picture (optional)', onfiles: ([file]) => { if (localImg) URL.revokeObjectURL(localImg); localImg = URL.createObjectURL(file); run(); } });

    function run() {
      const v = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
      const L = [];
      L.push('<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">');
      if (v.title) L.push(`<title>${attr(v.title)}</title>`);
      if (v.desc) L.push(`<meta name="description" content="${attr(v.desc)}">`);
      if (v.url) L.push(`<link rel="canonical" href="${attr(v.url)}">`);
      if (v.theme) L.push(`<meta name="theme-color" content="${attr(v.theme)}">`);
      if (v.icon) L.push(`<link rel="icon" href="${attr(v.icon)}">`);
      if (v.apple) L.push(`<link rel="apple-touch-icon" href="${attr(v.apple)}">`);
      L.push('', '<!-- Open Graph (Facebook, WhatsApp, LinkedIn, Slack…) -->');
      L.push(`<meta property="og:type" content="${attr(v.type)}">`);
      if (v.title) L.push(`<meta property="og:title" content="${attr(v.title)}">`);
      if (v.desc) L.push(`<meta property="og:description" content="${attr(v.desc)}">`);
      if (v.url) L.push(`<meta property="og:url" content="${attr(v.url)}">`);
      if (v.site) L.push(`<meta property="og:site_name" content="${attr(v.site)}">`);
      if (v.locale) L.push(`<meta property="og:locale" content="${attr(v.locale)}">`);
      if (v.image) {
        L.push(`<meta property="og:image" content="${attr(v.image)}">`);
        if (v.card === 'summary_large_image') L.push('<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">');
        if (v.alt) L.push(`<meta property="og:image:alt" content="${attr(v.alt)}">`);
      }
      L.push('', '<!-- X / Twitter -->');
      L.push(`<meta name="twitter:card" content="${attr(v.card)}">`);
      if (v.handle) L.push(`<meta name="twitter:site" content="${attr(v.handle.startsWith('@') ? v.handle : '@' + v.handle)}">`);
      if (v.title) L.push(`<meta name="twitter:title" content="${attr(v.title)}">`);
      if (v.desc) L.push(`<meta name="twitter:description" content="${attr(v.desc)}">`);
      if (v.image) L.push(`<meta name="twitter:image" content="${attr(v.image)}">`);
      if (v.image && v.alt) L.push(`<meta name="twitter:image:alt" content="${attr(v.alt)}">`);
      snippet.set(L.join('\n'));

      // Warnings
      const w = [];
      if (!v.title) w.push(['bad', 'Add a title — it is the headline everywhere.']);
      else if (v.title.length > 60) w.push(['warn', `Title is ${v.title.length} characters; Google usually cuts it at about 60.`]);
      else if (v.title.length < 15) w.push(['warn', `Title is only ${v.title.length} characters — say a little more about the page.`]);
      if (!v.desc) w.push(['bad', 'Add a description — without one, search engines pick their own text.']);
      else if (v.desc.length > 160) w.push(['warn', `Description is ${v.desc.length} characters; Google usually shows about 155–160.`]);
      else if (v.desc.length < 50) w.push(['warn', `Description is only ${v.desc.length} characters — 70 to 155 works best.`]);
      if (v.url && !/^https?:\/\//i.test(v.url)) w.push(['bad', 'The page URL must be a full address starting with https://.']);
      if (!v.image) w.push(['warn', 'No image — shared links will show as plain text and get fewer clicks.']);
      else if (!/^https?:\/\//i.test(v.image)) w.push(['bad', 'og:image must be a full https:// address — Facebook, WhatsApp and X ignore relative paths.']);
      if (v.image && !v.alt) w.push(['warn', 'Add image alt text for people using screen readers.']);
      if (v.url.startsWith('http://')) w.push(['warn', 'Use https:// — some apps will not show previews for http pages.']);
      warns.replaceChildren(...(w.length ? w.map(([k, t]) => h('li', { class: k }, t)) : [h('li', { class: 'good' }, 'Looks good.')]));

      // Previews
      const domain = host(v.url) || 'example.com';
      const img = cls => localImg ? h('img', { class: cls, src: localImg, alt: '' })
        : h('div', { class: cls + ' meta-noimg' }, v.image ? (host(v.image) || 'image') : 'no image');
      const large = v.card === 'summary_large_image';
      const crumbs = (() => { try { const u = new URL(v.url); return [u.host, ...u.pathname.split('/').filter(Boolean)].join(' › '); } catch { return domain; } })();
      previews.replaceChildren(
        h('div', { class: 'meta-card google' }, h('span', { class: 'meta-label' }, 'Google'),
          h('div', { class: 'g-site' }, h('span', { class: 'g-fav' }, (v.site || domain)[0]?.toUpperCase() || '?'),
            h('div', {}, h('div', { class: 'g-name' }, v.site || domain), h('div', { class: 'g-url' }, crumbs))),
          h('div', { class: 'g-title' }, cut(v.title || 'Untitled page', 60)),
          h('div', { class: 'g-desc' }, cut(v.desc, 158))),
        h('div', { class: 'meta-card x' + (large ? '' : ' small') }, h('span', { class: 'meta-label' }, 'X / Twitter'),
          large
            ? h('div', { class: 'x-large' }, img('x-img'), h('span', { class: 'x-domain' }, domain))
            : h('div', { class: 'x-small' }, img('x-img'), h('div', {}, h('div', { class: 'x-dom' }, domain), h('div', { class: 'x-title' }, cut(v.title, 70)), h('div', { class: 'x-desc' }, cut(v.desc, 120)))),
          large && h('div', { class: 'x-from' }, 'From ' + domain)),
        h('div', { class: 'meta-card fb' }, h('span', { class: 'meta-label' }, 'Facebook'),
          img('fb-img'),
          h('div', { class: 'fb-body' }, h('div', { class: 'fb-dom' }, domain.toUpperCase()), h('div', { class: 'fb-title' }, cut(v.title, 88)), h('div', { class: 'fb-desc' }, cut(v.desc, 110)))),
        h('div', { class: 'meta-card wa' }, h('span', { class: 'meta-label' }, 'WhatsApp'),
          h('div', { class: 'wa-bubble' },
            h('div', { class: 'wa-link' }, img('wa-img'), h('div', {}, h('div', { class: 'wa-title' }, cut(v.title, 70)), h('div', { class: 'wa-desc' }, cut(v.desc, 90)), h('div', { class: 'wa-dom' }, domain))),
            h('div', { class: 'wa-url' }, v.url))),
      );
    }
    const len = (el, max) => {
      const c = h('span', { class: 'codes-val' });
      const u = () => { const n = el.value.length; c.textContent = `${n} / ${max}`; c.classList.toggle('over', n > max); };
      el.addEventListener('input', u); u();
      return c;
    };
    const lfield = (label, el, max, hint) => h('label', { class: 'field' },
      h('span', { class: 'field-head' }, h('span', { class: 'field-label' }, label), len(el, max)), el, hint && h('span', { class: 'field-hint' }, hint));
    root.append(
      card(lfield('Title', f.title, 60), lfield('Description', f.desc, 160),
        row(field('Page URL', f.url), field('Site name', f.site)),
        row(field('Share image URL', f.image, '1200 × 630 px, under 5 MB, full https:// address.'), field('Image alt text', f.alt)),
        row(field('X card', f.card), field('X handle', f.handle), field('Type', f.type), field('Locale', f.locale)),
        row(h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Theme colour'), f.theme), field('Favicon', f.icon), field('Apple touch icon', f.apple, '180 × 180 PNG'))),
      card(h('h3', {}, 'Checks'), warns),
      card(h('h3', {}, 'Previews'), pick, previews,
        h('p', { class: 'field-hint' }, 'Previews are close approximations — each site changes its layout now and then. The image URL is never fetched (nothing leaves this device); pick the picture above to see it in place.')),
      card(snippet.el, row(textSend(() => snippet.get()))),
    );
    on(Object.values(f), run);
    f.card.addEventListener('change', run); f.type.addEventListener('change', run);
    return () => { if (localImg) URL.revokeObjectURL(localImg); };
  },
};

// --- request builder ------------------------------------------------------------------------
function kvTable(title, rows, onchange, { keyPh = 'name', valPh = 'value' } = {}) {
  const body = h('div', { class: 'kv-rows' });
  const draw = () => {
    body.replaceChildren(...rows.map((r, i) => {
      const k = input({ mono: true, value: r[0], placeholder: keyPh });
      const v = input({ mono: true, value: r[1], placeholder: valPh });
      k.classList.add('kv-in'); v.classList.add('kv-in');
      k.addEventListener('input', () => { r[0] = k.value; onchange(); });
      v.addEventListener('input', () => { r[1] = v.value; onchange(); });
      return h('div', { class: 'kv-row' }, k, v,
        h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Remove', onclick: () => { rows.splice(i, 1); draw(); onchange(); } }, '✕'));
    }));
  };
  const el = h('div', { class: 'kv-table' }, h('div', { class: 'field-label' }, title), body,
    h('button', { class: 'btn small', type: 'button', onclick: () => { rows.push(['', '']); draw(); body.lastChild?.querySelector('input')?.focus(); } }, '+ Add'));
  draw();
  return { el, draw, setRows(nr) { rows.splice(0, rows.length, ...nr); draw(); } };
}

const request = {
  id: 'request', name: 'Request builder', group: 'dev', icon: 'send',
  desc: 'Build an HTTP request and get it as cURL, fetch(), HTTPie, Python or PHP — or paste a curl command to edit it.',
  keywords: 'http request builder curl convert fetch httpie python requests php api postman headers json body bearer basic auth parse curl',
  accepts: ['text'],
  render(root, incoming) {
    const req = emptyRequest();
    Object.assign(req, {
      method: 'POST', url: 'https://api.example.com/bookings',
      params: [['lang', 'en']], headers: [['Accept', 'application/json']],
      bodyType: 'json', body: '{\n  "guest": "Aminah",\n  "nights": 2\n}',
      auth: { type: 'bearer', token: 'YOUR_TOKEN', user: '', pass: '' },
    });
    const method = select(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], req.method);
    const url = input({ mono: true, value: req.url, placeholder: 'https://…' });
    url.classList.add('req-url');
    const lang = tabs(GENERATORS.map(([id, label]) => [id, label]), 'curl', () => gen());
    const code = output('Code', { multiline: true, rows: 12 });
    const params = kvTable('Query parameters', req.params, () => gen());
    const headers = kvTable('Headers', req.headers, () => gen(), { keyPh: 'Header', valPh: 'value' });
    const form = kvTable('Form fields', req.form, () => gen());
    const bodyType = select([['none', 'No body'], ['json', 'JSON'], ['form', 'Form (urlencoded)'], ['multipart', 'Multipart form'], ['raw', 'Raw text']], req.bodyType);
    const body = textarea({ rows: 6, value: req.body });
    const authType = select([['none', 'None'], ['bearer', 'Bearer token'], ['basic', 'Basic (user + password)']], req.auth.type);
    const token = input({ mono: true, value: req.auth.token, placeholder: 'token' });
    const user = input({ mono: true, placeholder: 'user' });
    const pass = input({ mono: true, placeholder: 'password' });
    const bodyNote = note();
    const tokenF = field('Token', token), userF = field('User', user), passF = field('Password', pass);
    const bodyF = field('Body', body);

    function gen() {
      req.method = method.value;
      // A pasted URL with ?query moves into the table.
      const q = url.value.indexOf('?');
      if (q > 0 && document.activeElement !== url) {
        const extra = new URLSearchParams(url.value.slice(q + 1));
        url.value = url.value.slice(0, q);
        for (const [k, v] of extra) req.params.push([k, v]);
        params.draw();
      }
      req.url = url.value.trim();
      req.bodyType = bodyType.value;
      req.body = body.value;
      req.auth = { type: authType.value, token: token.value, user: user.value, pass: pass.value };
      bodyF.hidden = !['json', 'raw'].includes(req.bodyType);
      form.el.hidden = !['form', 'multipart'].includes(req.bodyType);
      tokenF.hidden = req.auth.type !== 'bearer';
      userF.hidden = passF.hidden = req.auth.type !== 'basic';
      bodyNote.clear();
      if (req.bodyType === 'json' && req.body.trim()) { try { JSON.parse(req.body); } catch (e) { bodyNote.error('Not valid JSON: ' + e.message); } }
      if (['GET', 'HEAD'].includes(req.method) && req.bodyType !== 'none') bodyNote.info(`${req.method} requests normally have no body — many servers ignore it.`);
      const g = GENERATORS.find(x => x[0] === lang.value);
      code.set(req.url ? g[2](req) : '');
    }
    url.addEventListener('blur', gen);

    // Paste a curl command
    const curlIn = textarea({ rows: 4, placeholder: "curl -X POST 'https://…' -H 'Content-Type: application/json' -d '{…}'" });
    const curlNote = note();
    const notes = h('ul', { class: 'tips' });
    function load(src) {
      notes.replaceChildren();
      try {
        const { req: r, notes: ns } = parseCurl(src);
        method.value = r.method; url.value = r.url;
        params.setRows(r.params); headers.setRows(r.headers); form.setRows(r.form);
        bodyType.value = r.bodyType;
        let b = r.body;
        if (r.bodyType === 'json') { try { b = JSON.stringify(JSON.parse(b), null, 2); } catch {} }
        body.value = b;
        authType.value = r.auth.type; token.value = r.auth.token; user.value = r.auth.user; pass.value = r.auth.pass;
        curlNote.info(`Loaded: ${r.method} ${r.url}`);
        notes.append(...ns.map(n => h('li', {}, n)));
        gen();
      } catch (e) { curlNote.error(e.message); }
    }
    const loadB = h('button', { class: 'btn primary', type: 'button', onclick: () => load(curlIn.value) }, 'Load into the form');

    root.append(
      card(h('h3', {}, 'Paste a curl command'), field('curl', curlIn), row(loadB), curlNote.el, notes),
      card(h('div', { class: 'req-line' }, method, url), params.el, headers.el),
      card(row(field('Body', bodyType), field('Auth', authType)), row(tokenF, userF, passF), bodyF, form.el, bodyNote.el),
      card(lang, code.el, row(textSend(() => code.get())),
        h('p', { class: 'field-hint' }, 'This tool does not send the request. Everything stays on this device — and browsers block most requests to other sites anyway (CORS). Copy the code and run it in a terminal or your app.')),
    );
    on([method, url, bodyType, body, authType, token, user, pass], gen);
    for (const s of [method, bodyType, authType]) s.addEventListener('change', gen);
    textOf(incoming).then(t => { if (t != null && /^\s*curl\b/i.test(t)) { curlIn.value = t; load(t); } });
  },
};

// --- Tailwind cheat sheet ------------------------------------------------------------------------
const tailwind = {
  id: 'tailwind', name: 'Tailwind cheat sheet', group: 'dev', icon: 'wind',
  desc: 'Tailwind CSS v4 classes and the CSS they make — search, or type a class like p-4.',
  keywords: 'tailwind css v4 utility classes cheat sheet reference spacing flex grid typography colours tw',
  render(root) {
    const q = input({ placeholder: 'Search, or type a class: p-4, w-1/2, bg-sky-500/50', mono: true });
    const groupSel = tabs([['all', 'All'], ...TW.map(([g]) => [g, g])], 'all', () => draw());
    const hit = h('div', { class: 'tw-hit' });
    const list = h('div', { class: 'tw-list' });
    const count = h('p', { class: 'field-hint' });
    const line = (c, css, hint) => h('div', { class: 'tw-row' },
      h('button', { class: 'tw-class', type: 'button', title: 'Copy class', onclick: () => navigator.clipboard?.writeText(c).then(() => toast('Copied ' + c), () => {}) }, c),
      h('code', { class: 'tw-css' }, css),
      hint && h('span', { class: 'tw-hint' }, hint),
      copyBtn(() => css, 'Copy CSS'));
    function draw() {
      const s = q.value.trim().toLowerCase();
      const r = s ? twResolve(q.value.trim()) : null;
      hit.replaceChildren();
      if (r && /\d/.test(s)) hit.append(h('div', { class: 'tw-resolved' }, h('span', { class: 'meta-label' }, r.g || 'Match'), line(r.c, r.css, r.hint)));
      const words = s.split(/\s+/).filter(Boolean);
      let n = 0;
      const groups = TW.filter(([g]) => groupSel.value === 'all' || groupSel.value === g).map(([g, items]) => {
        const shown = items.filter(e => !words.length || words.every(w => (e.c + ' ' + e.css + ' ' + g).toLowerCase().includes(w)));
        n += shown.length;
        return shown.length ? h('section', { class: 'tw-group' }, h('h3', {}, g), shown.map(e => line(e.c, e.css,
          /<n>/.test(e.c) && e.css.includes('--spacing') ? 'n × 0.25rem — e.g. 4 = 1rem' : ''))) : null;
      }).filter(Boolean);
      count.textContent = `${n} entr${n === 1 ? 'y' : 'ies'}`;
      list.replaceChildren(...groups, ...(n || hit.childNodes.length ? [] : [h('p', { class: 'empty' }, 'Nothing matches. Try a property name like “padding” or “grid”.')]));
    }
    root.append(
      card(field('Find', q), groupSel, hit, count,
        h('p', { class: 'field-hint' }, `Tailwind v4: sizes come from --spacing: 0.25rem, so p-4 = calc(var(--spacing) * 4) = ${remOf(4)}. Colours are --color-* variables (in oklch). <n> stands for any number; <colour> for red, sky, slate…; <shade> for 50–950. Lines marked “simplified” shorten the real output.`)),
      list,
    );
    on(q, draw, 'input', 120);
  },
};

export default [meta, request, tailwind];
