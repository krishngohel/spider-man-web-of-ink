import * as THREE from 'three';
import { createEnemies, isActive } from './enemies.js';
import { createProjectiles } from './projectiles.js';
import { createHeroCombat } from './heroCombat.js';
import { createGadgets } from './gadgets.js';
import { createRng } from '../core/rng.js';
import { LAND } from '../world/city.js';

// The combat director: owns the enemies, projectiles, gadgets and the hero's combat state, turns
// their events into feedback (spider-sense, words, sounds, shakes, impact frames), and runs the
// street-gang encounters of free roam (the crime system, Plan 11, adds the rest).

// Which crew runs which part of town (before the story changes things).
export const DISTRICT_FACTION = {
  hells: ['kingpin', 'street'], chinatown: ['maggia', 'street'], financial: ['maggia', 'kingpin'], harlem: ['street'],
  midtown: ['street', 'kingpin'], neon: ['street', 'maggia'], harbor: ['kingpin', 'street'], upper: ['street', 'maggia'],
  queens: ['street'], park: ['street'],
};
const GANG_MIX = [['brawler', 'brawler', 'brawler', 'gunner'], ['brawler', 'brawler', 'shield', 'gunner', 'brawler'], ['brawler', 'brute', 'brawler', 'gunner'], ['brawler', 'whip', 'gunner', 'brawler', 'rocket']];

