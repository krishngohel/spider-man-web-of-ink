import * as THREE from 'three';

// The city's words, painted once into one 2048 x 2048 canvas the facade shader samples:
//   shop boards   512 x 64,  4 x 16 at the top half (DELI, PAWN, LAUNDRY...)
//   billboards    512 x 256, 3 x 4 below them, left (made-up brands, comic ads, the Bugle's sign)
//   neon blades   128 x 512, 4 x 2 below them, right (HOTEL, BAR, OPEN, letters stacked)
// Painted with Bangers (the HUD's comic face) once it has loaded, and again if it loads late.
export const SHOPS = ['DELI', 'PAWN', 'LAUNDRY', 'BAKERY', 'PIZZA', 'TAILOR', 'HARDWARE', 'PHARMACY', 'BODEGA', 'NOODLES', 'DINER',
  'BOOKS', 'COMICS', 'FLOWERS', 'BARBER', 'SHOES', 'RECORDS', 'CAMERAS', 'TACOS', 'BAGELS', 'DUMPLINGS', 'ARCADE', 'GYM', 'CLEANERS',
  'PETS', 'TOYS', 'DONUTS', 'COFFEE', 'HOT DOGS', 'JEWELRY', 'LOCKSMITH', 'GROCERY', 'FISH MARKET', 'TEA HOUSE', 'BIKES', 'HATS',
  'VIDEO GAMES', 'SUBS', 'FALAFEL', 'RAMEN', 'GELATO', 'BOXING', 'TATTOO', 'LUNCH', 'CANDY', 'MUSIC', 'NAILS', 'OPTICIAN', 'KEYS CUT',
  'SALADS', 'BBQ', 'CHECKS CASHED', 'ELECTRONICS', 'THRIFT', 'SUSHI', 'BURGERS', 'WINGS', 'CIGARS', 'PAPERS', 'CUPCAKES', 'PIEROGI',
  'KNISH', 'PRETZELS', 'CHESS'];
export const BILLBOARDS = [['BLAST', 'COLA'], ['NOVA', 'TV'], ['MOON', 'BURGER'], ['ROXXON', 'OIL'], ['HYPER', 'SALE!'], ['ALCHEMAX', ''],
  ['BROADWAY', 'TONIGHT'], ['CHEWY', 'GUM'], ['METRO', 'NEWS'], ['ZAP!', 'SODA'], ['NEON', 'NIGHTS'], ['DAILY', 'BUGLE']];
export const BLADES = ['HOTEL', 'BAR', 'OPEN', 'CAFE', 'LIVE', 'PIZZA', 'DANCE', 'LOANS'];

const BOARD = ['#1f5a3a', '#7a1f24', '#1f2f5a', '#141418', '#e9dcc0', '#b8322a', '#2a6a6c', '#5a2a5a'];
const AD = ['#f5c62a', '#e0343c', '#2bb5e0', '#f05ab8', '#58d06a', '#f58a24'];
const NEON = ['#ff3d7a', '#3dfcff', '#ffe03d', '#7dff5a', '#ff7a2a', '#b77dff'];

let atlas = null;
export function signAtlas() {
  if (atlas) return atlas;
  if (typeof document === 'undefined') {
    atlas = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
    atlas.needsUpdate = true;
    return atlas;
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = 2048;
  atlas = new THREE.CanvasTexture(cv);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.flipY = false;
  atlas.anisotropy = 4;
  paint(cv);
  atlas.needsUpdate = true;
  // Paint again with the comic face once it has loaded (the fallback is Impact). The canvas is kept:
  // a lost WebGL context re-uploads from it.
  document.fonts?.load('64px Bangers').then(() => { paint(cv); atlas.needsUpdate = true; }).catch(() => {});
  return atlas;
}

function fit(g, text, maxW, size, font) {
  let s = size;
  g.font = `${s}px ${font}`;
  while (s > 12 && g.measureText(text).width > maxW) { s -= 2; g.font = `${s}px ${font}`; }
  return s;
}

function paint(cv) {
  const g = cv.getContext('2d');
  const F = 'Bangers, Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.clearRect(0, 0, 2048, 2048);
  // Shop boards: a painted board, an inked border, the name in cream or ink.
  SHOPS.forEach((name, i) => {
    const x = (i % 4) * 512, y = Math.floor(i / 4) * 64;
    const bg = BOARD[i % BOARD.length], light = bg === '#e9dcc0';
    g.fillStyle = bg; g.fillRect(x, y, 512, 64);
    g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, 506, 58);
    g.strokeStyle = light ? '#7a1f24' : '#e9c46a'; g.lineWidth = 2; g.strokeRect(x + 10, y + 10, 492, 44);
    fit(g, name, 440, 46, F);
    g.fillStyle = '#111'; g.fillText(name, x + 258, y + 36);
    g.fillStyle = light ? '#1a1a1a' : '#f4ead2'; g.fillText(name, x + 256, y + 34);
  });
  // Billboards: a bold ground with Ben-Day dots, two lines of outlined words with a drop shadow.
  BILLBOARDS.forEach(([a, b], i) => {
    const x = (i % 3) * 512, y = 1024 + Math.floor(i / 3) * 256;
    const bug = a === 'DAILY';
    const bg = bug ? '#f4f0e6' : AD[i % AD.length];
    g.fillStyle = bg; g.fillRect(x, y, 512, 256);
    g.fillStyle = 'rgba(0,0,0,0.13)';
    for (let yy = 8; yy < 256; yy += 12) for (let xx = (yy / 12) % 2 ? 8 : 14; xx < 512; xx += 12) { g.beginPath(); g.arc(x + xx, y + yy, 2.6, 0, 6.283); g.fill(); }
    g.strokeStyle = '#111'; g.lineWidth = 12; g.strokeRect(x + 6, y + 6, 500, 244);
    const lines = b ? [a, b] : [a];
    lines.forEach((t, k) => {
      const cy = y + (lines.length === 1 ? 128 : k === 0 ? 92 : 178);
      const s = fit(g, t, 440, k === 0 ? 110 : 84, F);
      g.lineJoin = 'round';
      g.fillStyle = '#111'; g.fillText(t, x + 262, cy + 6);
      g.strokeStyle = '#111'; g.lineWidth = Math.max(4, s * 0.09); g.strokeText(t, x + 256, cy);
      g.fillStyle = bug ? (k === 0 ? '#111' : '#c8232c') : k === 0 ? '#ffffff' : '#111';
      g.fillText(t, x + 256, cy);
    });
  });
  // Neon blades: dark backing, letters stacked top to bottom, a bright tube with a white core.
  BLADES.forEach((word, i) => {
    const x = 1536 + (i % 4) * 128, y = 1024 + Math.floor(i / 4) * 512;
    const c = NEON[i % NEON.length];
    g.fillStyle = '#16121c'; g.fillRect(x, y, 128, 512);
    g.strokeStyle = c; g.lineWidth = 5; g.strokeRect(x + 8, y + 8, 112, 496);
    const n = word.length, step = Math.min(96, 470 / n);
    g.font = `${Math.floor(step * 0.95)}px ${F}`;
    [...word].forEach((ch, k) => {
      const cy = y + 256 + (k - (n - 1) / 2) * step;
      g.lineWidth = 10; g.strokeStyle = c; g.strokeText(ch, x + 64, cy);
      g.fillStyle = '#fffbea'; g.fillText(ch, x + 64, cy);
    });
  });
}
