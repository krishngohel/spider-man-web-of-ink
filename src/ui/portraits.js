import { CROWD } from '../story/cast.js';

// Radio portraits, drawn in code as small comic heads (SVG, 100 x 100). Each speaker is a face
// shape plus hair, mask or helmet, and a collar; the ink outline and a halftone shade come free.

const INK = '#12101c';
const dots = `<pattern id="hd" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.4" fill="${INK}" opacity="0.28"/></pattern>`;

function head({ skin = '#e8b48a', w = 30, h = 36, y = 52 }) {
  return `<ellipse cx="50" cy="${y}" rx="${w}" ry="${h}" fill="${skin}" stroke="${INK}" stroke-width="3"/>`
    + `<path d="M${50 + w * 0.2} ${y - h} A ${w} ${h} 0 0 1 ${50 + w} ${y} A ${w} ${h} 0 0 1 ${50 + w * 0.2} ${y + h} Z" fill="url(#hd)"/>`;
}
const eyes = (y = 48, dx = 11, r = 2.6) => `<circle cx="${50 - dx}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${50 + dx}" cy="${y}" r="${r}" fill="${INK}"/>`;
const brows = (y = 41, dx = 11, tilt = 0) => `<path d="M${50 - dx - 7} ${y + tilt} L${50 - dx + 6} ${y - tilt}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M${50 + dx - 6} ${y - tilt} L${50 + dx + 7} ${y + tilt}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
const mouth = (y = 68, w = 9, curve = 3) => `<path d="M${50 - w} ${y} Q50 ${y + curve} ${50 + w} ${y}" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
const collar = (c, c2 = c) => `<path d="M14 100 Q50 78 86 100 Z" fill="${c}" stroke="${INK}" stroke-width="3"/><path d="M42 84 L50 96 L58 84" fill="${c2}" stroke="${INK}" stroke-width="2"/>`;

