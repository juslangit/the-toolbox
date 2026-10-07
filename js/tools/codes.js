// Codes & ciphers drawer: Morse, spelling alphabets, Braille, classical ciphers, barcodes.
import { h, field, input, textarea, select, checkbox, output, note, row, card, tabs, on, copyBtn, download, downloadBtn, toast } from '../ui.js';
import { sendBtn, sendTo, textOf, asFile } from '../hub.js';
import { toMorse, fromMorse, morseTiming, morseSchedule, MORSE, ALPHABETS, spell, unspell, toBraille, fromBraille, dotsOf, SIGN } from '../lib/codes-text.js';
import * as C from '../lib/codes-cipher.js';
import { TYPES, checkValue, friendlyError } from '../lib/codes-barcode.js';

const AC = globalThis.AudioContext || globalThis.webkitAudioContext;

function slider(label, { min, max, step = 1, value, unit = '' }) {
  const inp = h('input', { type: 'range', min, max, step, value });
  const shown = h('span', { class: 'codes-val' });
  const upd = () => { shown.textContent = inp.value + unit; };
  inp.addEventListener('input', upd);
  upd();
  const el = h('label', { class: 'field' }, h('span', { class: 'field-head' }, h('span', { class: 'field-label' }, label), shown), inp);
  return { el, input: inp, get value() { return Number(inp.value); }, set value(v) { inp.value = v; upd(); } };
}

const textSend = get => sendBtn(() => { const t = get(); return t ? { text: t } : null; });

