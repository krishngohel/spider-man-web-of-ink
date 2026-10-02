// Rebindable actions. Codes are KeyboardEvent.code values, or Mouse0/1/2 for mouse buttons.
export const ACTIONS = [
  { id: 'forward', label: 'Move forward', group: 'Move' },
  { id: 'back', label: 'Move back', group: 'Move' },
  { id: 'left', label: 'Move left', group: 'Move' },
  { id: 'right', label: 'Move right', group: 'Move' },
  { id: 'swing', label: 'Swing (hold in the air), parkour run and wall run (hold)', group: 'Move' },
  { id: 'jump', label: 'Jump. While swinging: hold to reel in, tap to flick', group: 'Move' },
  { id: 'zip', label: 'Web zip to where the camera points', group: 'Move' },
  { id: 'dive', label: 'Dive (hold in the air)', group: 'Move' },
  { id: 'help', label: 'Controls help', group: 'Other' },
  { id: 'pause', label: 'Pause and settings', group: 'Other' },
];

export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  swing: ['ShiftLeft'],
  jump: ['Space'],
  zip: ['KeyQ'],
  dive: ['KeyC'],
  help: ['KeyH'],
  pause: ['Escape', 'KeyP'],
};

// Gamepad (standard mapping): fixed layout, shown on the controls screen.
export const PAD = {
  jump: 0,      // A / Cross
  dive: 1,      // B / Circle
  zipHold: 6,   // LT / L2 (with RT: zip)
  swing: 7,     // RT / R2
  help: 8,      // Back / Share
  pause: 9,     // Start / Options
};

const NAMED = {
  Mouse0: 'Left mouse', Mouse1: 'Middle mouse', Mouse2: 'Right mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
  Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
  ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl',
  AltLeft: 'Alt', AltRight: 'Right Alt', CapsLock: 'Caps Lock', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: String.fromCharCode(92),
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
};

export function keyLabel(code) {
  if (!code) return 'Unbound';
  if (NAMED[code]) return NAMED[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  return code;
}

// Returns new bindings with `code` as the primary key of `action`. If another action used that
// code, it gets this action's old primary key instead, so nothing is left unbound.
// Keys the browser itself treats specially: they stay where they are.
export const RESERVED = ['Escape'];

export function rebind(bindings, action, code) {
  if (RESERVED.includes(code)) return bindings;
  const out = {};
  const old = bindings[action]?.[0];
  for (const [a, codes] of Object.entries(bindings)) {
    const had = codes.includes(code) && a !== action;
    out[a] = codes.filter((c) => c !== code);
    if (had && old && old !== code && !RESERVED.includes(old) && !out[a].includes(old)) out[a].unshift(old);
  }
  const rest = (bindings[action] ?? []).slice(1);
  out[action] = [code, ...rest.filter((c) => c !== code)];
  return out;
}

export function bindingLabel(bindings, action) {
  const codes = bindings[action] ?? [];
  return codes.length ? keyLabel(codes[0]) : 'Unbound';
}