const FACES = {
  peter: () => collar('#c8202a') + head({ skin: '#d3232e' })
    + `<g stroke="${INK}" stroke-width="1.4" fill="none" opacity="0.8"><path d="M50 16 L50 88"/><path d="M20 52 L80 52"/><path d="M28 26 L72 78"/><path d="M72 26 L28 78"/><ellipse cx="50" cy="52" rx="12" ry="14"/><ellipse cx="50" cy="52" rx="22" ry="25"/></g>`
    + `<path d="M28 40 Q36 34 46 44 Q40 56 30 52 Z" fill="#f4f6fb" stroke="${INK}" stroke-width="3.4"/><path d="M72 40 Q64 34 54 44 Q60 56 70 52 Z" fill="#f4f6fb" stroke="${INK}" stroke-width="3.4"/>`,
  parker: () => collar('#34548a', '#d8d8de') + head({ skin: '#f0c8a4', w: 27 })
    + `<path d="M22 48 Q20 18 50 16 Q80 18 78 46 Q72 30 60 30 Q66 26 56 24 Q44 30 30 32 Q24 38 22 48 Z" fill="#4a3020" stroke="${INK}" stroke-width="3"/>` + eyes(50, 10, 2.4) + brows(43, 10, -1) + mouth(70, 8, 4),
  yuri: () => collar('#1f2c4a', '#d8d8de') + head({ skin: '#ecc7a0', w: 27 })
    + `<path d="M22 50 Q20 16 50 16 Q80 16 78 50 L74 40 Q60 26 30 32 Z" fill="#141418" stroke="${INK}" stroke-width="3"/>` + eyes(50, 10, 2.4) + brows(43, 10, 1.5) + mouth(70, 7, 0),
  mj: () => collar('#2f7a4a') + `<path d="M16 86 Q12 30 50 18 Q88 30 84 86 Z" fill="#c8402a" stroke="${INK}" stroke-width="3"/>` + head({ skin: '#f2cfae', w: 26, h: 33, y: 54 })
    + `<path d="M24 46 Q34 22 58 26 Q72 30 76 46 Q60 34 44 36 Q32 38 24 46 Z" fill="#c8402a" stroke="${INK}" stroke-width="3"/>` + eyes(54, 10, 2.4) + mouth(72, 8, 5),
  may: () => collar('#8a5a8a', '#f4f0e6') + head({ skin: '#efcfb6', w: 27 })
    + `<circle cx="50" cy="16" r="10" fill="#e6e6ea" stroke="${INK}" stroke-width="3"/><path d="M22 50 Q22 20 50 20 Q78 20 78 50 Q70 30 50 30 Q30 30 22 50 Z" fill="#e6e6ea" stroke="${INK}" stroke-width="3"/>`
    + `<g fill="none" stroke="${INK}" stroke-width="2.4"><circle cx="39" cy="50" r="7"/><circle cx="61" cy="50" r="7"/><path d="M46 50 L54 50"/></g>` + eyes(50, 11, 1.8) + mouth(70, 8, 4),
  jameson: () => collar('#4a4a52', '#f4f4f4') + head({ skin: '#e8b48a', w: 29, h: 35 })
    + `<path d="M24 34 L24 18 L76 18 L76 34 Q66 28 50 28 Q34 28 24 34 Z" fill="#2a2a2e" stroke="${INK}" stroke-width="3"/><path d="M19 52 Q19 38 26 34 L28 54 Z M81 52 Q81 38 74 34 L72 54 Z" fill="#d8d8dc" stroke="${INK}" stroke-width="2.4"/>`
    + eyes(48, 11, 2.4) + brows(40, 11, 4) + `<path d="M34 64 Q42 58 50 62 Q58 58 66 64 Q58 68 50 66 Q42 68 34 64 Z" fill="#2a2a2e" stroke="${INK}" stroke-width="2"/>`
    + `<rect x="58" y="69" width="20" height="5" rx="2" fill="#8a5a3a" stroke="${INK}" stroke-width="1.6" transform="rotate(-12 58 69)"/>` + mouth(72, 6, -2),
  kingpin: () => collar('#f2f0e8', '#6a2a6a') + head({ skin: '#e2b088', w: 34, h: 37 }) + eyes(48, 12, 2.2) + brows(41, 12, 3) + mouth(70, 10, -2)
    + `<path d="M18 46 Q16 22 50 16 Q84 22 82 46" fill="none" stroke="${INK}" stroke-width="1.5" opacity="0.4"/>`,
  shocker: () => collar('#8a6030') + head({ skin: '#d8b030' })
    + `<g stroke="${INK}" stroke-width="1.6" opacity="0.7"><path d="M24 30 L76 74"/><path d="M76 30 L24 74"/><path d="M20 52 L50 22 L80 52 L50 84 Z" fill="none"/></g>`
    + `<rect x="32" y="40" width="36" height="13" rx="5" fill="#8a6030" stroke="${INK}" stroke-width="3"/><circle cx="41" cy="46.5" r="3.5" fill="#f2e6a0"/><circle cx="59" cy="46.5" r="3.5" fill="#f2e6a0"/>`,
  vulture: () => `<path d="M8 100 Q20 70 50 76 Q80 70 92 100 Z" fill="#3f6a3a" stroke="${INK}" stroke-width="3"/><path d="M20 84 Q30 64 50 70 Q70 64 80 84" fill="#c8b070" stroke="${INK}" stroke-width="3"/>`
    + head({ skin: '#d8b090', w: 25, h: 36 }) + eyes(48, 9, 2.2) + brows(40, 9, 4) + `<path d="M50 50 L46 62 L52 62" stroke="${INK}" stroke-width="2.4" fill="none"/>` + mouth(72, 7, -2),
  rhino: () => collar('#7a7f86') + head({ skin: '#8a8f96', w: 33, h: 37 })
    + `<path d="M50 30 Q46 12 58 4 Q56 18 60 30 Z" fill="#c8ccd2" stroke="${INK}" stroke-width="3"/><path d="M28 30 Q22 22 24 14 Q32 20 34 28 Z M72 30 Q78 22 76 14 Q68 20 66 28 Z" fill="#7a7f86" stroke="${INK}" stroke-width="2.4"/>`
    + `<ellipse cx="50" cy="66" rx="16" ry="11" fill="#e8b48a" stroke="${INK}" stroke-width="2.6"/>` + eyes(48, 12, 2.6) + brows(41, 12, 5) + mouth(68, 6, -2),
  miles: () => collar('#16161c') + head({ skin: '#16161c' })
    + `<g stroke="#d02030" stroke-width="1.4" fill="none" opacity="0.9"><path d="M50 16 L50 88"/><path d="M20 52 L80 52"/><path d="M28 26 L72 78"/><path d="M72 26 L28 78"/><ellipse cx="50" cy="52" rx="12" ry="14"/><ellipse cx="50" cy="52" rx="22" ry="25"/></g>`
    + `<path d="M28 40 Q36 34 46 44 Q40 56 30 52 Z" fill="#f4f6fb" stroke="${INK}" stroke-width="3.4"/><path d="M72 40 Q64 34 54 44 Q60 56 70 52 Z" fill="#f4f6fb" stroke="${INK}" stroke-width="3.4"/>`,
  electro: () => collar('#2a8a4a', '#f2d030') + head({ skin: '#2a8a4a' })
    + `<path d="M50 6 L58 30 L82 22 L64 40 L86 52 L60 50 L50 30 L40 50 L14 52 L36 40 L18 22 L42 30 Z" fill="#f2d030" stroke="${INK}" stroke-width="3"/>`
    + `<ellipse cx="40" cy="54" rx="6" ry="4" fill="#f4f6fb" stroke="${INK}" stroke-width="2"/><ellipse cx="60" cy="54" rx="6" ry="4" fill="#f4f6fb" stroke="${INK}" stroke-width="2"/>` + mouth(72, 8, -3),
  scorpion: () => collar('#3a7a3a', '#9ab040') + head({ skin: '#3a7a3a', w: 31 })
    + `<path d="M22 44 Q50 30 78 44 L76 58 Q50 50 24 58 Z" fill="#9ab040" stroke="${INK}" stroke-width="3"/><path d="M50 18 L50 34" stroke="${INK}" stroke-width="3"/>`
    + `<path d="M30 46 L46 50 M70 46 L54 50" stroke="#e04a2a" stroke-width="4" stroke-linecap="round"/>` + mouth(72, 8, -2),
  mysterio: () => collar('#3a8a4a', '#6a3a8a') + `<path d="M20 74 Q50 86 80 74" fill="#3a8a4a" stroke="${INK}" stroke-width="3"/>`
    + `<circle cx="50" cy="46" r="32" fill="#d8e8f0" fill-opacity="0.55" stroke="${INK}" stroke-width="3"/><path d="M28 30 Q34 22 44 22" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>`
    + `<g fill="#7ad06a" opacity="0.6"><circle cx="42" cy="54" r="8"/><circle cx="58" cy="48" r="9"/><circle cx="50" cy="38" r="7"/></g>`,
  lizard: () => collar('#f0f0ea') + head({ skin: '#4a8a3a', w: 30, h: 33, y: 50 })
    + `<path d="M50 52 Q86 54 92 66 Q70 76 48 70 Z" fill="#4a8a3a" stroke="${INK}" stroke-width="3"/><path d="M60 68 L64 72 L68 68 L72 72 L76 68" stroke="#fff" stroke-width="2" fill="none"/>`
    + `<ellipse cx="44" cy="42" rx="6" ry="5" fill="#f2d030" stroke="${INK}" stroke-width="2"/><path d="M44 38 L44 46" stroke="${INK}" stroke-width="2.4"/>` + brows(36, 6, 5),
  connors: () => collar('#f2f2ee', '#6a8aa8') + head({ skin: '#ecc7a0', w: 27 })
    + `<path d="M24 40 Q26 20 50 20 Q74 20 76 40 Q64 28 50 28 Q36 28 24 40 Z" fill="#5a3a20" stroke="${INK}" stroke-width="3"/>`
    + `<g fill="none" stroke="${INK}" stroke-width="2.4"><rect x="31" y="44" width="15" height="10" rx="3"/><rect x="54" y="44" width="15" height="10" rx="3"/><path d="M46 49 L54 49"/></g>` + eyes(49, 11, 1.8) + mouth(70, 7, -1),
  kraven: () => collar('#c89a4a', '#1a1210') + head({ skin: '#d8a070', w: 28 })
    + `<path d="M14 64 Q10 20 50 12 Q90 20 86 64 L78 50 Q76 30 50 26 Q24 30 22 50 Z" fill="#2a1a10" stroke="${INK}" stroke-width="3"/>`
    + `<path d="M34 66 Q50 92 66 66 Q60 74 50 74 Q40 74 34 66 Z" fill="#2a1a10" stroke="${INK}" stroke-width="2.6"/>` + eyes(48, 11, 2.4) + brows(40, 11, 5),
  venom: () => collar('#0e0d16') + head({ skin: '#0e0d16', w: 33, h: 37 })
    + `<path d="M24 34 Q34 26 46 42 Q40 54 26 48 Z" fill="#f4f6fb" stroke="${INK}" stroke-width="2"/><path d="M76 34 Q66 26 54 42 Q60 54 74 48 Z" fill="#f4f6fb" stroke="${INK}" stroke-width="2"/>`
    + `<path d="M28 62 Q50 90 72 62 Q50 72 28 62 Z" fill="#c8202a" stroke="#f4f6fb" stroke-width="2"/><path d="M30 63 L34 70 L38 64 L42 72 L46 65 L50 73 L54 65 L58 72 L62 64 L66 70 L70 63" stroke="#f4f6fb" stroke-width="2.4" fill="none"/>`,
  sandman: () => collar('#3a8a4a', '#1a1a1a') + head({ skin: '#d8b080', w: 30 })
    + `<g fill="#c8a060" opacity="0.7"><circle cx="30" cy="70" r="5"/><circle cx="72" cy="66" r="4"/><circle cx="62" cy="80" r="3"/></g>` + eyes(48, 11, 2.4) + brows(41, 11, 3) + mouth(70, 8, -1),
  ock: () => collar('#4a6a3a', '#d8c040') + head({ skin: '#e2b088', w: 31 })
    + `<path d="M22 40 Q24 22 50 20 Q76 22 78 40 Q66 30 50 30 Q34 30 22 40 Z" fill="#2a1a10" stroke="${INK}" stroke-width="3"/>`
    + `<g fill="#1a1a1a" stroke="${INK}" stroke-width="2.4"><circle cx="38" cy="50" r="8"/><circle cx="62" cy="50" r="8"/></g><path d="M46 50 L54 50" stroke="${INK}" stroke-width="2.4"/>` + mouth(72, 9, -3),
  goblin: () => collar('#6a3a8a') + head({ skin: '#4a8a3a', w: 30, h: 36 })
    + `<path d="M20 40 L8 20 L30 34 Z M80 40 L92 20 L70 34 Z" fill="#4a8a3a" stroke="${INK}" stroke-width="3"/><path d="M26 30 Q50 6 74 30 Q50 22 26 30 Z" fill="#6a3a8a" stroke="${INK}" stroke-width="3"/>`
    + `<ellipse cx="38" cy="48" rx="7" ry="5" fill="#f2c230" stroke="${INK}" stroke-width="2"/><ellipse cx="62" cy="48" rx="7" ry="5" fill="#f2c230" stroke="${INK}" stroke-width="2"/>`
    + `<path d="M30 66 Q50 82 70 66 Q50 74 30 66 Z" fill="#1a1a1a" stroke="${INK}" stroke-width="2.4"/><path d="M34 67 L36 72 L40 68 L44 74 L48 69 L52 74 L56 69 L60 74 L64 68 L66 72" stroke="#fff" stroke-width="1.6" fill="none"/>`,
  cop: () => collar('#1f2c4a', '#d8d8de') + head({ skin: '#c99a76', w: 28 })
    + `<path d="M18 34 Q50 4 82 34 L82 40 L18 40 Z" fill="#1f2c4a" stroke="${INK}" stroke-width="3"/><rect x="44" y="24" width="12" height="9" fill="#d8c040" stroke="${INK}" stroke-width="2"/>` + eyes(52, 11, 2.4) + mouth(72, 8, 1),
  robbie: () => collar('#5a5a6a', '#f4f4f4') + head({ skin: '#7a5236', w: 28 }) + `<path d="M24 38 Q26 20 50 20 Q74 20 76 38 Q64 28 50 28 Q36 28 24 38 Z" fill="#d8d8dc" stroke="${INK}" stroke-width="3"/>` + eyes(50, 11, 2.4) + mouth(70, 8, 3),
};