// --- Morse -------------------------------------------------------------------------
const morse = {
  id: 'morse', name: 'Morse code', group: 'codes', icon: 'radio-tower',
  desc: 'Text ⇄ Morse both ways, play it as sound or light, or tap it in yourself.',
  keywords: 'morse code cw sos dot dash telegraph ham radio farnsworth tap key decode',
  accepts: ['text'],
  render(root, incoming) {
    const text = textarea({ rows: 3, mono: false, placeholder: 'Type text…', value: 'SOS' });
    const code = textarea({ rows: 3, placeholder: '... --- ...' });
    const info = note();
    let lock = false;
    const fromText = () => {
      if (lock) return; lock = true;
      const r = toMorse(text.value);
      code.value = r.morse;
      r.skipped.length ? info.info(`No Morse for: ${r.skipped.join(' ')} — left out.`) : info.clear();
      lock = false;
    };
    const fromCode = () => {
      if (lock) return; lock = true;
      const r = fromMorse(code.value);
      text.value = r.text;
      r.unknown.length ? info.error(`Not a Morse letter: ${r.unknown.slice(0, 6).join('  ')} (shown as �)`) : info.clear();
      lock = false;
    };
    text.addEventListener('input', fromText);
    code.addEventListener('input', fromCode);

    // Playback
    const wpm = slider('Letter speed', { min: 5, max: 40, value: 20, unit: ' WPM' });
    const eff = slider('Overall speed (Farnsworth)', { min: 5, max: 40, value: 20, unit: ' WPM' });
    const tone = slider('Tone', { min: 300, max: 1000, step: 10, value: 600, unit: ' Hz' });
    const vol = slider('Volume', { min: 0, max: 100, value: 50, unit: '%' });
    const sound = checkbox('Sound', !!AC);
    const flash = checkbox('Flash', true);
    if (!AC) { sound.input.disabled = true; }
    eff.input.addEventListener('input', () => { if (eff.value > wpm.value) wpm.value = eff.value; });
    wpm.input.addEventListener('input', () => { if (eff.value > wpm.value) eff.value = wpm.value; });
    const lamp = h('div', { class: 'morse-lamp', 'aria-hidden': 'true' });
    const nowLetter = h('div', { class: 'morse-now' });
    const playB = h('button', { class: 'btn primary', type: 'button' }, 'Play');
    const stopB = h('button', { class: 'btn', type: 'button', disabled: true }, 'Stop');
    // A plain timer (not requestAnimationFrame) so the light keeps time even in a background tab.
    let ac = null, osc = null, raf = 0, keyOsc = null, keyGain = null;
    const audio = () => { if (!AC) return null; ac ??= new AC(); if (ac.state === 'suspended') ac.resume(); return ac; };

    function stop() {
      clearTimeout(raf); raf = 0;
      try { osc?.stop(); } catch {}
      osc = null;
      lamp.classList.remove('on');
      nowLetter.textContent = '';
      playB.disabled = false; stopB.disabled = true;
    }
    function play() {
      stop();
      const m = code.value.trim() ? code.value : toMorse(text.value).morse;
      const norm = fromMorse(m).text ? toMorse(fromMorse(m).text).morse : '';
      if (!norm) { info.error('Nothing to play yet.'); return; }
      const letters = norm.split(/\s*\/\s*/).flatMap(w => w.split(/\s+/));
      const timing = morseTiming(wpm.value, eff.value);
      const { spans, total } = morseSchedule(norm, timing);
      let now;
      const a = sound.input.checked ? audio() : null;
      if (a) {
        osc = a.createOscillator();
        const g = a.createGain();
        osc.frequency.value = tone.value;
        g.gain.value = 0;
        osc.connect(g).connect(a.destination);
        const t0 = a.currentTime + 0.12, v = vol.value / 100 * 0.6, r = 0.005;
        for (const s of spans) {
          g.gain.setValueAtTime(0, t0 + s.at);
          g.gain.linearRampToValueAtTime(v, t0 + s.at + r);
          g.gain.setValueAtTime(v, t0 + s.at + s.dur - r);
          g.gain.linearRampToValueAtTime(0, t0 + s.at + s.dur);
        }
        osc.start(t0); osc.stop(t0 + total + 0.1);
        now = () => a.currentTime - t0;
      } else {
        const p0 = performance.now() + 120;
        now = () => (performance.now() - p0) / 1000;
      }
      playB.disabled = true; stopB.disabled = false;
      let k = 0;
      const tick = () => {
        const t = now();
        while (k < spans.length && t >= spans[k].at + spans[k].dur) k++;
        const s = spans[k];
        const lit = !!s && t >= s.at;
        lamp.classList.toggle('on', flash.input.checked && lit);
        const li = s ? s.i : letters.length - 1;
        if (t >= 0) nowLetter.textContent = `${fromMorse(letters[li] || '').text}  ${letters[li] || ''}`;
        if (t > total + 0.05) { stop(); return; }
        raf = setTimeout(tick, 15);
      };
      raf = setTimeout(tick, 0);
    }
    playB.onclick = play;
    stopB.onclick = stop;

    // Tap key
    const tapSpeed = slider('Your tapping speed', { min: 5, max: 30, value: 12, unit: ' WPM' });
    const key = h('button', { class: 'morse-key', type: 'button' }, h('strong', {}, 'Tap here'), h('span', {}, 'short = dot, long = dash · or hold Space'));
    const tapMorse = h('div', { class: 'morse-tapped mono' });
    const tapText = h('div', { class: 'big-say morse-taptext' });
    let tapped = '', cur = '', downAt = 0, down = false, gapTimer = 0;
    const showTap = () => {
      const m = (tapped + cur).trim();
      tapMorse.textContent = m || ' ';
      tapText.textContent = fromMorse(m).text;
    };
    const unitMs = () => 1200 / tapSpeed.value;
    const keyDown = e => {
      e?.preventDefault?.();
      if (down) return;
      down = true; downAt = performance.now();
      clearTimeout(gapTimer);
      key.classList.add('on');
      lamp.classList.add('on');
      const a = sound.input.checked ? audio() : null;
      if (a) {
        keyOsc = a.createOscillator(); keyGain = a.createGain();
        keyOsc.frequency.value = tone.value;
        keyGain.gain.setValueAtTime(0, a.currentTime);
        keyGain.gain.linearRampToValueAtTime(vol.value / 100 * 0.6, a.currentTime + 0.005);
        keyOsc.connect(keyGain).connect(a.destination);
        keyOsc.start();
      }
    };
    const keyUp = e => {
      e?.preventDefault?.();
      if (!down) return;
      down = false;
      key.classList.remove('on');
      lamp.classList.remove('on');
      if (keyOsc && ac) {
        const t = ac.currentTime;
        keyGain.gain.cancelScheduledValues(t);
        keyGain.gain.setValueAtTime(keyGain.gain.value, t);
        keyGain.gain.linearRampToValueAtTime(0, t + 0.005);
        keyOsc.stop(t + 0.02);
        keyOsc = null;
      }
      const d = performance.now() - downAt;
      const u = unitMs();
      cur += d < 2 * u ? '.' : '-';
      showTap();
      gapTimer = setTimeout(() => {
        tapped += cur + ' '; cur = ''; showTap();
        gapTimer = setTimeout(() => { if (tapped && !/\/\s*$/.test(tapped)) { tapped = tapped.trimEnd() + ' / '; showTap(); } }, 4 * u);
      }, 3 * u);
    };
    key.addEventListener('pointerdown', e => { key.setPointerCapture?.(e.pointerId); keyDown(e); });
    key.addEventListener('pointerup', keyUp);
    key.addEventListener('pointercancel', keyUp);
    key.addEventListener('contextmenu', e => e.preventDefault());
    key.addEventListener('keydown', e => { if (e.code === 'Space' || e.key === ' ') { if (!e.repeat) keyDown(e); else e.preventDefault(); } });
    key.addEventListener('keyup', e => { if (e.code === 'Space' || e.key === ' ') keyUp(e); });
    key.addEventListener('click', e => e.preventDefault());
    const clearTap = h('button', { class: 'btn small', type: 'button', onclick: () => { clearTimeout(gapTimer); tapped = cur = ''; showTap(); } }, 'Clear');
    const useTap = h('button', { class: 'btn small', type: 'button', onclick: () => { const m = (tapped + cur).trim().replace(/\/$/, '').trim(); if (!m) return; code.value = m; fromCode(); } }, 'Put in the boxes above');
    showTap();

    root.append(
      card(field('Text', text), field('Morse', code, 'Letters are split by a space, words by “ / ”. Dots and dashes can be . - · – or _.'), info.el,
        row(copyBtn(() => code.value, 'Copy Morse'), textSend(() => text.value))),
      card(h('h3', {}, 'Play it'),
        h('div', { class: 'morse-play' }, lamp, nowLetter),
        row(playB, stopB, sound, flash),
        h('div', { class: 'grid2' }, wpm.el, eff.el, tone.el, vol.el),
        h('p', { class: 'field-hint' }, 'Farnsworth spacing sends each letter at full speed but leaves longer gaps between letters and words — the usual way to learn by ear. Set the overall speed lower than the letter speed to use it.'),
        !AC && h('p', { class: 'field-hint' }, 'This browser has no Web Audio, so only the light flashes.')),
      card(h('h3', {}, 'Tap it in'), key, tapMorse, tapText, tapSpeed.el, row(clearTap, useTap),
        h('p', { class: 'field-hint' }, 'A press shorter than two dot-lengths is a dot. A pause of three dot-lengths ends a letter, seven ends a word. Slow the speed down if your letters run together.')),
      card(h('h3', {}, 'Chart'), h('div', { class: 'morse-chart' }, Object.keys(MORSE).sort((x, y) => /[A-Z0-9]/.test(y) - /[A-Z0-9]/.test(x) || /\d/.test(x) - /\d/.test(y)).map(k => [k, MORSE[k]]).map(([k, v]) => h('div', {}, h('b', {}, k), h('span', { class: 'mono' }, v))))),
    );
    fromText();
    (async () => {
      const t = await textOf(incoming);
      if (t == null) return;
      if (/^[\s.\-/|·•−–_]+$/.test(t)) { code.value = t; fromCode(); } else { text.value = t; fromText(); }
    })();
    return () => { stop(); clearTimeout(gapTimer); try { keyOsc?.stop(); } catch {} ac?.close?.(); };
  },
};

