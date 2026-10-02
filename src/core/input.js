import { PAD } from './bindings.js';

// Action-based input over keyboard, mouse (pointer lock) and the Gamepad API. Keyboard and mouse
// follow the rebindable settings; the gamepad uses the fixed layout in bindings.PAD. Per frame:
// update(dt) first, read actions, then endFrame().

const DEADZONE = 0.18;
const TRIGGER = 0.3;

export function padActions(pad, out = new Set()) {
  out.clear();
  if (!pad) return out;
  const btn = (i) => { const b = pad.buttons[i]; return !!b && (b.pressed || b.value > TRIGGER); };
  if (btn(PAD.jump)) out.add('jump');
  if (btn(PAD.dive)) out.add('dive');
  if (btn(PAD.hang)) out.add('hang');
  if (btn(PAD.attack)) out.add('attack');
  if (btn(PAD.web)) out.add('web');
  if (btn(PAD.finisher)) out.add('finisher');
  if (btn(PAD.gadget)) out.add('gadget');
  if (btn(PAD.suitPower)) out.add('suitPower');
  if (btn(PAD.help)) out.add('help');
  if (btn(PAD.map)) out.add('map');
  if (btn(PAD.pause)) out.add('pause');
  // LT + RT is a zip; RT alone is swing.
  if (btn(PAD.swing)) out.add(btn(PAD.zipHold) ? 'zip' : 'swing');
  return out;
}

export function createInput({ target = window, bindings }) {
  const held = new Set();
  const pressedCodes = new Set();
  const releasedCodes = new Set();
  const padHeld = new Set();
  const padPressed = new Set();
  const padReleased = new Set();
  let codeToActions = new Map();
  let capture = null;
  let device = 'kbm';
  let enabled = true;
  const move = { x: 0, y: 0 };
  const look = { dx: 0, dy: 0 };
  const stick = { mx: 0, my: 0, lx: 0, ly: 0 };
  const now = new Set();

  function setBindings(b) {
    codeToActions = new Map();
    for (const [action, codes] of Object.entries(b)) {
      for (const c of codes) {
        if (!codeToActions.has(c)) codeToActions.set(c, []);
        codeToActions.get(c).push(action);
      }
    }
  }
  setBindings(bindings);

  function codeDown(code, e) {
    device = 'kbm';
    if (capture) {
      // The key belongs to the rebind screen: nothing else (like Esc closing the menu) sees it.
      e?.preventDefault();
      e?.stopImmediatePropagation();
      const cb = capture;
      capture = null;
      cb(code === 'Escape' ? null : code);
      return;
    }
    if (!enabled) return;
    if (codeToActions.has(code) && e && code !== 'Escape' && !e.ctrlKey && !e.metaKey) e.preventDefault();
    if (!held.has(code)) pressedCodes.add(code);
    held.add(code);
  }
  function codeUp(code) { if (held.delete(code)) releasedCodes.add(code); }

  const typing = (e) => !!e.target?.closest?.('input[type="text"], textarea');
  const onKeyDown = (e) => { if (typing(e)) return; if (!e.repeat) codeDown(e.code, e); else if (codeToActions.has(e.code)) e.preventDefault(); };
  const onKeyUp = (e) => codeUp(e.code);
  const onMouseDown = (e) => {
    if (e.target?.closest?.('.menu, .panel')) { if (capture) codeDown('Mouse' + e.button, e); return; }
    codeDown('Mouse' + e.button, e);
  };
  const onMouseUp = (e) => codeUp('Mouse' + e.button);
  const onMouseMove = (e) => { if (document.pointerLockElement) { look.dx += e.movementX; look.dy += e.movementY; device = 'kbm'; } };
  const onBlur = () => { for (const c of held) releasedCodes.add(c); held.clear(); };
  const onContext = (e) => e.preventDefault();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  // Capture phase: input records a click before the canvas's own listener runs, so a click that
  // only re-grabs the pointer can be swallowed there (bubble order ran it too late).
  target.addEventListener('mousedown', onMouseDown, true);
  target.addEventListener('mouseup', onMouseUp);
  target.addEventListener('mousemove', onMouseMove);
  target.addEventListener('contextmenu', onContext);
  window.addEventListener('blur', onBlur);

  const anyCode = (set, action) => {
    for (const [code, actions] of codeToActions) if (actions.includes(action) && set.has(code)) return true;
    return false;
  };
  const dz = (v) => (Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE));

  function pollPad() {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p && p.connected) ?? null;
    padActions(pad, now);
    if (pad) {
      stick.mx = dz(pad.axes[0] ?? 0); stick.my = dz(pad.axes[1] ?? 0);
      stick.lx = dz(pad.axes[2] ?? 0); stick.ly = dz(pad.axes[3] ?? 0);
      if (now.size || stick.mx || stick.my || stick.lx || stick.ly) device = 'pad';
    } else { stick.mx = stick.my = stick.lx = stick.ly = 0; }
    if (!enabled) { now.clear(); padHeld.clear(); }
    for (const a of now) if (!padHeld.has(a)) padPressed.add(a);
    for (const a of padHeld) if (!now.has(a)) padReleased.add(a);
    padHeld.clear();
    for (const a of now) padHeld.add(a);
  }

  return {
    get device() { return device; },
    move, look,
    get stick() { return stick; },
    down: (a) => anyCode(held, a) || padHeld.has(a),
    pressed: (a) => anyCode(pressedCodes, a) || padPressed.has(a),
    released: (a) => anyCode(releasedCodes, a) || padReleased.has(a),
    // Drops a code's buffered press without touching `held`: a click that only re-acquired
    // pointer lock (Safari needs a real user gesture) must not also fire the action bound to it.
    swallowCode(code) { pressedCodes.delete(code); },
    setBindings,
    captureNext(cb) { capture = cb; },
    cancelCapture() { capture = null; },
    get capturing() { return capture !== null; },
    setEnabled(v) {
      if (v && !enabled) {
        // A pad button still held from the menu (A on RESUME) must not count as a fresh press.
        const pads = navigator.getGamepads?.() ?? [];
        padActions([...pads].find((p) => p && p.connected) ?? null, now);
        padHeld.clear();
        for (const a of now) padHeld.add(a);
      }
      enabled = v;
      if (!v) onBlur();
    },
    update(dt) {
      pollPad();
      const kx = (anyCode(held, 'right') ? 1 : 0) - (anyCode(held, 'left') ? 1 : 0);
      const ky = (anyCode(held, 'forward') ? 1 : 0) - (anyCode(held, 'back') ? 1 : 0);
      move.x = kx + stick.mx;
      move.y = ky - stick.my;
      const len = Math.hypot(move.x, move.y);
      if (len > 1) { move.x /= len; move.y /= len; }
      look.dx += stick.lx * 900 * dt;
      look.dy += stick.ly * 700 * dt;
    },
    endFrame() {
      pressedCodes.clear(); releasedCodes.clear(); padPressed.clear(); padReleased.clear();
      look.dx = 0; look.dy = 0;
    },
    releaseAll() { onBlur(); padHeld.clear(); },
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('mousedown', onMouseDown, true);
      target.removeEventListener('mouseup', onMouseUp);
      target.removeEventListener('mousemove', onMouseMove);
      target.removeEventListener('contextmenu', onContext);
      window.removeEventListener('blur', onBlur);
    },
  };
}
