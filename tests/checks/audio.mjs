// Known-answer checks for the audio half of the Audio & video drawer.
// Test sounds are made in the page: an exact sine written by our own WAV encoder.
import { set, val, wait, giveFile, until } from '../helpers.mjs';

const tone = (o = {}) => `(async () => { const w = await import('./js/lib/audio-wav.js'); const b = await w.toneBuffer(${JSON.stringify({ freq: 1000, dbfs: -20, seconds: 2, rate: 48000, channels: 1, ...o })}); return w.wavFile(b, 'tone.wav'); })()`;
const dd = k => `(document.querySelector('[data-k="${k}"]')?.textContent || '')`;
const near = (expr, want, tol, label) => `(() => { const v = parseFloat(${expr}.replace('−', '-')); return Math.abs(v - (${want})) <= ${tol} ? '' : '${label}: ' + ${expr}; })()`;

// Picks a tool in the "Send to…" sheet by name.
const sendTo = name => `(async () => { [...document.querySelectorAll('.btn')].find(b => b.textContent.includes('Send to'))?.click(); await new Promise(r => setTimeout(r, 400)); const it = [...document.querySelectorAll('.sheet-item')].find(b => b.textContent.includes('${name}')); if (!it) return 'no ${name} in Send to'; it.click(); await new Promise(r => setTimeout(r, 500)); return ''; })()`;

const SRT = '1\\n00:00:01,000 --> 00:00:03,500\\nHello there.\\n\\n2\\n00:00:03,200 --> 00:00:06,000\\nSecond line\\nwith two rows.\\n';
const VTT = 'WEBVTT\\n\\n00:00:01.000 --> 00:00:03.500\\nHello there.\\n\\n00:00:03.200 --> 00:00:06.000\\nSecond line\\nwith two rows.\\n';

