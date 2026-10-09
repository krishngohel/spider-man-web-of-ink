// The two reward comic pages (spec P5): one for 100% of the city (every crime quota, collectible,
// base, research kiosk, Bugle story, challenge and race run, and request), one for gold in every
// Taskmaster challenge. Each is shown once per save (flags in save.story.choices), drawn in
// engine like a story page (director.showPages) when play is calm.

const shot = (at, cam, look, cast = [], extra = {}) => ({ at, cam, look, cast, ...extra });

export const REWARD_PAGES = {
  hundred: {
    pages: [{
      layout: 'duo',
      panels: [
        { shot: shot('fiskRoof', [60, 30, 110], [240, -130, -160], [], { fov: 52 }), caption: 'Every backpack. Every pigeon. Every photo, every base, every roof with a view. One hundred percent.' },
        { shot: shot('peterRoof', [-3.2, -0.6, 2.6], [0, 1.2, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 270, pose: 'perch' }], { fov: 50 }), balloons: [{ who: 'peter', text: 'Jonah, I want that in print. Front page. Big letters.', x: 8, y: 8 }], caption: 'He will not print it. The city knows anyway.', captionPos: 'bottom' },
      ],
    }],
  },
  gold: {
    pages: [{
      layout: 'duo',
      panels: [
        { shot: shot('neonPlaza', [-30, 26, 70], [0, 8, -40], [{ who: 'hero', p: [0, 0, 0], yaw: 'cam' }], { fov: 48 }), caption: 'Twelve Taskmaster challenges. Twelve gold medals. The stopwatch goes back in the drawer.' },
        { shot: shot('neonPlaza', [-1.6, 1.85, 2.6], [0, 1.5, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 'cam' }], { fov: 36 }), balloons: [{ who: 'peter', text: 'Tell Taskmaster I was not even trying. Actually, do not tell him that. I was trying so hard.', x: 6, y: 8 }] },
      ],
    }],
  },
};

// What the tracker adds up to: done and total over everything it lists, the percent, and whether
// every Taskmaster challenge is gold (3) or better. Pure, so the thresholds can be tested.
export function completionOf(t) {
  let done = 0, total = 0;
  const pair = ([a, b]) => { done += Math.min(a, b); total += b; };
  for (const r of t.rows ?? []) for (const k of ['crimes', 'backpacks', 'photos', 'tags', 'pigeons', 'base', 'research']) if (r[k]) pair(r[k]);
  for (const c of [...(t.challenges ?? []), ...(t.races ?? [])]) pair([c.medal > 0 ? 1 : 0, 1]);
  for (const a of t.bugle ?? []) pair([a.done ? 1 : 0, 1]);
  if (t.requests) pair(t.requests);
  const challenges = t.challenges ?? [];
  return { done, total, percent: total ? Math.floor((done / total) * 100) : 0, allGold: challenges.length > 0 && challenges.every((c) => c.medal >= 3) };
}

// Watches the tracker (every couple of seconds of calm play) and names the page to show, once.
export function createRewardWatch({ save, tracker }) {
  let t = 2;
  return {
    // Returns 'hundred' or 'gold' when one is due and not yet shown, else null. The caller marks
    // it shown with seen() once the page was really read.
    tick(dt) {
      t += dt;
      if (t < 2) return null;
      t = 0;
      const ch = save.story?.choices;
      if (!ch) return null;
      const c = completionOf(tracker());
      if (c.percent >= 100 && !ch.reward100) return 'hundred';
      if (c.allGold && !ch.rewardGold) return 'gold';
      return null;
    },
    seen(kind) { const ch = save.story.choices; if (kind === 'hundred') ch.reward100 = true; if (kind === 'gold') ch.rewardGold = true; },
  };
}