// --- Spelling alphabets ------------------------------------------------------------------
const nato = {
  id: 'nato', name: 'NATO phonetic alphabet', group: 'codes', icon: 'mic',
  desc: 'Spell anything out as Alfa Bravo Charlie — or in German (DIN 5009) — and back.',
  keywords: 'nato phonetic alphabet icao spelling alfa bravo radio german din 5009 buchstabiertafel spell out read aloud',
  accepts: ['text'],
  render(root, incoming) {
    const which = select(Object.entries(ALPHABETS).map(([k, v]) => [k, v.name]), 'nato');
    const text = textarea({ rows: 3, mono: false, value: 'AB1', placeholder: 'Type text to spell out' });
    const spelled = textarea({ rows: 4, mono: false, placeholder: 'Alfa Bravo One' });
    const chartEl = h('div', { class: 'nato-chart' });
    let lock = false;
    const fwd = () => {
      if (lock) return; lock = true;
      spelled.value = spell(text.value, which.value).join(' ').replace(/ \/ /g, ' / ');
      lock = false;
    };
    const back = () => { if (lock) return; lock = true; text.value = unspell(spelled.value, which.value); lock = false; };
    const chart = () => chartEl.replaceChildren(...Object.entries(ALPHABETS[which.value].map).sort(([x], [y]) => /\d/.test(x) - /\d/.test(y)).map(([k, v]) => h('div', {}, h('b', {}, k), h('span', {}, v))));
    text.addEventListener('input', fwd);
    spelled.addEventListener('input', back);
    which.addEventListener('change', () => { fwd(); chart(); });

    const canSpeak = 'speechSynthesis' in globalThis;
    const r = slider('Speaking speed', { min: 0.5, max: 1.5, step: 0.1, value: 0.9, unit: '×' });
    const say = h('button', {
      class: 'btn primary', type: 'button', disabled: !canSpeak,
      onclick: () => {
        speechSynthesis.cancel();
        const lang = ALPHABETS[which.value].lang;
        const voice = speechSynthesis.getVoices().find(v => v.lang.replace('_', '-').startsWith(lang.slice(0, 2)));
        const u = new SpeechSynthesisUtterance(spelled.value.replace(/\s*\/\s*/g, ', … ').replace(/ /g, ', '));
        u.lang = lang; u.rate = r.value;
        if (voice) u.voice = voice;
        speechSynthesis.speak(u);
      },
    }, 'Read aloud');
    const hush = h('button', { class: 'btn', type: 'button', disabled: !canSpeak, onclick: () => speechSynthesis.cancel() }, 'Stop');

    root.append(
      card(field('Alphabet', which), field('Text', text), field('Spelled out', spelled, 'Type here to turn calls back into text. Unknown words come back in [brackets].'),
        row(copyBtn(() => spelled.value), textSend(() => spelled.value))),
      card(h('h3', {}, 'Read aloud'), row(say, hush), r.el,
        h('p', { class: 'field-hint' }, canSpeak ? 'Uses your device’s own voices — nothing is sent anywhere. German needs a German voice installed; otherwise your default voice reads it.' : 'This browser cannot speak text.')),
      card(h('h3', {}, 'The alphabet'), chartEl,
        h('p', { class: 'field-hint' }, 'There is no officially recognised Malay spelling alphabet — Malaysian police, aviation and radio users use NATO/ICAO, so it is not offered here.')),
    );
    chart(); fwd();
    textOf(incoming).then(t => { if (t != null) { text.value = t; fwd(); } });
    return () => { if (canSpeak) speechSynthesis.cancel(); };
  },
};

