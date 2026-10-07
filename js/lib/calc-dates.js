// Time zone and calendar helpers for the time-zone & date maths tool.
// Dates without a time are handled as plain {y, m, d} via UTC so daylight
// saving never shifts a day.

export const CITIES = [
  ['Kuala Lumpur', 'Asia/Kuala_Lumpur'], ['Kota Kinabalu', 'Asia/Kuching'], ['Singapore', 'Asia/Singapore'], ['Jakarta', 'Asia/Jakarta'],
  ['Bangkok', 'Asia/Bangkok'], ['Ho Chi Minh City', 'Asia/Ho_Chi_Minh'], ['Manila', 'Asia/Manila'], ['Hong Kong', 'Asia/Hong_Kong'],
  ['Shanghai', 'Asia/Shanghai'], ['Taipei', 'Asia/Taipei'], ['Seoul', 'Asia/Seoul'], ['Tokyo', 'Asia/Tokyo'],
  ['Delhi', 'Asia/Kolkata'], ['Dhaka', 'Asia/Dhaka'], ['Karachi', 'Asia/Karachi'], ['Kathmandu', 'Asia/Kathmandu'],
  ['Dubai', 'Asia/Dubai'], ['Riyadh', 'Asia/Riyadh'], ['Mecca', 'Asia/Riyadh'], ['Tehran', 'Asia/Tehran'], ['Istanbul', 'Europe/Istanbul'],
  ['Cairo', 'Africa/Cairo'], ['Lagos', 'Africa/Lagos'], ['Nairobi', 'Africa/Nairobi'], ['Johannesburg', 'Africa/Johannesburg'],
  ['London', 'Europe/London'], ['Dublin', 'Europe/Dublin'], ['Lisbon', 'Europe/Lisbon'], ['Paris', 'Europe/Paris'], ['Berlin', 'Europe/Berlin'],
  ['Amsterdam', 'Europe/Amsterdam'], ['Madrid', 'Europe/Madrid'], ['Rome', 'Europe/Rome'], ['Stockholm', 'Europe/Stockholm'],
  ['Athens', 'Europe/Athens'], ['Moscow', 'Europe/Moscow'],
  ['New York', 'America/New_York'], ['Toronto', 'America/Toronto'], ['Chicago', 'America/Chicago'], ['Denver', 'America/Denver'],
  ['Los Angeles', 'America/Los_Angeles'], ['Vancouver', 'America/Vancouver'], ['Mexico City', 'America/Mexico_City'],
  ['São Paulo', 'America/Sao_Paulo'], ['Buenos Aires', 'America/Argentina/Buenos_Aires'], ['Honolulu', 'Pacific/Honolulu'],
  ['Perth', 'Australia/Perth'], ['Adelaide', 'Australia/Adelaide'], ['Sydney', 'Australia/Sydney'], ['Melbourne', 'Australia/Melbourne'],
  ['Brisbane', 'Australia/Brisbane'], ['Auckland', 'Pacific/Auckland'], ['UTC', 'UTC'],
];

export function validZone(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

const partsCache = new Map();
function fmtParts(tz) {
  if (!partsCache.has(tz)) partsCache.set(tz, new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }));
  return partsCache.get(tz);
}

// Wall-clock parts of an instant in a zone.
export function wall(ms, tz) {
  const p = Object.fromEntries(fmtParts(tz).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

// Offset of a zone from UTC at an instant, in minutes.
export function offsetMin(ms, tz) {
  const w = wall(ms, tz);
  return Math.round((Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000) / 60000);
}

// Instant for a wall-clock time in a zone.
export function zoned(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ms = guess - offsetMin(guess, tz) * 60000;
  ms = guess - offsetMin(ms, tz) * 60000;
  return ms;
}

export function offsetText(min) {
  const s = min < 0 ? '−' : '+';
  const a = Math.abs(min);
  return `UTC${s}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
}

// --- calendar dates ------------------------------------------------------------
export const parseDate = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};
export const dayNum = ({ y, m, d }) => Math.round(Date.UTC(y, m - 1, d) / 86400000);
export const fromDayNum = n => { const t = new Date(n * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
export const weekday = dt => new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).getUTCDay(); // 0 = Sunday
export const iso = ({ y, m, d }) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const longDate = dt => new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Calendar difference a → b as years, months, days (b may be before a: sign = -1).
export function ymd(a, b) {
  let sign = 1;
  if (dayNum(b) < dayNum(a)) { [a, b] = [b, a]; sign = -1; }
  let y = b.y - a.y, m = b.m - a.m, d = b.d - a.d;
  if (d < 0) { m--; const pm = b.m === 1 ? 12 : b.m - 1, py = b.m === 1 ? b.y - 1 : b.y; d += daysIn(py, pm); }
  if (m < 0) { y--; m += 12; }
  return { y, m, d, sign };
}

// Add years/months (clamped to month end, like most calendars) then days.
export function addYMD(dt, years, months, days) {
  let y = dt.y + years, m = dt.m + months;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  const d = Math.min(dt.d, daysIn(y, m));
  return fromDayNum(dayNum({ y, m, d }) + days);
}

// Count days in [a, b) (or [a, b] when inclusive) that are not weekend days or holidays.
export function workingDays(a, b, weekend, holidays = new Set(), inclusive = false) {
  let s = dayNum(a), e = dayNum(b);
  let sign = 1;
  if (e < s) { [s, e] = [e, s]; sign = -1; }
  if (inclusive) e += 1;
  let work = 0, weekdays = 0, hol = 0;
  for (let n = s; n < e; n++) {
    const wd = ((n % 7) + 7 + 4) % 7; // day 0 (1970-01-01) was a Thursday
    if (wd !== 0 && wd !== 6) weekdays++;
    if (weekend.has(wd)) continue;
    if (holidays.has(n)) { hol++; continue; }
    work++;
  }
  return { work: work * sign, weekdays: weekdays * sign, holidays: hol, total: e - s };
}

// Move forward (or back) by n working days.
export function addWorkingDays(dt, n, weekend, holidays = new Set()) {
  let d = dayNum(dt);
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  const isWork = k => !weekend.has(((k % 7) + 7 + 4) % 7) && !holidays.has(k);
  while (left > 0) { d += step; if (isWork(d)) left--; }
  return fromDayNum(d);
}
