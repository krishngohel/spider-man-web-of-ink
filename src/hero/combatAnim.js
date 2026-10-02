import { MOVES, clipTiming, clipTimeAt } from '../combat/moves.js';

// The hero's fighting clips (spec 2.4): each move's clip is driven frame by frame so its contact
// frame lands exactly on the move's impact, the wind-up accelerating into it and the recovery
// easing out (speed curves); a web strike holds its reach until it arrives. While a move plays the
// procedural swing body stands aside, on the ground and in the air alike.

export function createCombatAnim(animator) {
  let cur = null;
  return {
    start(e) {
      const M = MOVES[e.key];
      if (!M || !animator.has(e.clip)) { cur = null; return; }
      const action = animator.play(e.clip, { once: true, fade: 0.05, timeScale: 0 });
      cur = { action, M, tm: clipTiming(e.clip, animator.duration(e.clip)), t: 0, arrivedAt: null };
      action.time = cur.tm.start;
    },
    arrive() { if (cur && cur.M.travel && cur.arrivedAt === null) cur.arrivedAt = cur.t; },
    stop() { cur = null; },
    update(dt) {
      if (!cur) return;
      cur.t += dt;
      cur.action.time = clipTimeAt(cur.tm, cur.M, cur.t, cur.arrivedAt);
      const done = cur.M.travel ? cur.arrivedAt !== null && cur.t - cur.arrivedAt > 0.3 || cur.t > 1.4 : cur.t >= cur.M.time;
      if (done) cur = null;
    },
    get active() { return !!cur; },
  };
}