// --- Braille -----------------------------------------------------------------------------
function brailleCellView(ch) {
  const dots = dotsOf(ch);
  const dot = n => h('i', { class: dots.includes(String(n)) ? 'on' : '' });
  return h('div', { class: 'bcell', title: dots ? 'dots ' + dots : 'blank' },
    h('div', { class: 'bdots' }, dot(1), dot(4), dot(2), dot(5), dot(3), dot(6)),
    h('span', {}, dots ? [...dots].join('') : '–'));
}

const braille = {
  id: 'braille', name: 'Braille', group: 'codes', icon: 'grid-3x3',
  desc: 'Text ⇄ Unicode Braille (uncontracted English), with dot numbers and a print view.',
  keywords: 'braille blind unicode dots ueb grade 1 uncontracted accessibility tactile',
  accepts: ['text'],
  render(root, incoming) {
    const text = textarea({ rows: 3, mono: false, value: 'Hello World 2026', placeholder: 'Type text…' });
    const br = textarea({ rows: 3, placeholder: '⠠⠓⠑⠇⠇⠕' });
    br.classList.add('braille-text');
    const info = note();
    const cells = h('div', { class: 'bcells' });
    const big = h('div', { class: 'braille-big' });
    let lock = false;
    const draw = () => {
      const chars = [...br.value];
      cells.replaceChildren(...chars.slice(0, 400).map(c => c === '\n' ? h('div', { class: 'bbreak' }) : /[⠀-⣿ ]/.test(c) ? brailleCellView(c === ' ' ? '⠀' : c) : null).filter(Boolean));
      big.textContent = br.value;
    };
    const fwd = () => {
      if (lock) return; lock = true;
      const r = toBraille(text.value);
      br.value = r.braille;
      r.skipped.length ? info.info(`No Braille for: ${r.skipped.join(' ')} — left out.`) : info.clear();
      draw(); lock = false;
    };
    const back = () => { if (lock) return; lock = true; text.value = fromBraille(br.value); info.clear(); draw(); lock = false; };
    text.addEventListener('input', fwd);
    br.addEventListener('input', back);
    const printB = h('button', {
      class: 'btn small', type: 'button',
      onclick: () => {
        document.body.classList.add('codes-printing');
        const done = () => { document.body.classList.remove('codes-printing'); removeEventListener('afterprint', done); };
        addEventListener('afterprint', done);
        print();
        setTimeout(done, 1500);
      },
    }, 'Print large');
    root.append(
      card(field('Text', text), field('Braille', br, 'Unicode Braille characters. Paste Braille here to read it back.'), info.el,
        row(copyBtn(() => br.value, 'Copy Braille'), printB, textSend(() => br.value))),
      card(h('h3', {}, 'Cells and dot numbers'), cells,
        h('p', { class: 'field-hint' }, `Signs used: ${SIGN.capital} capital (dot 6), ${SIGN.capital}${SIGN.capital} whole word in capitals, ${SIGN.number} number sign (dots 3456 — then a–j mean 1–0), ${SIGN.grade1} letter sign after a number.`)),
      big,
      h('p', { class: 'field-hint' }, 'This is uncontracted (grade 1) Unified English Braille — every letter spelled out. Most printed books use contracted grade 2, which this does not do. Printing gives ink dots for sighted readers and mock-ups; touch-readable Braille needs an embosser.'),
    );
    fwd();
    textOf(incoming).then(t => { if (t == null) return; if (/^[⠀-⣿\s]+$/.test(t)) { br.value = t; back(); } else { text.value = t; fwd(); } });
    return () => document.body.classList.remove('codes-printing');
  },
};

