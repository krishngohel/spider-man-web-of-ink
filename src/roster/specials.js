import { applyDv } from '../physics/ledger.js';
import { pickTarget } from '../combat/enemies.js';

// Each character's special on the web button (spec 13, combat kit highlights). Every one is a real
// effect on enemies: a hit, a push, a web, a projectile. Returns a function(camFwd) for heroCombat.

export function makeSpecial(id, { hero, enemies, projectiles, emit }) {
  const p = () => hero.body.p;
  const near = (r) => enemies.active.filter((e) => Math.hypot(e.body.p.x - p().x, e.body.p.z - p().z) < r && Math.abs(e.body.p.y - p().y) < 3);
  const away = (e) => { const dx = e.body.p.x - p().x, dz = e.body.p.z - p().z, d = Math.hypot(dx, dz) || 1; return { x: dx / d, z: dz / d }; };
  const target = (f, r = 30) => pickTarget(p(), f, enemies.list, r);
  const fireAt = (kind, f, opts) => {
    const t = target(f), from = { x: p().x, y: p().y + 0.6, z: p().z };
    const to = t ? { x: t.body.p.x, y: t.body.p.y + 0.3, z: t.body.p.z } : { x: from.x + f.x * 25, y: from.y + f.y * 25, z: from.z + f.z * 25 };
    projectiles.fire(kind, from, to, { owner: 'hero', ...opts });
  };
  const ring = (r, dmg, push, lift, word) => { for (const e of near(r)) enemies.hit(e, { dmg, dir: away(e), push, lift, kind: push > 9 ? 'slam' : 'melee', from: p() }); emit({ type: 'word', text: word, at: { ...p() }, kind: 'hit' }); };
  const S = {
    web: null,
    venomBlast: () => { ring(6, 12, 7, 2, 'ZZZAP!'); emit({ type: 'electric', chain: near(6).map((e) => ({ ...e.body.p })) }); },
    kick: (f) => { const t = target(f, 12); if (t) { enemies.hit(t, { kind: 'web', dmg: 0.34 }); applyDv(t.body, 'rope', -away(t).x * 12, 3, -away(t).z * 12); emit({ type: 'word', text: 'YANK!', at: { ...t.body.p } }); } },
    talons: (f) => { const t = target(f, 4); if (t) enemies.hit(t, { dmg: 22, dir: away(t), push: 6, from: p() }); emit({ type: 'word', text: 'SLASH!', at: { ...p() } }); },
    smoke: () => { for (const e of near(8)) { e.alerted = false; e.state = 'idle'; } emit({ type: 'word', text: 'POOF!', at: { ...p() } }); },
    claws: (f) => { const t = target(f, 4); if (t) { enemies.hit(t, { dmg: 14, dir: away(t), push: 3, from: p() }); if (Math.random() < 0.4) enemies.hit(t, { dmg: 4, push: 0, lift: 0, kind: 'slam', from: p() }); } emit({ type: 'word', text: 'SKRITCH!', at: { ...p() } }); },
    tendril: (f) => { const t = target(f, 20); if (t) { applyDv(t.body, 'rope', -away(t).x * 18, 4, -away(t).z * 18); enemies.hit(t, { dmg: 10, push: 0, lift: 3, from: p() }); emit({ type: 'word', text: 'GOTCHA!', at: { ...t.body.p } }); } },
    feathers: (f) => { for (let i = 0; i < 3; i++) fireAt('bullet', { x: f.x + (i - 1) * 0.06, y: f.y, z: f.z + (i - 1) * 0.06 }, { dmg: 8 }); },
    pumpkin: (f) => fireAt('rocket', f, { dmg: 20, aoe: 4 }),
    tentacleSlam: () => ring(5.5, 16, 10, 2, 'WHAMM!'),
    lightning: (f) => { const t = target(f, 28); if (t) { const chain = [t, ...enemies.active.filter((o) => o !== t && Math.hypot(o.body.p.x - t.body.p.x, o.body.p.z - t.body.p.z) < 7).slice(0, 4)]; for (const o of chain) enemies.hit(o, { dmg: 11, push: 2, from: p() }); emit({ type: 'electric', chain: chain.map((o) => ({ ...o.body.p })) }); } },
    charge: () => ring(3.5, 18, 12, 2, 'KRUNCH!'),
    tailSwipe: () => ring(3.6, 13, 8, 1, 'THWUMP!'),
    sting: (f) => fireAt('bullet', f, { dmg: 14 }),
    vibro: (f) => {
      for (const e of enemies.active) {
        const dx = e.body.p.x - p().x, dz = e.body.p.z - p().z, d = Math.hypot(dx, dz) || 1;
        if (d < 16 && (dx * f.x + dz * f.z) / d > 0.6) enemies.hit(e, { dmg: 12, dir: { x: dx / d, z: dz / d }, push: 11, lift: 2, from: p() });
      }
      emit({ type: 'word', text: 'VRRMMM!', at: { ...p() }, kind: 'hit' });
    },
    sandFist: (f) => { const t = target(f, 6); if (t) enemies.hit(t, { dmg: 18, dir: away(t), push: 13, lift: 3, kind: 'slam', from: p() }); emit({ type: 'word', text: 'FWUMP!', at: { ...p() } }); },
    gas: () => { for (const e of near(7)) { enemies.hit(e, { dmg: 4, push: 0, from: p() }); e.cooldown = 4; } emit({ type: 'word', text: 'HSSSS!', at: { ...p() } }); },
    spear: (f) => fireAt('bullet', f, { dmg: 18 }),
    cane: (f) => fireAt('rocket', f, { dmg: 14, aoe: 2 }),
  };
  return S[id] ?? null;
}
