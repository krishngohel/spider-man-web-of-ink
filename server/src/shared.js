// Relay constants and the join code generator (a Worker's main module may only export handlers).

export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 5;
export const MAX_MESSAGE = 4096;
export const MAX_RATE = 60;          // messages per second per player
export const JOIN_LIMIT = 10;        // join attempts per minute per IP
// Join codes: letters and digits that cannot be mistaken for each other (no 0/O, 1/I/L, 5/S, 2/Z, 8/B).
export const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';

export function makeCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}
