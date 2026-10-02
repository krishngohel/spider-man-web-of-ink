import { el } from './dom.js';

// Oscorp research puzzles (spec 11): pipes (turn the tiles until the flow reaches the outlet),
// a circuit (set the resistors to the target), and the bridge cable (set two cable lengths so they
// share a hanging load evenly; the tensions come from real statics). puzzle(kind) resolves true when
// solved, false when abandoned (Esc).

const N = 5;
// Pipe tiles as open sides: 1 up, 2 right, 4 down, 8 left.
const rot = (m) => ((m << 1) | (m >> 3)) & 15;

export function solvePipes(grid) {
  // Flow from the left of row 2 to the right of row 2.
  const seen = new Set();
  const stack = [[2, 0, 8]];
  while (stack.length) {
    const [r, c, from] = stack.pop();
    if (r < 0 || c < 0 || r >= N || c >= N) continue;
    const m = grid[r][c];
    if (!(m & from)) continue;
    const key = r * N + c;
    if (seen.has(key)) continue;
    seen.add(key);
    if (c === N - 1 && r === 2 && (m & 2)) return true;
    if (m & 1) stack.push([r - 1, c, 4]);
    if (m & 2) stack.push([r, c + 1, 8]);
    if (m & 4) stack.push([r + 1, c, 1]);
    if (m & 8) stack.push([r, c - 1, 2]);
  }
  return false;
}

export function makePipes(rand = Math.random) {
  // A random walk from (2,0) to (2,4) without revisiting, then the tiles it needs.
  const grid = Array.from({ length: N }, () => Array(N).fill(0));
  let path = null;
  for (let tries = 0; tries < 200 && !path; tries++) {
    const p = [[2, 0]], seen = new Set(['2,0']);
    while (p.length < 40) {
      const [r, c] = p[p.length - 1];
      if (r === 2 && c === N - 1) { path = p; break; }
      const opts = [[r - 1, c], [r + 1, c], [r, c + 1], [r, c + 1], [r, c - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seen.has(`${a},${b}`));
      if (!opts.length) break;
      const nxt = opts[Math.floor(rand() * opts.length)];
      seen.add(`${nxt[0]},${nxt[1]}`);
      p.push(nxt);
    }
  }
  const dirBit = (a, b) => (b[0] < a[0] ? 1 : b[1] > a[1] ? 2 : b[0] > a[0] ? 4 : 8);
  path.forEach((cell, i) => {
    const prev = i ? path[i - 1] : [cell[0], cell[1] - 1];
    const next = i < path.length - 1 ? path[i + 1] : [cell[0], cell[1] + 1];
    grid[cell[0]][cell[1]] = dirBit(cell, prev) | dirBit(cell, next);
  });
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) grid[r][c] = rand() < 0.5 ? 5 : 3;
  // Scramble: turn every tile a random number of quarter turns (re-roll if it starts solved).
  do { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (let k = Math.floor(rand() * 4); k > 0; k--) grid[r][c] = rot(grid[r][c]); } while (solvePipes(grid));
  return grid;
}

// The cable: anchors at (-a, 0) and (a, 0), a load W hanging where the cables meet. Returns the
// meeting point and both tensions (statics: T1 u1 + T2 u2 + (0, -W) = 0), or null if they cannot meet.
export function cableStatics(L1, L2, a = 4, W = 10) {
  const d = 2 * a;
  if (L1 + L2 <= d || Math.abs(L1 - L2) >= d) return null;
  const x = (L1 * L1 - L2 * L2) / (2 * d); // from the middle
  const y = Math.sqrt(Math.max(0, L1 * L1 - (x + a) ** 2));
  const u1 = { x: (-a - x) / L1, y: y / L1 }, u2 = { x: (a - x) / L2, y: y / L2 }; // toward each anchor
  const det = u1.x * u2.y - u2.x * u1.y;
  const T1 = (0 * u2.y - W * u2.x) / det, T2 = (u1.x * W - u1.y * 0) / det;
  return { x, y: -y, T1: Math.abs(T1), T2: Math.abs(T2) };
}