// Everyday people (cast.js CROWD): a face from their look, skin tone, hair and jacket.
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
function crowdFace(d) {
  const t = d.outfit.skin ?? 0.3;
  const mixc = (a, b) => Math.round(a + (b - a) * t);
  const skin = `rgb(${mixc(242, 106)},${mixc(207, 66)},${mixc(174, 40)})`;
  const hair = hex(d.hairColor ?? d.outfit.hat ?? 0x2a1a10);
  const long = (d.gear ?? []).includes('hairLong');
  const back = long ? `<path d="M18 88 Q12 30 50 18 Q88 30 82 88 Z" fill="${hair}" stroke="${INK}" stroke-width="3"/>` : '';
  const top = `<path d="M22 46 Q22 18 50 16 Q78 18 78 46 Q66 30 50 30 Q34 30 22 46 Z" fill="${hair}" stroke="${INK}" stroke-width="3"/>`;
  return collar(hex(d.outfit.jacket), hex(d.outfit.accent ?? d.outfit.jacket)) + back + head({ skin, w: 27, h: 34, y: 54 }) + top + eyes(52, 11, 2.4) + mouth(70, 8, 3);
}

export function portraitSvg(who, broadcast = false) {
  const body = FACES[who] ? FACES[who]() : CROWD[who] ? crowdFace(CROWD[who]) : FACES.cop();
  const bg = broadcast ? '#f7e36a' : '#cfe3f2';
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs>${dots}</defs><rect width="100" height="100" fill="${bg}"/>${body}</svg>`;
}
export const PORTRAITS = Object.keys(FACES);
