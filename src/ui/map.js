import { el } from './dom.js';
import { LAND } from '../world/city.js';
import { COPY } from './copy.js';

// The city map (spec section 15): a printed comic map of the whole city, drawn once from the city
// data, with districts, landmarks, subway stations (found ones can be ridden to), the hero and a
// waypoint. Drag to pan, wheel to zoom, click to set a waypoint, click a found station to travel.

const PX = 4; // metres per base-map pixel
const DISTRICT_TINT = {
  midtown: '#c9b28c', hells: '#b98a72', harbor: '#9aa4a8', neon: '#d6a6c4', financial: '#bfb8a2',
  harlem: '#b07a62', chinatown: '#c98e6a', upper: '#d2c49a', queens: '#cfd8a8', park: '#7cb35c',
};

export function createMap(root, city, { onTravel, onWaypoint }) {
  const canvas = el('canvas', { class: 'map-canvas' });
  const info = el('div', { class: 'map-info' });
  const close = el('button', { class: 'mbtn map-close' }, COPY.map.close);
  const panel = el('div', { class: 'map hidden' }, [canvas, info, close]);
  root.append(panel);
  const ctx = canvas.getContext('2d');
  const L = city.land;
  const W = Math.round((L.w * L.cell) / PX), H = Math.round((L.h * L.cell) / PX);
  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  drawBase(base.getContext('2d'));

  const view = { cx: 0, cz: 0, zoom: 1 };
  let open = false, hero = { x: 0, z: 0, yaw: 0 }, stations = new Set(), waypoint = null, hover = null, icons = [];
  const ICON = { base: ['#d3232e', 'H'], race: ['#5ad0ff', 'R'], challenge: ['#f2c230', 'T'], research: ['#2a5a9a', 'O'], backpack: ['#c8202a', 'B'], mission: ['#f7e36a', '!'] };
  const toScreen = (x, z) => {
    const s = view.zoom / PX;
    return [canvas.width / 2 + (x - view.cx) * s, canvas.height / 2 + (z - view.cz) * s];
  };
  const toWorld = (sx, sy) => {
    const s = view.zoom / PX;
    return [view.cx + (sx - canvas.width / 2) / s, view.cz + (sy - canvas.height / 2) / s];
  };

  function drawBase(g) {
    // Land and water from the land map.
    const img = g.createImageData(W, H);
    const col = { [LAND.water]: [74, 140, 196], [LAND.city]: [226, 214, 188], [LAND.park]: [124, 179, 92], [LAND.plaza]: [222, 196, 160], [LAND.pier]: [150, 118, 88], [LAND.yard]: [180, 176, 160], [LAND.suburb]: [196, 214, 160] };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const wx = L.minX + x * PX, wz = L.minZ + y * PX;
      const t = city.landAt(wx, wz);
      const c = col[t] ?? col[LAND.city];
      // Water gets the comic wave hatching.
      const hatch = t === LAND.water && ((x + y * 2) % 9 === 0) ? 18 : 0;
      const i = (y * W + x) * 4;
      img.data[i] = c[0] + hatch; img.data[i + 1] = c[1] + hatch; img.data[i + 2] = c[2] + hatch; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // Buildings: footprints in the district's tint with an ink edge, darker for taller ones.
    g.lineWidth = 0.6;
    g.strokeStyle = '#1a1622';
    for (const b of city.boxes) {
      if (b.kind !== 'building' || b.min[1] > 1) continue;
      const x = (b.min[0] - L.minX) / PX, y = (b.min[2] - L.minZ) / PX, w = (b.max[0] - b.min[0]) / PX, h = (b.max[2] - b.min[2]) / PX;
      const tall = Math.min(1, b.max[1] / 160);
      g.fillStyle = shade(DISTRICT_TINT[b.district] ?? '#c0b090', 1 - tall * 0.45);
      g.fillRect(x, y, w, h);
      if (w > 2 && h > 2) g.strokeRect(x, y, w, h);
    }
    for (const b of city.boxes) {
      if (b.kind !== 'tree') continue;
      g.fillStyle = '#3f7a34';
      g.fillRect((b.min[0] - L.minX) / PX - 0.6, (b.min[2] - L.minZ) / PX - 0.6, 1.4, 1.4);
    }
    // District names, big and inked.
    g.textAlign = 'center';
    g.font = '28px Bangers, Impact, sans-serif';
    for (const d of city.districts) {
      const x = ((d.minX + d.maxX) / 2 - L.minX) / PX, y = (d.minZ + 90 - L.minZ) / PX;
      g.lineWidth = 5; g.strokeStyle = '#1a1622'; g.strokeText(d.name.toUpperCase(), x, y);
      g.fillStyle = '#f7e36a'; g.fillText(d.name.toUpperCase(), x, y);
    }
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * k), gg = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
    return `rgb(${r},${gg},${b})`;
  }

  function draw() {
    if (!open) return;
    const w = canvas.width = canvas.clientWidth * devicePixelRatio, h = canvas.height = canvas.clientHeight * devicePixelRatio;
    ctx.fillStyle = '#4a8cc4';
    ctx.fillRect(0, 0, w, h);
    const [ox, oy] = toScreen(L.minX, L.minZ);
    ctx.imageSmoothingEnabled = view.zoom < 1.5;
    ctx.drawImage(base, ox, oy, W * view.zoom, H * view.zoom);
    const dpr = devicePixelRatio;
    // Landmarks.
    ctx.font = `${13 * dpr}px Bangers, Impact, sans-serif`;
    ctx.textAlign = 'center';
    for (const l of city.landmarks) {
      const [x, y] = toScreen(l.x, l.z);
      ctx.fillStyle = '#d8392b'; ctx.strokeStyle = '#1a1622'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (view.zoom > 0.8) { ctx.lineWidth = 3 * dpr; ctx.strokeText(l.name, x, y - 10 * dpr); ctx.fillStyle = '#fff'; ctx.fillText(l.name, x, y - 10 * dpr); }
    }
    // Stations: green subway globes, hollow until found.
    for (const s of city.stations) {
      const [x, y] = toScreen(s.x, s.z);
      const found = stations.has(s.id);
      ctx.fillStyle = found ? '#2e9d5f' : 'rgba(255,255,255,0.6)';
      ctx.strokeStyle = '#1a1622'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(x, y, (hover === s ? 9 : 7) * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = found ? '#fff' : '#1a1622';
      ctx.font = `${10 * dpr}px Bangers, Impact, sans-serif`;
      ctx.fillText('S', x, y + 3.5 * dpr);
    }
    // What is left to do: hideouts, races, Taskmaster, research, backpacks found nearby, the mission.
    for (const ic of icons) {
      const [x, y] = toScreen(ic.x, ic.z);
      const [col, ch] = ICON[ic.kind] ?? ['#fff', '?'];
      const r = (ic.kind === 'backpack' ? 4.5 : ic.kind === 'mission' ? 9 : 6.5) * dpr;
      ctx.globalAlpha = ic.done ? 0.45 : 1;
      ctx.fillStyle = col; ctx.strokeStyle = '#1a1622'; ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.rect(x - r, y - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
      if (ic.kind !== 'backpack') { ctx.fillStyle = '#1a1622'; ctx.font = `${10 * dpr}px Bangers, Impact, sans-serif`; ctx.fillText(ch, x, y + 3.5 * dpr); }
      ctx.globalAlpha = 1;
    }
    // Waypoint.
    if (waypoint) {
      const [x, y] = toScreen(waypoint.x, waypoint.z);
      ctx.fillStyle = '#f7e36a'; ctx.strokeStyle = '#1a1622'; ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 8 * dpr, y - 18 * dpr); ctx.lineTo(x + 8 * dpr, y - 18 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // The hero: a red arrow.
    const [hx, hy] = toScreen(hero.x, hero.z);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-hero.yaw + Math.PI);
    ctx.fillStyle = '#d3232e'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(0, -11 * dpr); ctx.lineTo(8 * dpr, 9 * dpr); ctx.lineTo(0, 4 * dpr); ctx.lineTo(-8 * dpr, 9 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    info.textContent = hover ? (stations.has(hover.id) ? `${hover.name}: ${COPY.map.ride}` : `${hover.name}: ${COPY.map.notFound}`) : COPY.map.hint;
    requestAnimationFrame(draw);
  }

  // Input.
  let drag = null;
  const stationAt = (sx, sy) => city.stations.find((s) => { const [x, y] = toScreen(s.x, s.z); return Math.hypot(x - sx, y - sy) < 12 * devicePixelRatio; }) ?? null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    hover = stationAt((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio);
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    const s = view.zoom / PX / devicePixelRatio;
    view.cx = drag.cx - dx / s; view.cz = drag.cz - dy / s;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) {
      const r = canvas.getBoundingClientRect();
      const sx = (e.clientX - r.left) * devicePixelRatio, sy = (e.clientY - r.top) * devicePixelRatio;
      const st = stationAt(sx, sy);
      if (st && stations.has(st.id)) onTravel(st);
      else { const [x, z] = toWorld(sx, sy); waypoint = waypoint && Math.hypot(waypoint.x - x, waypoint.z - z) < 30 ? null : { x, z }; onWaypoint(waypoint); }
    }
    drag = null;
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom = Math.min(4, Math.max(0.35, view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); }, { passive: false });
  close.addEventListener('click', () => api.hide());

  const api = {
    get open() { return open; },
    show(h, found, wp, extra = []) {
      hero = h; stations = new Set(found); waypoint = wp; icons = extra;
      view.cx = h.x; view.cz = h.z; view.zoom = 1;
      open = true; panel.classList.remove('hidden');
      requestAnimationFrame(draw);
    },
    hide() { open = false; panel.classList.add('hidden'); api.onClose?.(); },
    onClose: null,
  };
  return api;
}