// --- Ciphers -------------------------------------------------------------------------------
const METHODS = [
  ['caesar', 'Caesar / ROT-n'], ['rot13', 'ROT13'], ['rot47', 'ROT47'], ['atbash', 'Atbash'],
  ['vigenere', 'Vigenère'], ['beaufort', 'Beaufort'], ['affine', 'Affine'], ['rail', 'Rail fence'],
  ['substitution', 'Substitution (key alphabet)'], ['bacon', 'Bacon'], ['a1z26', 'A1Z26 (A=1 … Z=26)'],
];
const SELF_INVERSE = ['rot13', 'rot47', 'atbash', 'beaufort'];

const cipher = {
  id: 'cipher', name: 'Cipher decoder', group: 'codes', icon: 'key-round',
  desc: 'Caesar, Vigenère, Atbash, affine, rail fence and more — or let it crack a message for you.',
  keywords: 'cipher decode encode caesar rot13 rot47 atbash vigenere affine rail fence beaufort substitution bacon a1z26 crack brute force puzzle geocache ctf',
  accepts: ['text'],
  render(root, incoming) {
    const mode = tabs([['use', 'Encode / decode'], ['crack', 'Crack it']], 'use', v => { usePane.hidden = v !== 'use'; crackPane.hidden = v !== 'crack'; if (v === 'crack') crack(); });

    // Encode / decode
    const method = select(METHODS, 'caesar');
    const dir = tabs([['enc', 'Encode'], ['dec', 'Decode']], 'enc', () => run());
    const shift = input({ type: 'number', value: 3, min: -25, max: 25 });
    const key = input({ mono: true, value: 'LEMON', placeholder: 'Keyword' });
    const a = select(C.AFFINE_A.map(String), '5');
    const b = input({ type: 'number', value: 8, min: 0, max: 25 });
    const rails = input({ type: 'number', value: 3, min: 2, max: 50 });
    const alpha = input({ mono: true, value: 'QWERTYUIOPASDFGHJKLZXCVBNM', placeholder: '26 letters' });
    const kw = input({ mono: true, placeholder: 'e.g. ZEBRAS' });
    const b26 = checkbox('Use 26 distinct letters (I/J and U/V not merged)');
    const fields = {
      shift: field('Shift', shift), key: field('Key', key), a: field('a (multiplier)', a), b: field('b (shift)', b),
      rails: field('Rails', rails), alpha: field('Cipher alphabet (what A…Z become)', alpha),
      kw: field('…or build it from a keyword', kw), b26,
    };
    const NEED = { caesar: ['shift'], vigenere: ['key'], beaufort: ['key'], affine: ['a', 'b'], rail: ['rails'], substitution: ['alpha', 'kw'], bacon: ['b26'] };
    const src = textarea({ rows: 4, mono: false, value: 'HELLO', placeholder: 'Message' });
    const out = output('Result', { multiline: true, rows: 4 });
    const err = note();
    kw.addEventListener('input', () => { if (kw.value.trim()) { alpha.value = C.keywordAlphabet(kw.value); run(); } });
    function run() {
      for (const [k, el] of Object.entries(fields)) el.hidden = !(NEED[method.value] || []).includes(k);
      dir.hidden = SELF_INVERSE.includes(method.value);
      const dec = dir.value === 'dec' && !dir.hidden;
      const t = src.value;
      err.clear();
      try {
        const r = {
          caesar: () => C.caesar(t, (dec ? -1 : 1) * Number(shift.value || 0)),
          rot13: () => C.rot13(t), rot47: () => C.rot47(t), atbash: () => C.atbash(t),
          vigenere: () => { if (!/[a-z]/i.test(key.value)) throw new Error('The key needs at least one letter.'); return C.vigenere(t, key.value, dec); },
          beaufort: () => { if (!/[a-z]/i.test(key.value)) throw new Error('The key needs at least one letter.'); return C.beaufort(t, key.value); },
          affine: () => C.affine(t, a.value, b.value, dec),
          rail: () => C.railFence(t, rails.value, dec),
          substitution: () => C.substitution(t, alpha.value, dec),
          bacon: () => dec ? C.baconDecode(t, b26.input.checked) : C.baconEncode(t, b26.input.checked),
          a1z26: () => dec ? C.a1z26Decode(t) : C.a1z26Encode(t),
        }[method.value]();
        out.set(r);
      } catch (e) { out.set(''); err.error(e.message); }
    }
    const usePane = h('div', { class: 'stack' },
      card(field('Cipher', method), dir, row(...Object.values(fields)), field('Message', src), err.el, out.el,
        row(h('button', { class: 'btn small', type: 'button', onclick: () => { src.value = out.get(); dir.set(dir.value === 'enc' ? 'dec' : 'enc'); run(); } }, 'Swap'), textSend(() => out.get()))));
    on([method, shift, key, a, b, rails, alpha, src, b26.input], run);
    method.addEventListener('change', run); a.addEventListener('change', run); b26.input.addEventListener('change', run);

    // Crack
    const ct = textarea({ rows: 4, mono: false, placeholder: 'Paste a secret message…', value: 'Wkh vhfuhw lv xqghu wkh rog eulgjh.' });
    const list = h('div', { class: 'crack-list' });
    const vigInfo = h('div', { class: 'crack-vig' });
    function crack() {
      const t = ct.value;
      list.replaceChildren(); vigInfo.replaceChildren();
      if (!t.trim()) return;
      const res = C.autoCrack(t, 8);
      const best = res[0]?.score ?? 0;
      list.append(...res.map((c, i) => h('div', { class: 'crack-row' + (i === 0 ? ' top' : '') },
        h('div', { class: 'crack-head' },
          h('strong', {}, c.method), c.params && h('span', { class: 'pill' }, c.params),
          h('span', { class: 'crack-score', title: 'English-likeness (higher is better)' }, c.score.toFixed(2)),
          h('span', { class: 'crack-btns' },
            copyBtn(() => c.text),
            c.set && h('button', {
              class: 'btn small ghost', type: 'button',
              onclick: () => {
                const s = c.set;
                method.value = s.method === 'caesar' && s.shift === 13 ? 'caesar' : s.method;
                if (s.shift != null) shift.value = s.shift;
                if (s.key) key.value = s.key;
                if (s.a) { a.value = String(s.a); b.value = s.b; }
                if (s.rails) rails.value = s.rails;
                if (s.full26 != null) b26.input.checked = s.full26;
                src.value = t; dir.set('dec'); mode.set('use'); usePane.hidden = false; crackPane.hidden = true; run();
              },
            }, 'Open'))),
        h('div', { class: 'crack-text' }, c.text.length > 400 ? c.text.slice(0, 400) + '…' : c.text))));
      if (best < 0.6) list.prepend(h('p', { class: 'field-hint' }, 'Nothing looks clearly like English — it may be a different cipher, another language, or too short to tell.'));
      const v = C.crackVigenere(t);
      if (v.lengths.length) {
        const max = Math.max(...v.lengths.map(x => x.ioc));
        vigInfo.append(h('h3', {}, 'Vigenère key length guess'),
          h('div', { class: 'ioc-bars' }, v.lengths.map(x => h('div', { title: `length ${x.L}: IoC ${x.ioc.toFixed(3)}` },
            h('i', { style: { height: Math.max(4, x.ioc / max * 70) + 'px' }, class: x.ioc > 0.058 ? 'hi' : '' }), h('span', {}, x.L)))),
          h('p', { class: 'field-hint' }, `Index of coincidence for each key length — English text scores about 0.066, random letters about 0.038. ${v.kasiski?.length ? `Kasiski (repeated letter groups) points to: ${v.kasiski.slice(0, 3).map(x => x[0]).join(', ')}.` : ''}`));
      }
    }
    const crackPane = h('div', { class: 'stack', hidden: true },
      card(field('Secret message', ct), list,
        h('p', { class: 'field-hint' }, 'Tries every Caesar shift, Atbash, every affine key, rail fences of 2–12 rails, ROT47, Bacon, A1Z26 and Vigenère keys up to 16 letters, then ranks the results by how English they look (letter frequencies, common pairs and common words). Short messages are hard to rank — 40+ letters works best.')),
      card(vigInfo));
    on(ct, () => { if (!crackPane.hidden) crack(); }, 'input', 250);

    root.append(mode, usePane, crackPane);
    textOf(incoming).then(t => { if (t != null) { src.value = t; ct.value = t; mode.set('crack'); usePane.hidden = true; crackPane.hidden = false; crack(); } });
  },
};

