import { TUNE } from './tuning.js';

// The fight's director (spec 1.1, Insomniac's Melee Manager, opened up by the fix spec B6): melee
// slots by difficulty (two on Amazing), the turns handed on (job stealing) every 0.25 s, a gap
// between two windups so one dodge clears both, ranged slots by difficulty, a short hold after the
// player dodges, and the air is safe from fists.

const able = (e) => e.alive && !['out', 'webbed', 'pinned', 'away', 'down', 'getup', 'air', 'stagger', 'stunned'].includes(e.state);

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
export const meleeSlots = (difficulty) => TUNE.meleeSlots[difficulty] ?? 1;

// Measured from the feet (the body's centre rides 0.9 m over them).
export const airSafe = (heroY, groundBelow) => heroY - 0.9 - groundBelow > TUNE.airSafe;

// Beat to the punch: the hero's hit lands first, so the enemy's windup is cancelled. Not for heavy
// attacks or bosses, and not when the player repeats one move (no mashing a single button).
export function beatsToPunch({ heroImpactIn, enemyImpactIn, sameMoveRun = 1, heavy = false, boss = false }) {
  if (heavy || boss || sameMoveRun >= TUNE.sameMoveLimit) return false;
  return heroImpactIn <= enemyImpactIn;
}

export function createTokens() {
  let holders = [], repick = 0, hold = 0, slots = 1, sinceStart = 9;
  const ranged = new Set();
  const meleeOK = (e) => able(e) && (!e.A.ranged || e.disarmed);
  return {
    update(dt, list, heroP, { difficulty = 'amazing', groundBelow = 0, dist }) {
      hold = Math.max(0, hold - dt);
      repick -= dt;
      sinceStart += dt;
      slots = rangedSlots(difficulty);
      const ms = meleeSlots(difficulty);
      // The air is safe from fists, not from whips (the anti-air enemy, as in Insomniac's games).
      if (airSafe(heroP.y, groundBelow)) holders = list.filter((e) => e.arch === 'whip' && meleeOK(e)).slice(0, ms);
      else if (repick <= 0 || holders.length < ms || holders.some((h) => !meleeOK(h))) {
        const cands = list.filter(meleeOK), prev = holders;
        const first = pickMeleeHolder(cands, heroP, prev[0] ?? null, dist);
        holders = first ? [first] : [];
        const rest = cands.filter((e) => e !== first).sort((a, b) => dist(a) - dist(b));
        for (const h of prev.slice(1)) if (holders.length < ms && rest.includes(h) && dist(h) <= TUNE.tokenFar) holders.push(h);
        for (const e of rest) { if (holders.length >= ms) break; if (!holders.includes(e)) holders.push(e); }
        repick = TUNE.tokenRepick;
      }
      for (const e of [...ranged]) if (!able(e) || (e.state !== 'windup' && e.state !== 'strike')) ranged.delete(e);
    },
    // Asked only when the enemy is ready and in reach; a yes starts his windup, so the next fist
    // waits meleeGap.
    mayMelee(e) {
      if (hold > 0 || !holders.includes(e) || sinceStart < TUNE.meleeGap) return false;
      sinceStart = 0;
      return true;
    },
    isHolder(e) { return holders.includes(e); },
    // Claims a ranged slot (kept while that enemy winds up and fires).
    mayRanged(e) {
      if (hold > 0) return false;
      if (ranged.has(e)) return true;
      if (ranged.size >= slots) return false;
      ranged.add(e);
      return true;
    },
    // A dodge's breather; dodging again inside it does not stretch it (no dodging forever).
    holdAll(s) { if (hold <= 0) hold = s; },
    get held() { return hold > 0; },
    get holder() { return holders[0] ?? null; },
  };
}