export default {
  'audio-atlas': [
    giveFile('input[type=file]', tone()), until(`document.querySelector('[data-k="lufs"]')`, 10000),
    `(${dd('duration')}.startsWith('2.00 s') ? '' : 'duration: ' + ${dd('duration')})`,
    near(dd('peak'), -20, 0.05, 'peak'),
    near(dd('lufs'), -23.01, 0.1, 'lufs (1 kHz −20 dBFS mono should be −23.0)'),
    near(dd('rms'), -23.01, 0.05, 'rms'),
    `(${dd('rate')}.startsWith('48 kHz') && ${dd('codec')}.includes('PCM') && ${dd('bits')} === '16-bit' && ${dd('clip')} === 'none' ? '' : 'header: ' + ${dd('rate')} + ' / ' + ${dd('codec')} + ' / ' + ${dd('clip')})`,
    `(${dd('bitrate')}.startsWith('768 kbps') ? '' : 'bitrate: ' + ${dd('bitrate')})`,
    // A full-scale square wave clips.
    giveFile('input[type=file]', `(async () => { const w = await import('./js/lib/audio-wav.js'); const x = new Float32Array(48000).map((_, i) => (i % 100 < 50 ? 1 : -1)); return w.wavFile(w.makeBuffer([x], 48000), 'square.wav'); })()`),
    until(`document.querySelector('[data-k="clip"]')?.textContent.includes('samples')`, 10000),
    `(document.querySelector('.verdict.bad')?.textContent === 'Clipping found' ? '' : 'clipping not flagged')`,
  ],
  'audio-trim': [
    giveFile('input[type=file]', tone()), until(`document.querySelector('.au-sel')?.textContent`, 8000),
    set('input.input', '0.5', 0), set('input.input', '1.5', 1), set('input.input', '0.1', 2),
    `(document.querySelector('.au-sel').textContent.includes('(1.00 s)') ? '' : 'selection: ' + document.querySelector('.au-sel').textContent)`,
    `(parseFloat(document.querySelectorAll('.au-handle')[1].style.left) === 75 ? '' : 'end handle at ' + document.querySelectorAll('.au-handle')[1].style.left)`,
    sendTo('Audio Atlas'), until(`document.querySelector('[data-k="duration"]')`, 10000),
    `(${dd('duration')}.startsWith('1.00 s') ? '' : 'trimmed duration: ' + ${dd('duration')})`,
  ],
  'audio-normaliser': [
    giveFile('input[type=file]', tone()), until(`document.querySelector('[data-k="after-lufs"]')`, 10000),
    near(dd('before-lufs'), -23.01, 0.1, 'before'),
    near(dd('after-lufs'), -16, 0.5, 'after (target −16)'),
    `(parseFloat(${dd('after-tp')}.replace('−', '-')) <= -1 ? '' : 'true peak over ceiling: ' + ${dd('after-tp')})`,
    // A loud tone pushed to −9 LUFS must be held under the −1 dBTP ceiling by the limiter.
    `(async () => { const t = (await import('./js/tools/audio.js')).default.find(t => t.id === 'audio-normaliser'); const s = t.steps.find(s => s.id === 'audio-normalise');
      const f = await ${tone({ dbfs: -3, seconds: 3 })};
      const [o] = await s.run([f], { target: -16, peak: -1 }, { progress() {} });
      const [loud] = await s.run([f], { target: -6, peak: -1 }, { progress() {} });
      const w = await import('./js/lib/audio-wav.js'), m = await import('./js/lib/audio-meter.js');
      const a = m.measure(await w.decodeAudio(o, 48000)), b = m.measure(await w.decodeAudio(loud, 48000));
      if (o.name !== 'tone-normalised.wav') return 'step name ' + o.name;
      if (Math.abs(a.lufs + 16) > 0.5) return 'step lufs ' + a.lufs;
      if (b.truePeakDb > -0.9) return 'limiter let true peak reach ' + b.truePeakDb.toFixed(2);
      const [wav] = await t.steps.find(s => s.id === 'audio-to-wav').run([f], {}, { progress() {} });
      return wav.size === 44 + 3 * 48000 * 2 && wav.name === 'tone.wav' ? '' : 'to-wav size ' + wav.size; })()`,
  ],
  'voice-recorder': [
    `(document.querySelector('.au-rec') && !document.querySelector('.au-rec').disabled ? '' : 'record button missing or disabled')`,
    // The meter's maths: a 0.5-amplitude sine peaks at −6.02 dBFS.
    `(async () => { const { peakDb } = await import('./js/tools/audio.js'); const x = new Float32Array(4800).map((_, i) => 0.5 * Math.sin(2 * Math.PI * 1000 * i / 48000)); const d = peakDb(x); return Math.abs(d + 6.02) < 0.01 ? '' : 'peakDb ' + d; })()`,
    // Record for 1.5 s from a fake microphone (a tone). Headless Chrome keeps audio
    // contexts suspended without a real tap, so the take may come out silent or empty:
    // the clock and the take list are checked; the live meter was checked by hand.
    `(async () => { const ac = new AudioContext(); await Promise.race([ac.resume(), new Promise(r => setTimeout(r, 300))]); const o = ac.createOscillator(); const g = ac.createGain(); g.gain.value = 0.5; const d = ac.createMediaStreamDestination(); o.connect(g).connect(d); o.start();
      navigator.mediaDevices.getUserMedia = async () => d.stream;
      document.querySelector('.au-rec').click(); await new Promise(r => setTimeout(r, 1500));
      const clock = document.querySelector('.au-timer').textContent, on = document.querySelector('.au-rec.on');
      document.querySelector('.au-rec').click(); await new Promise(r => setTimeout(r, 800)); o.stop(); ac.close();
      if (!on) return 'record button did not switch to stop';
      if (!/^0:01\\.[2-9]$/.test(clock)) return 'timer: ' + clock;
      const takes = document.querySelectorAll('.au-takes audio').length, empty = document.querySelector('.note.error')?.textContent.includes('Nothing was recorded');
      return takes === 1 || empty ? '' : 'takes: ' + takes; })()`,
  ],
  'waveform-image': [
    giveFile('input[type=file]', tone({ seconds: 1, silenceAfter: 1 })), until(`document.querySelector('.au-wavegen svg')`, 8000),
    `(() => { const r = document.querySelectorAll('.au-wavegen svg rect'); if (r.length !== 80) return 'bars: ' + r.length; const h0 = +r[0].getAttribute('height'), h79 = +r[79].getAttribute('height'); return h0 > 250 && h79 === 6 ? '' : 'bar heights ' + h0 + ' / ' + h79; })()`,
    `(document.querySelectorAll('.tabs button')[2].click(), document.querySelector('.au-wavegen svg polyline') ? '' : 'line style missing')`,
  ],
  subtitles: [
    set('textarea', SRT.replaceAll('\\n', '\n')), wait(300),
    `(${val('.output textarea')} === ${JSON.stringify(VTT.replaceAll('\\n', '\n'))} ? '' : 'srt->vtt: ' + JSON.stringify(${val('.output textarea')}))`,
    set('input.input', '1500', 0), wait(300),
    `(${val('.output textarea')}.includes('00:00:02.500 --> 00:00:05.000') && ${val('.output textarea')}.includes('00:00:04.700 --> 00:00:07.500') ? '' : 'shift +1500: ' + ${val('.output textarea')}.slice(0, 120))`,
    `(document.querySelectorAll('.tabs button')[1].click(), ${val('.output textarea')}.startsWith('1\\n00:00:02,500 --> 00:00:05,000\\nHello there.') ? '' : 'vtt->srt: ' + ${val('.output textarea')}.slice(0, 60))`,
    `(async () => { const c = document.querySelector('.check input'); c.checked = true; c.dispatchEvent(new Event('change', {bubbles:true})); await new Promise(r => setTimeout(r, 300)); return ${val('.output textarea')}.includes('00:00:02,500 --> 00:00:04,660') ? '' : 'fix overlaps: ' + ${val('.output textarea')}.slice(0, 80); })()`,
    set('select', '23.976', 0), set('select', '25', 1), set('input.input', '0', 0), wait(300),
    `(${val('.output textarea')}.includes('00:00:00,959 -->') ? '' : 'fps 23.976->25: ' + ${val('.output textarea')}.slice(0, 60))`,
  ],
  timecode: [
    `(${val('.output input')} === '00:00:12:12' ? '' : '25 fps add: ' + ${val('.output input')})`,
    set('select', '29.97df'), set('input.input', '00:00:59;29', 0), set('input.input', '1', 1),
    `(${val('.output input')} === '00:01:00;02' ? '' : 'drop-frame +1: ' + ${val('.output input')})`,
    `(document.querySelectorAll('.tabs button')[1].click(), ${val('.output input')} === '00:00:59;28' ? '' : 'subtract: ' + ${val('.output input')})`,
    set('input.input', '01:00:00;00', 3),
    `(${val('input.input', 4)} === '107892' && ${val('input.input', 5)} === '3599.996' ? '' : '1 h drop-frame frames: ' + ${val('input.input', 4)} + ' / ' + ${val('input.input', 5)})`,
    set('input.input', '17982', 4),
    `(${val('input.input', 3)} === '00:10:00;00' ? '' : '17982 frames: ' + ${val('input.input', 3)})`,
    set('input.input', '00:01:00;00', 0), `(document.querySelector('.note.error') && !document.querySelector('.note.error').hidden ? '' : ';00 at minute 1 should not exist in drop-frame')`,
  ],
  'auto-subtitle': [
    `(async () => { const { speechChunks } = await import('./js/tools/audio.js'); const x = new Float32Array(16000 * 70).fill(0.3); x.fill(0, 16000 * 27, 16000 * 27.5);
      const c = speechChunks(x); return c.length === 3 && c[0][1] > 16000 * 27 && c[0][1] < 16000 * 27.5 && c[2][1] === x.length ? '' : 'chunks ' + JSON.stringify(c); })()`,
    giveFile('input[type=file]', tone()), until(`!document.querySelector('.btn.primary').disabled`, 8000),
    `(document.querySelector('.field-hint').textContent.includes('0:02.00') ? '' : 'decoded: ' + document.querySelector('.field-hint').textContent)`,
    `document.querySelector('.btn.primary').click()`, wait(300),
    `(document.querySelector('.heavy-ask')?.textContent.includes('Whisper tiny') ? '' : 'no download card')`,
  ],
};
