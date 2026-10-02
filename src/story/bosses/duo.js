// Two on one (spec 10, Act 4: the Sinister Six in pairs). Runs two boss modules side by side in
// one arena, each with a share of its usual health (step.duoHp, default 0.65) and the 'duo'
// variant (no set-piece phases that would pull them apart: no run to the rail yard, no chase).
// The bar shows both names and their combined health; the step is done when both are down.

export function createDuo(ctx, makers) {
  const ids = ctx.step.duo;
  const share = ctx.step.duoHp ?? 0.65;
  const subs = ids.map((id, i) => {
    // Each gets its own context (a module may hang hooks on it), and a spot of its own.
    const site = { ...ctx.site, x: ctx.site.x + (i ? 7 : -7) };
    const sub = { ...ctx, site, step: { ...ctx.step, type: 'boss', variant: 'duo' } };
    const m = makers[id](sub);
    const e = m.actor.e;
    e.maxHp *= share; e.hp = Math.min(e.hp, e.maxHp);
    return { id, m, sub };
  });
  ctx.onScan = () => { for (const s of subs) s.sub.onScan?.(); };
  const names = subs.map((s) => s.m.actor.name).join(' & ');
  const actor = {
    name: names,
    hpFrac: () => subs.reduce((t, s) => t + s.m.actor.hpFrac(), 0) / subs.length,
    get e() { return (subs.find((s) => !s.m.done) ?? subs[0]).m.actor.e; },
  };
  return {
    actor,
    get done() { return subs.every((s) => s.m.done); },
    get failed() { return subs.some((s) => s.m.failed); },
    get phase() { return Math.min(...subs.map((s) => s.m.phase ?? 1)); },
    get state() { return Object.fromEntries(subs.map((s) => [s.id, s.m.state])); },
    update(dt) { for (const s of subs) s.m.update(dt); },
    yankAt(cam, heroP) { for (const s of subs) { const r = s.m.yankAt?.(cam, heroP); if (r) return r; } return null; },
    onEvent(ev) { for (const s of subs) s.m.onEvent?.(ev); },
    setPhase(n) { for (const s of subs) s.m.setPhase?.(n); },
    dispose() { for (const s of subs) s.m.dispose(); },
  };
}
