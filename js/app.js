import { h } from './ui.js';
import { icon } from './icons.js';
import cryptoTools from './tools/crypto.js';
import convert from './tools/convert.js';
import dev from './tools/dev.js';
import everyday from './tools/everyday.js';

export const GROUPS = [
  { id: 'crypto', name: 'Crypto & IDs', blurb: 'Secrets, hashes, IDs and tokens', tools: cryptoTools },
  { id: 'convert', name: 'Converters', blurb: 'Same data, another shape', tools: convert },
  { id: 'dev', name: 'Web & dev', blurb: 'For the code you write every day', tools: dev },
  { id: 'everyday', name: 'Everyday', blurb: 'Text, QR codes and mock-up helpers', tools: everyday },
];
export const TOOLS = GROUPS.flatMap(g => g.tools);
const byId = Object.fromEntries(TOOLS.map(t => [t.id, t]));

// --- per-viewer preferences (best effort: storage can be blocked) -------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('toolbox.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('toolbox.' + k, JSON.stringify(v)); } catch {} },
};
let favs = store.get('favs', []);
let recent = store.get('recent', []);
const isFav = id => favs.includes(id);
function toggleFav(id) {
  favs = isFav(id) ? favs.filter(f => f !== id) : [...favs, id];
  store.set('favs', favs);
  renderNav();
}

// --- theme --------------------------------------------------------------
const themeBtn = document.getElementById('theme');
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon'));
  themeBtn.setAttribute('aria-label', dark ? 'Switch to light' : 'Switch to dark');
  document.querySelector('meta[name=theme-color]').content = dark ? '#16120f' : '#f3ece1';
}
themeBtn.onclick = () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  store.set('theme', next);
  applyTheme(next);
};
applyTheme(store.get('theme', null));

// --- search -------------------------------------------------------------
const search = document.getElementById('search');
function matches(t, q) {
  if (!q) return true;
  const hay = `${t.name} ${t.desc} ${t.keywords} ${t.id}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}
search.addEventListener('input', () => {
  if (location.hash.startsWith('#/tool/')) location.hash = '#/';
  else renderHome();
});
search.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const first = TOOLS.find(t => matches(t, search.value.trim()));
    if (first) { location.hash = `#/tool/${first.id}`; search.blur(); }
  }
  if (e.key === 'Escape') { search.value = ''; search.blur(); renderHome(); }
});
addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    search.focus();
    search.select();
  }
});

// --- views ----------------------------------------------------------------
const main = document.getElementById('main');
const nav = document.getElementById('nav');

function toolCard(t) {
  return h('a', { class: 'tool-card', href: `#/tool/${t.id}`, 'data-group': t.group },
    h('span', { class: 'hook', 'aria-hidden': 'true' }),
    h('span', { class: 'tool-icon' }, icon(t.icon, 26)),
    h('span', { class: 'tool-text' }, h('strong', {}, t.name), h('span', {}, t.desc)),
    isFav(t.id) && h('span', { class: 'fav-dot', title: 'Favourite' }, '★'));
}

function renderHome() {
  const q = search.value.trim();
  const shelves = [];
  if (!q) {
    const fav = favs.map(id => byId[id]).filter(Boolean);
    const rec = recent.map(id => byId[id]).filter(t => t && !favs.includes(t.id)).slice(0, 4);
    if (fav.length) shelves.push(shelf('Favourites', 'Tap the star on a tool to keep it here', fav, 'fav'));
    if (rec.length) shelves.push(shelf('Recently used', '', rec, 'recent'));
  }
  for (const g of GROUPS) {
    const list = g.tools.filter(t => matches(t, q));
    if (list.length) shelves.push(shelf(g.name, g.blurb, list, g.id));
  }
  main.replaceChildren(
    !q && h('div', { class: 'hero' },
      h('h1', {}, 'The Toolbox'),
      h('p', {}, `${TOOLS.length} small tools for everyday code work. Everything runs on this device — nothing you type is sent anywhere, and it works offline.`)),
    q && h('p', { class: 'search-sum' }, `${shelves.reduce((n, s) => n + s.querySelectorAll('.tool-card').length, 0)} tools match “${q}”`),
    ...shelves,
    !shelves.length && h('div', { class: 'empty' }, h('p', {}, `No tool for “${q}” yet.`)));
  document.title = 'The Toolbox';
}

function shelf(title, blurb, tools, key) {
  return h('section', { class: 'shelf', 'data-group': key },
    h('header', {}, h('h2', {}, title), blurb && h('p', {}, blurb)),
    h('div', { class: 'board' }, tools.map(toolCard)));
}

let cleanup = null;
function renderTool(t) {
  recent = [t.id, ...recent.filter(r => r !== t.id)].slice(0, 8);
  store.set('recent', recent);
  const star = h('button', {
    class: 'star' + (isFav(t.id) ? ' on' : ''), type: 'button',
    'aria-pressed': String(isFav(t.id)), 'aria-label': 'Favourite',
    onclick: () => {
      toggleFav(t.id);
      star.classList.toggle('on', isFav(t.id));
      star.setAttribute('aria-pressed', String(isFav(t.id)));
      star.firstChild.replaceWith(icon('star', 22));
    },
  }, icon('star', 22));
  const body = h('div', { class: 'tool-body' });
  const group = GROUPS.find(g => g.id === t.group);
  main.replaceChildren(
    h('div', { class: 'tool-head', 'data-group': t.group },
      h('a', { class: 'back', href: '#/' }, '← All tools'),
      h('div', { class: 'title-row' },
        h('span', { class: 'tool-icon big' }, icon(t.icon, 32)),
        h('div', {}, h('span', { class: 'eyebrow' }, group.name), h('h1', {}, t.name)),
        star),
      h('p', { class: 'lede' }, t.desc)),
    body);
  cleanup = t.render(body) || null;
  document.title = `${t.name} · The Toolbox`;
}

function renderNav() {
  const here = location.hash.replace('#/tool/', '');
  nav.replaceChildren(...GROUPS.map(g =>
    h('div', { class: 'nav-group' },
      h('span', { class: 'nav-title' }, g.name),
      g.tools.map(t => h('a', { href: `#/tool/${t.id}`, class: t.id === here ? 'on' : '', 'data-group': g.id },
        icon(t.icon, 18), h('span', {}, t.name), isFav(t.id) && h('span', { class: 'fav-dot' }, '★'))))));
}

function route() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  const m = location.hash.match(/^#\/tool\/([\w-]+)/);
  const t = m && byId[m[1]];
  if (t) { search.value = ''; renderTool(t); } else renderHome();
  renderNav();
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();

document.querySelector('.brand').prepend(icon('toolbox', 26));
document.getElementById('search-icon').replaceChildren(icon('search', 18));

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