export function createCombat({ scene, world, assets, hero, city, getSettings, feedback }) {
  const rng = createRng(777);
  const events = [];
  const emit = (e) => events.push(e);
  const enemies = createEnemies({ scene, world, assets, onEvent: emit });
  const projectiles = createProjectiles(scene, world);
  const heroCombat = createHeroCombat({ hero, enemies, projectiles, onEvent: emit });
  const gadgets = createGadgets({ scene, enemies, projectiles, hero, world, onEvent: emit });
  const strikeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xf2f2f4 }));
  strikeLine.visible = false;
  scene.add(strikeLine);
  let encounter = null, encounterCooldown = 25;
  let authority = null; // multiplayer: only the host runs the world

  function heroHit(h) { return heroCombat.takeHit(h); }
  const heroInvuln = () => heroCombat.c.iframes > 0;

  function preStep(intent, dt) {
    const p = hero.body.p;
    heroCombat.preStep(intent, dt, { groundBelow: world.groundHeight(p.x, p.y, p.z) });
    if (intent.gadgetPressed) gadgets.use(intent.camFwd);
  }

  let targetsFn = null;
  function step(dt) {
    const s = getSettings();
    const targets = targetsFn ? targetsFn() : null;
    enemies.step(dt, { hero, heroInvuln, difficulty: s.difficulty ?? 'amazing', gravity: s.gravity, heroHit, targets });
    gadgets.step(dt);
    // Gunners aim with a laser while they wind up.
    for (const e of enemies.list) {
      const aiming = e.alive && e.state === 'windup' && e.A.ranged && !e.disarmed;
      if (aiming) {
        const hp = hero.body.p;
        projectiles.laser(e.id, { x: e.body.p.x, y: e.body.p.y + 0.5, z: e.body.p.z }, { x: hp.x, y: hp.y + 0.2, z: hp.z });
      } else projectiles.laser(e.id, null);
    }
    projectiles.step(dt, {
      hero: (pr, nx, ny, nz) => {
        for (const T of targets ?? [{ body: hero.body, invuln: heroInvuln, hit: heroHit }]) {
          const h = T.body.p;
          const seg = Math.hypot(nx - pr.x, ny - pr.y, nz - pr.z) || 1;
          const t = Math.max(0, Math.min(1, ((h.x - pr.x) * (nx - pr.x) + (h.y - pr.y) * (ny - pr.y) + (h.z - pr.z) * (nz - pr.z)) / (seg * seg)));
          const d = Math.hypot(pr.x + (nx - pr.x) * t - h.x, pr.y + (ny - pr.y) * t - h.y, pr.z + (nz - pr.z) * t - h.z);
          if (d > 0.7 || T.invuln()) continue;
          if (pr.kind === 'rocket') { explode(pr.x, pr.y, pr.z, pr); return true; }
          T.hit({ dmg: pr.dmg, dir: { x: pr.vx / 70, z: pr.vz / 70 }, from: null });
          return true;
        }
        return false;
      },
      enemies: enemies.list,
      canHit: (e) => isActive(e) || e.state === 'webbed',
      enemy: (e, pr) => {
        if (pr.gadget && gadgets.payload(pr, e)) return;
        if (pr.kind === 'web') { enemies.hit(e, { kind: 'web', dmg: pr.dmg }); emit({ type: 'webHit', e }); return; }
        // A character's own shots (darts, stings, spears, bombs).
        if (pr.aoe > 0) { explode(pr.x, pr.y, pr.z, pr); return; }
        const d = Math.hypot(pr.vx, pr.vz) || 1;
        enemies.hit(e, { dmg: pr.dmg, dir: { x: pr.vx / d, z: pr.vz / d }, push: 4, from: { x: pr.x, y: pr.y, z: pr.z } });
        emit({ type: 'heroHit', e, heavy: false, kind: 'shot' });
      },
      explode,
      webWall: (hit, pr) => { if (pr.gadget) gadgets.payload(pr, null); feedback.splat(hit); },
    });
    // Encounters.
    updateEncounter(dt);
    // Events to feedback.
    for (const e of events) handle(e);
    events.length = 0;
  }

  function explode(x, y, z, pr) {
    if (pr.owner === 'hero') {
      if (pr.gadget) { gadgets.payload({ ...pr, x, y, z }, null); return; }
      // A hero's bomb: everyone in the blast.
      feedback.boom({ x, y, z });
      for (const e of enemies.active) {
        const dx = e.body.p.x - x, dz = e.body.p.z - z, d = Math.hypot(dx, dz);
        if (d < pr.aoe) enemies.hit(e, { dmg: pr.dmg * (1 - d / (pr.aoe * 1.5)), dir: { x: dx / (d || 1), z: dz / (d || 1) }, push: 9, lift: 3, kind: 'slam', from: { x, y, z } });
      }
      return;
    }
    const h = hero.body.p;
    const d = Math.hypot(h.x - x, h.y - y, h.z - z);
    feedback.boom({ x, y, z });
    if (d < 3.2 && !heroInvuln()) heroHit({ dmg: pr.dmg * (1 - d / 4), dir: { x: (h.x - x) / (d || 1), z: (h.z - z) / (d || 1) }, from: null });
  }

  function handle(e) {
    switch (e.type) {
      case 'enemyWindup': feedback.sense(e.e, e.unblockable, e.ranged); break;
      case 'enemyShoot': {
        const p = e.e.body.p, h = hero.body.p, v = hero.body.v;
        // A little lead: shots aim where the hero will be.
        const lead = e.kind === 'rocket' ? 0.35 : 0.12;
        projectiles.fire(e.kind, { x: p.x, y: p.y + 0.5, z: p.z }, { x: h.x + v.x * lead, y: h.y + v.y * lead + 0.1, z: h.z + v.z * lead }, { dmg: e.dmg });
        feedback.shot(e.e, e.kind);
        break;
      }
      case 'strikeLine':
        strikeLine.visible = true;
        strikeLine.geometry.setFromPoints([new THREE.Vector3(e.from.x, e.from.y + 0.4, e.from.z), new THREE.Vector3(e.to.x, e.to.y + 0.3, e.to.z)]);
        break;
      case 'strikeEnd': strikeLine.visible = false; break;
      default: break;
    }
    feedback.event(e);
  }

  // Free-roam street gangs: every so often a crew gathers on a corner somewhere ahead.
  function updateEncounter(dt) {
    if (encounter) {
      const left = encounter.list.filter((e) => e.alive && isActive(e)).length;
      if (left === 0) { emit({ type: 'encounterDone', encounter }); encounter = null; encounterCooldown = 70 + rng.range(0, 60); }
      else if (encounter.kind !== 'story' && Math.hypot(encounter.x - hero.body.p.x, encounter.z - hero.body.p.z) > 420) { for (const e of encounter.list) enemies.remove(e); encounter = null; encounterCooldown = 20; }
      return;
    }
    if (!getSettings().crimes || (authority && !authority())) return;
    encounterCooldown -= dt;
    if (encounterCooldown > 0) return;
    encounterCooldown = 15;
    const spot = findSpot();
    if (spot) spawnGang(spot.x, spot.z, spot.district);
  }

  function findSpot() {
    const g = city.grid, p = hero.body.p;
    for (let tries = 0; tries < 30; tries++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(80, 170);
      const ax = Math.round((p.x + Math.cos(a) * r - g.minX) / g.avenueEvery) * g.avenueEvery + g.minX;
      const sz = Math.round((p.z + Math.sin(a) * r - g.minZ) / g.streetEvery) * g.streetEvery + g.minZ;
      // A street corner, just off the crossing.
      const x = ax + g.avenueWidth / 2 + 3, z = sz + g.streetWidth / 2 + 3;
      if (city.landAt(x, z) !== LAND.city) continue;
      const d = city.districts.find((q) => x >= q.minX && x < q.maxX && z >= q.minZ && z < q.maxZ);
      if (!d) continue;
      return { x: x - 6, z: z - 6, district: d.id };
    }
    return null;
  }

  function spawnGang(x, z, district, { faction = null, mix = null, level = 1, alert = false, kind = 'gang' } = {}) {
    const facs = DISTRICT_FACTION[district] ?? ['street'];
    const fac = faction ?? facs[rng.int(0, facs.length - 1)];
    const arches = mix ?? GANG_MIX[rng.int(0, GANG_MIX.length - 1)];
    const list = arches.map((arch, i) => {
      const a = (i / arches.length) * Math.PI * 2;
      return enemies.spawn({ x: x + Math.cos(a) * 3, z: z + Math.sin(a) * 3, faction: fac, arch, look: i, level, alert });
    });
    encounter = { x, z, list, district, faction: fac, kind };
    emit({ type: 'encounterStart', encounter });
    return encounter;
  }

  return {
    enemies, projectiles, heroCombat, gadgets,
    preStep, step,
    emit, heroHit,
    timeScale: (realDt) => heroCombat.timeScale(realDt),
    spawnGang,
    setTargets(fn) { targetsFn = fn; },
    setAuthority(fn) { authority = fn; },
    // A new host picks up the gang the old one was running.
    restoreEncounter(enc) {
      if (!enc) return;
      const list = enc.list.map((q, i) => { const e = enemies.spawn({ x: q.x, z: q.z, faction: q.faction, arch: q.arch, look: q.look ?? i, alert: true }); e.hp = q.hp; return e; });
      encounter = { x: enc.x, z: enc.z, list, district: enc.district, faction: enc.faction, kind: enc.kind ?? 'gang' };
    },
    get encounter() { return encounter; },
    clearEncounter() { encounter = null; },
    clear() { enemies.clear(); projectiles.clear(); gadgets.clear(); encounter = null; },
  };
}
