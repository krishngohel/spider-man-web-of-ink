import { newSave } from '../core/save.js';
import { SKILLS, SUITS } from './progression.js';
import { GADGETS } from '../combat/gadgets.js';

// The multiplayer sandbox (spec 14.1): every skill, suit and gadget open, at the top level. Never
// written to a save slot.
export function unlockedSave() {
  const s = newSave(0);
  const p = s.progress;
  p.level = 50; p.xp = 0; p.skillPoints = 0;
  p.skills = SKILLS.map((k) => k.id);
  p.suits = SUITS.map((k) => k.id);
  p.gadgets = Object.fromEntries(GADGETS.map((g) => [g.id, 3]));
  return s;
}
