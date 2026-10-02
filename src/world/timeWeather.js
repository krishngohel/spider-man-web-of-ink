// Time of day and weather (spec section 5): day, golden hour and night, clear, overcast and rain.
// Plain math: env(hour, weather) gives every colour and intensity the renderer needs, so the
// look of a time and weather can be tested without Three.js. Free roam cycles; story missions set
// their own (setTime / setWeather).

// Keyframes by hour. Colours are hex numbers; lerped in linear RGB by the caller's helper.
const KEYS = [
  { h: 0, skyTop: 0x0b1430, skyMid: 0x18264d, horizon: 0x2c3a62, sun: 0x9fb4e8, sunI: 0.35, hemiSky: 0x3a4e86, hemiGround: 0x1c1c2c, hemiI: 0.55, fog: 0x1c2645, night: 1 },
  { h: 5, skyTop: 0x101a3a, skyMid: 0x27365e, horizon: 0x4a4a72, sun: 0x9fb4e8, sunI: 0.35, hemiSky: 0x3e5088, hemiGround: 0x22202e, hemiI: 0.6, fog: 0x2a3458, night: 1 },
  { h: 6.5, skyTop: 0x4a74c0, skyMid: 0xe39a8c, horizon: 0xf6c38a, sun: 0xffc08a, sunI: 1.2, hemiSky: 0x9fb5e0, hemiGround: 0x8a7a6a, hemiI: 1.0, fog: 0xe8b8a0, night: 0.25 },
  { h: 8.5, skyTop: 0x3f8fe0, skyMid: 0x8cc4f2, horizon: 0xf3dfb4, sun: 0xfff1d6, sunI: 1.9, hemiSky: 0x8cc4f2, hemiGround: 0xb8a58c, hemiI: 1.25, fog: 0xbcd6ea, night: 0 },
  { h: 16, skyTop: 0x3f8fe0, skyMid: 0x8cc4f2, horizon: 0xf3dfb4, sun: 0xfff1d6, sunI: 1.9, hemiSky: 0x8cc4f2, hemiGround: 0xb8a58c, hemiI: 1.25, fog: 0xbcd6ea, night: 0 },
  { h: 18.3, skyTop: 0x3b6cc0, skyMid: 0xf09a6a, horizon: 0xffc070, sun: 0xffa860, sunI: 1.7, hemiSky: 0xc0a0b8, hemiGround: 0xa07a5a, hemiI: 1.05, fog: 0xf0b088, night: 0.1 },
  { h: 19.6, skyTop: 0x283c80, skyMid: 0x8a5a8a, horizon: 0xe07a5a, sun: 0xff8a5a, sunI: 0.8, hemiSky: 0x6a6aa0, hemiGround: 0x4a3a40, hemiI: 0.8, fog: 0x7a5a78, night: 0.6 },
  { h: 21, skyTop: 0x0b1430, skyMid: 0x18264d, horizon: 0x2c3a62, sun: 0x9fb4e8, sunI: 0.35, hemiSky: 0x3a4e86, hemiGround: 0x1c1c2c, hemiI: 0.55, fog: 0x1c2645, night: 1 },
  { h: 24, skyTop: 0x0b1430, skyMid: 0x18264d, horizon: 0x2c3a62, sun: 0x9fb4e8, sunI: 0.35, hemiSky: 0x3a4e86, hemiGround: 0x1c1c2c, hemiI: 0.55, fog: 0x1c2645, night: 1 },
];
export const PRESETS = { day: 11, golden: 18.4, night: 22.5, dawn: 6.4 };
export const WEATHERS = ['clear', 'overcast', 'rain'];

const unpack = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const pack = (r, g, b) => (Math.round(Math.min(1, Math.max(0, r)) * 255) << 16) | (Math.round(Math.min(1, Math.max(0, g)) * 255) << 8) | Math.round(Math.min(1, Math.max(0, b)) * 255);
function mixHex(a, b, t) { const A = unpack(a), B = unpack(b); return pack(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
function grey(c, k) { const [r, g, b] = unpack(c); const l = 0.3 * r + 0.59 * g + 0.11 * b; return pack(r + (l - r) * k, g + (l - g) * k, b + (l - b) * k); }
function scale(c, k) { const [r, g, b] = unpack(c); return pack(r * k, g * k, b * k); }

// Everything the scene needs for an hour (0 to 24) and a weather.
export function env(hour, weather = 'clear') {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = (h - a.h) / Math.max(1e-6, b.h - a.h);
  const out = {};
  for (const k of ['skyTop', 'skyMid', 'horizon', 'sun', 'hemiSky', 'hemiGround', 'fog']) out[k] = mixHex(a[k], b[k], t);
  for (const k of ['sunI', 'hemiI', 'night']) out[k] = a[k] + (b[k] - a[k]) * t;
  // The sun's arc (east to west), and the moon on the far side of the sky at night.
  const dayK = (h - 6) / 13.5; // 0 at sunrise, 1 at sunset
  const el = Math.sin(Math.min(1, Math.max(0, dayK)) * Math.PI) * 1.15 + 0.12;
  const az = -1.2 + dayK * 2.4;
  const day = out.night < 0.5;
  const sx = Math.cos(el) * Math.sin(az), sy = Math.sin(el), sz = Math.cos(el) * Math.cos(az) * 0.6 + 0.4;
  const l = Math.hypot(sx, sy, sz);
  out.sunDir = day ? [sx / l, sy / l, sz / l] : [-0.35, 0.72, -0.6];
  out.moon = !day;
  // Weather: overcast greys the sky and softens the sun; rain darkens it further.
  out.cloud = weather === 'clear' ? 0 : weather === 'overcast' ? 0.75 : 1;
  out.rain = weather === 'rain' ? 1 : 0;
  if (out.cloud > 0) {
    const g = 0.55 * out.cloud;
    for (const k of ['skyTop', 'skyMid', 'horizon', 'fog', 'hemiSky']) out[k] = grey(out[k], g);
    out.skyTop = scale(out.skyTop, 1 - 0.25 * out.cloud);
    out.sunI *= 1 - 0.55 * out.cloud;
    out.hemiI *= 1 + 0.12 * out.cloud;
  }
  out.fogNear = weather === 'rain' ? 140 : weather === 'overcast' ? 240 : 320;
  return out;
}

// The clock: cycles in free roam (a full day in dayMinutes real minutes), or holds a set time.
export function createClock({ hour = PRESETS.day, weather = 'clear', dayMinutes = 24, cycle = true } = {}) {
  const c = {
    hour, weather, cycle, dayMinutes,
    weatherT: 0,
    update(dt) {
      if (c.cycle) c.hour = (c.hour + (dt / 60) * (24 / c.dayMinutes)) % 24;
      return c;
    },
    set(h) { c.hour = ((h % 24) + 24) % 24; },
  };
  return c;
}