// --- Barcodes --------------------------------------------------------------------------------
let bwipP;
const bwip = () => (bwipP ??= import('../../vendor/bwip-js/bwip-js.js').then(m => m.default));
const safeName = s => (s.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'barcode');

const barcode = {
  id: 'barcode', name: 'Barcode generator', group: 'codes', icon: 'barcode',
  desc: 'EAN-13, UPC-A, Code 128, Data Matrix, Aztec, PDF417 and more — PNG or SVG, one or a batch.',
  keywords: 'barcode generator ean ean13 ean8 upc upca code128 code39 itf14 datamatrix aztec pdf417 gtin check digit label sku',
  accepts: ['text'],
  render(root, incoming) {
    const mode = tabs([['one', 'One barcode'], ['batch', 'Batch']], 'one', v => { onePane.hidden = v !== 'one'; batchPane.hidden = v !== 'batch'; });
    const type = select(TYPES.map(t => [t.id, t.name]), 'ean13');
    const value = input({ mono: true, value: '400638133393' });
    const hint = h('span', { class: 'field-hint' });
    const msg = note();
    const scale = slider('Bar width', { min: 1, max: 8, value: 3, unit: ' px' });
    const height = slider('Height', { min: 5, max: 40, value: 15, unit: ' mm' });
    const showText = checkbox('Show the number under the bars', true);
    const fg = h('input', { type: 'color', class: 'swatch-input', value: '#000000' });
    const bg = h('input', { type: 'color', class: 'swatch-input', value: '#ffffff' });
    const clear = checkbox('Transparent background');
    const canvas = h('canvas', { class: 'barcode-canvas' });
    const full = output('Encoded value');
    let good = null;

    const opts = (t, text) => {
      const o = { bcid: t.bcid, text, scale: scale.value, paddingwidth: 4, paddingheight: 4, barcolor: fg.value.slice(1) };
      if (!clear.input.checked) o.backgroundcolor = bg.value.slice(1);
      if (!t.two) { o.height = height.value; o.includetext = showText.input.checked; if (!/^(ean|upc)/.test(t.id)) o.textxalign = 'center'; }
      if (t.id === 'itf14') o.includetext = showText.input.checked;
      return o;
    };
    async function draw() {
      const t = TYPES.find(x => x.id === type.value);
      hint.textContent = t.hint;
      height.el.hidden = !!t.two; showText.hidden = !!t.two;
      const v = checkValue(t.id, value.value);
      good = null;
      if (!v.ok) { msg.error(v.msg); full.set(''); canvas.classList.add('dim'); return; }
      try {
        const lib = await bwip();
        lib.toCanvas(canvas, opts(t, v.text));
        canvas.classList.remove('dim');
        good = { t, v };
        full.set(v.full);
        v.msg ? msg.info(v.msg) : msg.clear();
      } catch (e) { msg.error(friendlyError(e)); full.set(''); canvas.classList.add('dim'); }
    }
    on([type, value, scale.input, height.input, showText.input, fg, bg, clear.input], draw, 'input', 120);
    for (const el of [type, showText.input, clear.input]) el.addEventListener('change', draw);

    const name = ext => `${good?.t.id || 'barcode'}-${safeName(good?.v.full || '')}.${ext}`;
    const svgBlob = async () => good && new Blob([(await bwip()).toSVG(opts(good.t, good.v.text))], { type: 'image/svg+xml' });
    const onePane = h('div', { class: 'stack' },
      card(row(field('Type', type), h('label', { class: 'field' }, h('span', { class: 'field-head' }, h('span', { class: 'field-label' }, 'Value')), value, hint)), msg.el,
        h('div', { class: 'preview barcode-preview' }, canvas), full.el,
        row(downloadBtn(() => name('png'), () => good && new Promise(r => canvas.toBlob(r, 'image/png')), 'Download PNG'),
          downloadBtn(() => name('svg'), svgBlob, 'Download SVG'),
          sendBtn(async () => good && { files: [await asFile(canvas, name('png'))] }))),
      card(h('h3', {}, 'Look'), h('div', { class: 'grid2' }, scale.el, height.el),
        row(h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Bars'), fg), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Background'), bg), clear),
        showText,
        h('p', { class: 'field-hint' }, 'Keep dark bars on a light background — most scanners cannot read light-on-dark or low-contrast codes. Print at 100% size and test with a phone before printing a batch.')),
      card(h('h3', {}, 'Need a QR code?'), h('p', { class: 'field-hint' }, 'QR codes have their own tool with WiFi logins and links.'),
        row(h('button', { class: 'btn small', type: 'button', onclick: () => sendTo('qr', { text: value.value }) }, 'Open the QR code tool'))),
    );

    // Batch
    const lines = textarea({ rows: 8, placeholder: 'One value per line', value: '400638133393\n590123412345\n9501101530003' });
    const fmt = select([['png', 'PNG'], ['svg', 'SVG']], 'png');
    const report = h('ul', { class: 'tips' });
    const make = h('button', {
      class: 'btn primary', type: 'button',
      onclick: async () => {
        make.disabled = true;
        report.replaceChildren();
        try {
          const lib = await bwip();
          const t = TYPES.find(x => x.id === type.value);
          const { zipSync, strToU8 } = await import('../../vendor/fflate.js');
          const files = {}, used = new Set();
          let n = 0, bad = 0;
          const vals = lines.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          for (const [i, raw] of vals.entries()) {
            const v = checkValue(t.id, raw);
            if (!v.ok) { bad++; report.append(h('li', {}, `Line ${i + 1} (${raw}): ${v.msg}`)); continue; }
            let base = `${String(i + 1).padStart(3, '0')}-${safeName(v.full)}`;
            while (used.has(base)) base += '_';
            used.add(base);
            try {
              if (fmt.value === 'svg') files[base + '.svg'] = strToU8(lib.toSVG(opts(t, v.text)));
              else {
                const c = document.createElement('canvas');
                lib.toCanvas(c, opts(t, v.text));
                const blob = await new Promise(r => c.toBlob(r, 'image/png'));
                files[base + '.png'] = new Uint8Array(await blob.arrayBuffer());
              }
              n++;
            } catch (e) { bad++; report.append(h('li', {}, `Line ${i + 1} (${raw}): ${friendlyError(e)}`)); }
          }
          if (n) download(`barcodes-${t.id}.zip`, new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }));
          report.prepend(h('li', {}, `${n} barcode${n === 1 ? '' : 's'} made${bad ? `, ${bad} skipped` : ''}.`));
        } finally { make.disabled = false; }
      },
    }, 'Make zip');
    const batchPane = h('div', { class: 'stack', hidden: true },
      card(h('p', { class: 'field-hint' }, 'Uses the type and look set on the first tab.'), field('Values', lines), row(field('Format', fmt), make), report));

    root.append(mode, onePane, batchPane);
    textOf(incoming).then(t => { if (t != null) { value.value = t.trim(); draw(); } });
  },
};

export default [morse, nato, braille, cipher, barcode];