export function createPuzzles(root, { onSound = () => {} } = {}) {
  const box = el('div', { class: 'puzzle hidden' });
  root.append(box);
  let done = null;
  const close = (ok) => { box.classList.add('hidden'); box.replaceChildren(); window.removeEventListener('keydown', esc, true); const r = done; done = null; r?.(ok); };
  const esc = (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
  const card = (title, help, body) => { box.replaceChildren(el('div', { class: 'card' }, [el('h2', {}, title), el('p', { class: 'phelp' }, help), body, el('p', { class: 'phelp' }, 'Esc to walk away.')])); };

  function pipes() {
    const grid = makePipes();
    const board = el('div', { class: 'pipes' });
    const draw = () => {
      board.replaceChildren(...grid.flatMap((row, r) => row.map((m, c) => {
        const t = el('button', { class: 'pipe', 'aria-label': `tile ${r + 1} ${c + 1}` });
        t.innerHTML = `<svg viewBox="0 0 40 40">${m & 1 ? '<rect x="16" y="0" width="8" height="24"/>' : ''}${m & 2 ? '<rect x="16" y="16" width="24" height="8"/>' : ''}${m & 4 ? '<rect x="16" y="16" width="8" height="24"/>' : ''}${m & 8 ? '<rect x="0" y="16" width="24" height="8"/>' : ''}</svg>`;
        t.addEventListener('click', () => { grid[r][c] = rot(grid[r][c]); onSound('radio'); draw(); if (solvePipes(grid)) { onSound('stamp'); setTimeout(() => close(true), 400); } });
        return t;
      })));
    };
    draw();
    card('OSCORP: COOLANT PIPES', 'Click tiles to turn them. Connect the inlet on the left to the outlet on the right.', board);
  }

  function circuit() {
    const target = 10 + Math.floor(Math.random() * 18);
    const vals = [1, 1, 1, 1];
    const read = el('div', { class: 'pread' });
    const rows = vals.map((v, i) => {
      const s = el('input', { type: 'range', min: 1, max: 9, step: 1, value: v });
      s.addEventListener('input', () => { vals[i] = Number(s.value); update(); });
      return el('div', { class: 'row' }, [el('span', {}, `Resistor ${i + 1}`), s]);
    });
    function update() {
      const sum = vals.reduce((a, b) => a + b, 0);
      read.textContent = `Total ${sum} ohms. Target ${target} ohms.`;
      read.classList.toggle('ok', sum === target);
      if (sum === target) { onSound('stamp'); setTimeout(() => { if (done) close(true); }, 500); }
    }
    card('OSCORP: POWER RELAY', 'Set the four resistors in series to exactly the target.', el('div', {}, [...rows, read]));
    update();
  }

  function cable() {
    let L1 = 5, L2 = 7;
    const svg = el('div', { class: 'pcable' });
    const read = el('div', { class: 'pread' });
    const s1 = el('input', { type: 'range', min: 4.2, max: 9, step: 0.1, value: L1 });
    const s2 = el('input', { type: 'range', min: 4.2, max: 9, step: 0.1, value: L2 });
    s1.addEventListener('input', () => { L1 = Number(s1.value); update(); });
    s2.addEventListener('input', () => { L2 = Number(s2.value); update(); });
    function update() {
      const st = cableStatics(L1, L2);
      if (!st) { read.textContent = 'The cables cannot reach each other.'; return; }
      const sx = (v) => 100 + v * 18, sy = (v) => 20 - v * 18;
      const bal = Math.abs(st.T1 - st.T2) / 10;
      const ok = bal < 0.06 && -st.y > 2;
      svg.innerHTML = `<svg viewBox="0 0 200 190"><line x1="${sx(-4)}" y1="${sy(0)}" x2="${sx(st.x)}" y2="${sy(st.y)}" stroke="${st.T1 > st.T2 * 1.06 ? '#d3232e' : '#12101c'}" stroke-width="${2 + st.T1 / 4}"/><line x1="${sx(4)}" y1="${sy(0)}" x2="${sx(st.x)}" y2="${sy(st.y)}" stroke="${st.T2 > st.T1 * 1.06 ? '#d3232e' : '#12101c'}" stroke-width="${2 + st.T2 / 4}"/><rect x="${sx(st.x) - 10}" y="${sy(st.y)}" width="20" height="16" fill="#f2c230" stroke="#12101c" stroke-width="2"/><circle cx="${sx(-4)}" cy="${sy(0)}" r="5"/><circle cx="${sx(4)}" cy="${sy(0)}" r="5"/></svg>`;
      read.textContent = `Left cable ${st.T1.toFixed(1)} kN, right cable ${st.T2.toFixed(1)} kN.`;
      read.classList.toggle('ok', ok);
      if (ok) { onSound('stamp'); setTimeout(() => { if (done) close(true); }, 600); }
    }
    card('OSCORP: BRIDGE CABLE', 'Set the two cable lengths so they share the load evenly (equal tension) and the load hangs low.', el('div', {}, [svg, el('div', { class: 'row' }, [el('span', {}, 'Left cable'), s1]), el('div', { class: 'row' }, [el('span', {}, 'Right cable'), s2]), read]));
    update();
  }

  return {
    get open() { return !!done; },
    play(kind) {
      box.classList.remove('hidden');
      window.addEventListener('keydown', esc, true);
      if (kind === 'pipes') pipes(); else if (kind === 'circuit') circuit(); else cable();
      return new Promise((r) => { done = r; });
    },
    close,
  };
}
