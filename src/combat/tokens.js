import { TUNE } from './tuning.js';

// The fight's director (spec 1.1, Insomniac's Melee Manager): one melee attacker at a time on
// every difficulty, the turn handed on (job stealing) every 0.25 s, ranged slots by difficulty, a
// short hold after the player dodges so he gets a few free hits, and the air is safe from fists.

const able = (e) => e.alive && !['out', 'webbed', 'pinned', 'away', 'down', 'getup', 'air', 'stagger'].includes(e.state);

// Keep the attacker unless he is past 6 m or someone is 2 m closer; with none, the nearest.
export function pickMeleeHolder(cands, heroP, current, dist) {
  let best = null, bd = Infinity;
  for (const e of cands) { const d = dist(e); if (d < bd) { bd = d; best = e; } }
  if (!current || !cands.includes(current)) return best;
  const dc = dist(current);
  if (dc > TUNE.tokenFar) return best;
  return best && bd < dc - TUNE.tokenCloser ? best : current;
}

export const rangedSlots = (difficulty) => TUNE.rangedSlots[difficulty] ?? 1;

export const airSafe = (heroY, groundBelow) => heroY - groundBelow > TUNE.airSafe;

// Beat to the punch: the hero's hit lands first, so the enemy's windup is cancelled. Not for heavy
// attacks or bosses, and not when the player repeats one move (no mashing a single button).
export function beatsToPunch({ heroImpactIn, enemyImpactIn, sameMoveRun = 1, heavy = false, boss = false }) {
  if (heavy || boss || sameMoveRun >= TUNE.sameMoveLimit) return false;
  return heroImpactIn <= enemyImpactIn;
}

export function createTokens() {
  let holder = null, repick = 0, hold = 0, slots = 1;
  const ranged = new Set();
  const meleeOK = (e) => able(e) && (!e.A.ranged || e.disarmed);
  return {
    update(dt, list, heroP, { difficulty = 'amazing', groundBelow = 0, dist }) {
      hold = Math.max(0, hold - dt);
      repick -= dt;
      slots = rangedSlots(difficulty);
      if (airSafe(heroP.y, groundBelow)) holder = null;
      else if (repick <= 0 || !holder || !meleeOK(holder)) { holder = pickMeleeHolder(list.filter(meleeOK), heroP, holder, dist); repick = TUNE.tokenRepick; }
      for (const e of [...ranged]) if (!able(e) || (e.state !== 'windup' && e.state !== 'strike')) ranged.delete(e);
    },
    mayMelee(e) { return hold <= 0 && e === holder; },
    // Claims a ranged slot (kept while that enemy winds up and fires).
    mayRanged(e) {
      if (hold > 0) return false;
      if (ranged.has(e)) return true;
      if (ranged.size >= slots) return false;
      ranged.add(e);
      return true;
    },
    holdAll(s) { hold = Math.max(hold, s); },
    get held() { return hold > 0; },
    get holder() { return holder; },
  };
}
