// Screen recording: getDisplayMedia + optional microphone, mixed with Web Audio,
// recorded with MediaRecorder. iPhone/iPad Safari has no getDisplayMedia.

export const canPickScreen = () => !!navigator.mediaDevices?.getDisplayMedia;

// Formats MediaRecorder can write here, best first.
export function recordFormats() {
  if (typeof MediaRecorder === 'undefined') return [];
  const list = [
    ['video/mp4;codecs=avc1,mp4a.40.2', 'MP4 (H.264)', 'mp4'],
    ['video/mp4', 'MP4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'WebM (VP9)', 'webm'],
    ['video/webm;codecs=vp8,opus', 'WebM (VP8)', 'webm'],
    ['video/webm', 'WebM', 'webm'],
  ];
  const seen = new Set();
  return list.filter(([m, , ext]) => {
    if (!MediaRecorder.isTypeSupported(m)) return false;
    const k = ext + (m.includes('vp9') ? '9' : '');
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// Mixes the audio tracks of several streams into one track (or null).
export function mixAudio(streams) {
  const withAudio = streams.filter(s => s?.getAudioTracks().length);
  if (!withAudio.length) return { track: null, close() {} };
  if (withAudio.length === 1) return { track: withAudio[0].getAudioTracks()[0], close() {} };
  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  for (const s of withAudio) ac.createMediaStreamSource(s).connect(dest);
  return { track: dest.stream.getAudioTracks()[0], close: () => ac.close() };
}

// Records a stream. Returns { stop(): Promise<Blob>, recorder }.
export function recordStream(stream, mime) {
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
  const parts = [];
  rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
  const done = new Promise(res => { rec.onstop = () => res(new Blob(parts, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] })); });
  rec.start(1000);
  return { recorder: rec, done, stop() { if (rec.state !== 'inactive') rec.stop(); return done; } };
}

// MediaRecorder WebM has no duration and cannot be seeked well. Copying the
// packets into a fresh file (no re-encode) fixes both.
export async function tidyRecording(blob, name) {
  const { mb } = await import('./video-core.js');
  const M = await mb();
  const input = new M.Input({ source: new M.BlobSource(blob), formats: M.ALL_FORMATS });
  try {
    const isWebm = blob.type.includes('webm');
    const output = new M.Output({ format: isWebm ? new M.WebMOutputFormat() : new M.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new M.BufferTarget() });
    const conv = await M.Conversion.init({ input, output, showWarnings: false });
    if (!conv.isValid) return new File([blob], name, { type: blob.type });
    await conv.execute();
    return new File([output.target.buffer], name, { type: blob.type });
  } catch { return new File([blob], name, { type: blob.type }); }
  finally { input.dispose?.(); }
}
