import * as THREE from 'three';
import { buildCatalog, BUGLE, CRIME_QUOTA, BASE_TOKENS, MEDAL_TOKENS, RESEARCH_TOKENS, MEDALS, medalFor } from './catalog.js';
import { NOTES } from './notes.js';
import { comicToon } from '../render/comicShade.js';
import { LAYER_FX } from '../render/layers.js';
import { LAND } from '../world/city.js';
import { createBody, placeBody, applyDv } from '../physics/ledger.js';
import { ARCHETYPES } from '../combat/enemies.js';
import { COPY } from '../ui/copy.js';

// The open world at run time (spec 11): collectibles you touch, landmark photos you take, street
// crimes, hideouts, ring courses (races, Taskmaster runs), Taskmaster fights, research stations,
// Bugle assignments. Everything is saved by id. Free roam only: a story mission keeps the streets
// quiet and nothing new starts.

const L = (who, text) => ({ who, text });
export const CRIMES = {
  mugging: { name: 'MUGGING', mix: ['brawler', 'brawler'] },
  robbery: { name: 'STORE ROBBERY', mix: ['brawler', 'brawler', 'gunner', 'shield'] },
  gang: { name: 'GANG FIGHT', mix: ['brawler', 'brawler', 'whip', 'gunner', 'brute'] },
  sniper: { name: 'SNIPER NEST', mix: ['sniper', 'sniper', 'gunner'], roof: true, after: 'act1.done' },
  drones: { name: 'DRONE STRIKE', mix: ['jetpack', 'jetpack', 'jetpack', 'jetpack'], faction: 'oscorp', after: 'act2.electro' },
  van: { name: 'ARMORED VAN', mix: ['shield', 'gunner', 'brawler', 'brute'], van: true },
  hostage: { name: 'HOSTAGES', mix: ['gunner', 'gunner', 'brawler', 'shield'] },
  bomb: { name: 'BOMB', objective: 'bomb' },
  chase: { name: 'GETAWAY CAR', objective: 'car' },
  collapse: { name: 'COLLAPSE', objective: 'collapse' },
};
export const DISTRICT_CRIMES = {
  midtown: ['mugging', 'robbery', 'chase', 'bomb', 'sniper'], hells: ['mugging', 'gang', 'robbery', 'collapse'], financial: ['van', 'robbery', 'hostage', 'chase'],
  harbor: ['van', 'drones', 'gang', 'collapse'], neon: ['robbery', 'mugging', 'chase', 'bomb'], harlem: ['mugging', 'gang', 'collapse'],
  chinatown: ['gang', 'robbery', 'hostage'], upper: ['robbery', 'sniper', 'bomb', 'drones'], queens: ['mugging', 'robbery', 'chase'], park: ['mugging', 'gang'],
};

export function createContentWorld(g) {
  const { scene, world, city, hero, combat, save } = g;
  const cat = buildCatalog(city);
  const has = (list, id) => list.includes(id);
  const mats = {
    bp: comicToon({ color: 0xc8202a }), bpB: comicToon({ color: 0x1f4fb6 }), bird: comicToon({ color: 0x9a9aa6 }), birdHead: comicToon({ color: 0x5a6a7a }),
    tag: new THREE.MeshBasicMaterial({ color: 0xf4f4f6, side: THREE.DoubleSide }), tagInk: new THREE.MeshBasicMaterial({ color: 0x12101c, side: THREE.DoubleSide }),
    ring: new THREE.MeshBasicMaterial({ color: 0xf7e36a, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
    ringNext: new THREE.MeshBasicMaterial({ color: 0x5ad0ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
    kiosk: comicToon({ color: 0x2a5a9a }), kioskTop: comicToon({ color: 0xf2f2f4 }), bomb: comicToon({ color: 0x2a2a2e }), bombLight: new THREE.MeshBasicMaterial({ color: 0xff3a2a }),
    car: comicToon({ color: 0x3a3a46 }), van: comicToon({ color: 0x8a8f96 }), rubble: comicToon({ color: 0x8a8076 }),
  };
  const geo = { bp: new THREE.BoxGeometry(0.5, 0.6, 0.3), strap: new THREE.BoxGeometry(0.52, 0.08, 0.32), bird: new THREE.SphereGeometry(0.22, 10, 8), head: new THREE.SphereGeometry(0.11, 8, 6), tag: new THREE.CircleGeometry(0.9, 18), ear: new THREE.ConeGeometry(0.3, 0.5, 3), ring: new THREE.TorusGeometry(5, 0.35, 8, 32) };
  let time = 0, cullT = 0;
  const startMeshes = [];

  // Collectibles ------------------------------------------------------------------------------------
  const items = [];
  const KEY = { backpack: 'backpacks', pigeon: 'pigeons', tag: 'tags' };
  function addItem(q) {
    if (has(save.collect[KEY[q.kind]], q.id)) return;
    const root = new THREE.Group();
    if (q.kind === 'backpack') { const b = new THREE.Mesh(geo.bp, mats.bp); const s = new THREE.Mesh(geo.strap, mats.bpB); s.position.y = 0.1; root.add(b, s); }
    if (q.kind === 'pigeon') { const b = new THREE.Mesh(geo.bird, mats.bird); b.scale.set(1, 0.8, 1.4); const h = new THREE.Mesh(geo.head, mats.birdHead); h.position.set(0, 0.15, 0.25); root.add(b, h); }
    if (q.kind === 'tag') {
      const face = new THREE.Mesh(geo.tag, mats.tag); root.add(face);
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(geo.ear, mats.tag); e.position.set(sx * 0.55, 0.85, 0); root.add(e); }
      for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), mats.tagInk); eye.position.set(sx * 0.3, 0.1, 0.01); eye.scale.y = 0.5; root.add(eye); }
    }
    root.position.set(q.x, q.y, q.z);
    root.traverse((o) => { if (o.isMesh) o.castShadow = q.kind !== 'tag'; });
    scene.add(root);
    items.push({ q, root });
  }
  function addAllItems() {
    for (const it of items) scene.remove(it.root);
    items.length = 0;
    for (const q of [...cat.backpacks, ...cat.pigeons, ...cat.tags]) addItem(q);
  }
  addAllItems();

  function pickup(it) {
    const { q } = it;
    const list = save.collect[KEY[q.kind]];
    if (has(list, q.id)) return;
    list.push(q.id);
    scene.remove(it.root);
    items.splice(items.indexOf(it), 1);
    if (q.kind === 'backpack') {
      g.reward('backpack', { tokens: { backpack: 1 }, at: q });
      g.say([L('peter', NOTES[Number(q.id.slice(2)) - 1] ?? '...')]);
      g.word('BACKPACK!', q, 'big');
    } else if (q.kind === 'pigeon') { g.reward('pigeon', { at: q }); g.word('COO!', q, 'big'); }
    else if (q.kind === 'tag') {
      g.reward('tag', { at: q }); g.word('MEOW.', q, 'big');
      const n = save.collect.tags.length;
      if (n % 4 === 0) g.say([L('blackcat', n === 12 ? 'All twelve. You do know how to follow a girl. Dinner is on me. Maybe.' : `That is ${n} of my little signatures, spider. Keep looking.`)]);
    }
    g.sfx.event({ type: 'stamp' });
    g.persist();
  }

  // Photos and the Bugle: the photo key frames a shot; anything collectable in frame is taken.
  function photo(cam) {
    const taken = [];
    for (const q of cat.photos) {
      const dx = q.x - cam.x, dy = q.y - cam.y, dz = q.z - cam.z, d = Math.hypot(dx, dy, dz);
      if (d > 320) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * cam.fx + dy * cam.fy + dz * cam.fz) / d)));
      if (ang > 0.26) continue;
      taken.push(q);
      if (!has(save.collect.photos, q.id)) { save.collect.photos.push(q.id); g.reward('photo', { tokens: { landmark: 1 }, at: cam }); g.caption(`PHOTO: ${q.name.toUpperCase()}`); }
      for (const a of BUGLE) {
        if (a.target !== q.id || has(save.activities.bugle, a.id)) continue;
        const h = g.hour(), w = g.weather();
        if (a.hours && !(h >= a.hours[0] && h <= a.hours[1])) continue;
        if (a.weather && a.weather !== w) continue;
        save.activities.bugle.push(a.id);
        g.reward('bugle', { at: cam });
        g.say([L('jameson', `"${a.title}". Fine. It is fine. I will run it. Do not let it go to your head, Parker.`)]);
      }
    }
    g.persist();
    return taken;
  }

  // Crimes ------------------------------------------------------------------------------------------
  let crime = null, crimeCd = 30;
  let nights = null; // Crime Nights: { score, level, t }
  const crimeObjs = [];
  function districtOf(x, z) { return city.districts.find((d) => x >= d.minX && x < d.maxX && z >= d.minZ && z < d.maxZ) ?? null; }
  function streetSpot(r0 = 90, r1 = 180) {
    const gr = city.grid, p = hero.body.p;
    for (let tries = 0; tries < 40; tries++) {
      const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
      const ax = Math.round((p.x + Math.cos(a) * r - gr.minX) / gr.avenueEvery) * gr.avenueEvery + gr.minX;
      const sz = Math.round((p.z + Math.sin(a) * r - gr.minZ) / gr.streetEvery) * gr.streetEvery + gr.minZ;
      const x = ax + gr.avenueWidth / 2 + 3, z = sz + gr.streetWidth / 2 + 3;
      if (city.landAt(x, z) !== LAND.city && city.landAt(x, z) !== LAND.suburb) continue;
      const d = districtOf(x, z);
      if (d) return { x: x - 6, z: z - 6, ax, sz, district: d.id };
    }
    return null;
  }
  function startCrime(force = null, at = null) {
    const spot = at ?? streetSpot();
    if (!spot) return;
    const kinds = (DISTRICT_CRIMES[spot.district] ?? ['mugging']).filter((k) => !CRIMES[k].after || save.story.done.includes(CRIMES[k].after));
    const kind = force ?? kinds[Math.floor(Math.random() * kinds.length)];
    const C = CRIMES[kind];
    crime = { kind, C, spot, t: 0, list: [] };
    // A bonus objective on fight crimes (Insomniac's crime bonuses): style pays an extra token.
    if (C.mix) {
      const hc = combat.heroCombat.c;
      const B = [
        { id: 'combo', n: 15, text: 'BONUS: A 15-HIT COMBO' },
        { id: 'throws', n: 2, text: 'BONUS: THROW TWO THINGS (BINS, CRATES OR WEBBED THUGS)' },
        { id: 'perfect', n: 1, text: 'BONUS: A PERFECT DODGE' },
      ][Math.floor(Math.random() * 3)];
      crime.bonus = { ...B, got: 0, start: { throws: (hc.used.throw ?? 0) + (hc.used.propThrow ?? 0), perfect: hc.perfects ?? 0 } };
    }
    if (C.mix) {
      let x = spot.x, z = spot.z, y = 0.9;
      if (C.roof) {
        // A roof near the corner.
        const b = city.boxes.filter((q) => q.kind === 'building' && Math.hypot((q.min[0] + q.max[0]) / 2 - spot.x, (q.min[2] + q.max[2]) / 2 - spot.z) < 60 && q.max[1] < 60).sort((p1, p2) => p2.max[1] - p1.max[1])[0];
        if (b) { x = (b.min[0] + b.max[0]) / 2; z = (b.min[2] + b.max[2]) / 2; y = b.max[1] + 0.9; }
      }
      const lvl = nights ? nights.level : 1;
      const mix = nights && nights.level > 2 ? [...C.mix, 'brawler', nights.level > 4 ? 'brute' : 'gunner'] : C.mix;
      const enc = combat.spawnGang(x, z, spot.district, { mix, faction: C.faction ?? null, alert: !!nights, kind: 'crime', level: lvl });
      if (y > 1) for (const e of enc.list) e.body.p.y = y;
      crime.list = enc.list;
      if (C.van) addObj(new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 6), mats.van), spot.x + 4, 1.3, spot.z);
    }
    if (C.objective === 'bomb') {
      const m = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), mats.bomb); const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mats.bombLight); l.position.y = 0.35; m.add(b, l);
      addObj(m, spot.x, 0.25, spot.z);
      crime.timer = 45; crime.hold = 0;
    }
    if (C.objective === 'collapse') {
      addObj(new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 2.2), mats.rubble), spot.x, 0.6, spot.z);
      crime.hold = 0;
    }
    if (C.objective === 'car') {
      const body = createBody({ mass: 1400 });
      placeBody(body, spot.ax, 0.9, spot.sz);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 4.4), mats.car);
      scene.add(mesh); crimeObjs.push(mesh);
      crime.car = { body, mesh, hits: 0, dir: Math.random() < 0.5 ? 1 : -1, axis: Math.random() < 0.5 ? 'x' : 'z', turnT: 6 };
      // The car is a web target (like an enemy) so web shots find it.
      crime.car.e = { id: 800000 + Math.floor(Math.random() * 1000), faction: 'none', arch: 'brawler', A: ARCHETYPES.brawler, body, hp: 1, maxHp: 1, state: 'engage', t: 0, alive: true, alerted: true, web: 0, facing: 0, strikeAt: 9, look: 0,
        model: { root: mesh, hurt: { value: 0 }, animator: { play() {}, update() {} }, mat: { dispose() {} } },
        boss: { hit: (args) => { if (args.kind === 'web') carHit(); return { dealt: 0, blocked: true }; }, yank: () => { carHit(); return true; } } };
      combat.enemies.list.push(crime.car.e);
    }
    (g.alert ?? g.caption)(crime.bonus ? `CRIME: ${C.name}. ${crime.bonus.text}` : `CRIME: ${C.name}`, crime.bonus ? 5 : 3.5);
    g.crimeWaypoint({ x: spot.x, z: spot.z });
  }
  function carHit() {
    const c = crime?.car;
    if (!c || c.hits >= 4) return;
    c.hits++;
    g.word(c.hits >= 4 ? 'STOPPED!' : 'THWIP!', c.body.p, c.hits >= 4 ? 'big' : 'small');
    if (c.hits >= 4) { const enc = combat.spawnGang(c.body.p.x + 2, c.body.p.z, crime.spot.district, { mix: ['brawler', 'brawler'], alert: true, kind: 'crime' }); crime.list = enc.list; }
  }
  function addObj(m, x, y, z) { m.position.set(x, y, z); m.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(m); crimeObjs.push(m); }
  function endCrime(won) {
    g.prompt(null); g.timer(null);
    for (const m of crimeObjs) scene.remove(m);
    crimeObjs.length = 0;
    if (crime?.car) { const i = combat.enemies.list.indexOf(crime.car.e); if (i >= 0) combat.enemies.list.splice(i, 1); }
    if (won) {
      const d = crime.spot.district, act = save.activities;
      act.crimes++;
      act.crimeKinds[crime.kind] = (act.crimeKinds[crime.kind] ?? 0) + 1;
      act.crimeByDistrict ??= {};
      const n = act.crimeByDistrict[d] = (act.crimeByDistrict[d] ?? 0) + 1;
      g.reward('crime', { tokens: n <= CRIME_QUOTA ? { crime: 1 } : null, at: crime.spot });
      if (crime.bonus && crime.bonus.got >= crime.bonus.n) { g.reward('crime', { tokens: n <= CRIME_QUOTA ? { crime: 1 } : null, at: crime.spot }); g.stamp('BONUS!'); }
      if (nights) { nights.score++; nights.level = 1 + Math.floor(nights.score / 3); g.caption(`CRIME NIGHTS: ${nights.score} STOPPED, LEVEL ${nights.level}`, 2.5); }
      (g.alert ?? g.caption)(`${crime.C.name}: STOPPED`, 2.5);
      g.persist();
    } else if (crime) (g.alert ?? g.caption)(`${crime.C.name}: TOO LATE`, 2.5);
    g.crimeWaypoint(null);
    crime = null; crimeCd = nights ? 6 : 45 + Math.random() * 45;
  }
  function updateCrime(dt) {
    if (nights) nights.t += dt;
    if (!crime) { crimeCd -= dt; if (crimeCd <= 0 && (nights || (!g.busy() && g.crimesOn?.() !== false))) { crimeCd = 20; startCrime(nights ? ['mugging', 'robbery', 'gang', 'hostage', 'van', 'drones', 'sniper'][Math.floor(Math.random() * 7)] : null); } return; }
    crime.t += dt;
    if (crime.bonus) {
      const hc = combat.heroCombat.c, b = crime.bonus;
      if (b.id === 'combo') b.got = Math.max(b.got, hc.combo);
      else if (b.id === 'throws') b.got = (hc.used.throw ?? 0) + (hc.used.propThrow ?? 0) - b.start.throws;
      else b.got = (hc.perfects ?? 0) - b.start.perfect;
      if (b.got >= b.n && !b.told) { b.told = true; g.word('BONUS!', hero.body.p, 'big'); }
    }
    const p = hero.body.p, sp = crime.spot;
    const far = Math.hypot(p.x - sp.x, p.z - sp.z) > 450;
    if (far && crime.t > 20) { for (const e of crime.list) combat.enemies.remove(e); endCrime(false); return; }
    const C = crime.C;
    if (C.objective === 'bomb' || C.objective === 'collapse') {
      if (C.objective === 'bomb') {
        crime.timer -= dt;
        g.timer('BOMB', crime.timer);
        crimeObjs[0].children[1].visible = Math.sin(time * (crime.timer < 10 ? 20 : 8)) > 0;
        if (crime.timer <= 0) { g.timer(null); g.word('KA-BOOM!', { x: sp.x, y: 1, z: sp.z }, 'hit'); g.boom({ x: sp.x, y: 0.5, z: sp.z }); endCrime(false); return; }
      }
      // Hold the hang key next to it (defuse, or lift the rubble off).
      const near = Math.hypot(p.x - sp.x, p.z - sp.z) < 3 && p.y < 3;
      crime.hold = near && g.holding() ? crime.hold + dt : Math.max(0, crime.hold - dt * 2);
      g.prompt(near ? (C.objective === 'bomb' ? 'HOLD {hang} TO DEFUSE' : 'HOLD {hang} TO LIFT') : null, crime.hold / 2.2);
      if (crime.hold >= 2.2) { g.prompt(null); g.timer(null); g.word(C.objective === 'bomb' ? 'DEFUSED!' : 'HEAVE!', { x: sp.x, y: 1, z: sp.z }, 'big'); endCrime(true); }
      return;
    }
    if (crime.car && crime.car.hits < 4) {
      // The getaway: along the street grid, turning at crossings now and then.
      const c = crime.car, b = c.body;
      c.turnT -= dt;
      if (c.turnT <= 0) { c.turnT = 5 + Math.random() * 4; c.axis = c.axis === 'x' ? 'z' : 'x'; }
      const sp2 = 15 * (1 - c.hits * 0.15);
      const want = { x: c.axis === 'x' ? c.dir * sp2 : 0, z: c.axis === 'z' ? c.dir * sp2 : 0 };
      applyDv(b, 'surface', (want.x - b.v.x) * Math.min(1, dt * 2), 0, (want.z - b.v.z) * Math.min(1, dt * 2));
      b.p.x += b.v.x * dt; b.p.z += b.v.z * dt;
      const C2 = {}; world.resolveCapsule(b, 1, 0.5, C2);
      if (C2.wall) { c.dir = -c.dir; c.axis = c.axis === 'x' ? 'z' : 'x'; }
      c.mesh.position.set(b.p.x, 0.7, b.p.z);
      c.mesh.rotation.y = Math.atan2(b.v.x, b.v.z);
      crime.spot.x = b.p.x; crime.spot.z = b.p.z;
      g.crimeWaypoint({ x: b.p.x, z: b.p.z });
      return;
    }
    const left = crime.list.filter((e) => e.alive && combat.enemies.list.includes(e) && !['out', 'webbed', 'pinned'].includes(e.state)).length;
    if (crime.list.length && left === 0) endCrime(true);
  }

  // Hideouts ----------------------------------------------------------------------------------------
  let base = null;
  function updateBases(dt) {
    const p = hero.body.p;
    if (!base) {
      if (g.busy()) return;
      const q = cat.hideouts.find((h) => !has(save.activities.bases, h.id) && Math.hypot(p.x - h.x, p.z - h.z) < 45 && p.y < 30);
      if (!q) return;
      base = { q, wave: 0, list: [], t: 0 };
      g.caption(`${q.name.toUpperCase()}: CLEAR IT OUT`, 3);
      baseWave();
      return;
    }
    base.t += dt;
    if (Math.hypot(p.x - base.q.x, p.z - base.q.z) > 300) { for (const e of base.list) combat.enemies.remove(e); base = null; return; }
    const left = base.list.filter((e) => e.alive && !['out', 'webbed', 'pinned'].includes(e.state)).length;
    if (left) return;
    if (++base.wave < 3) { baseWave(); g.caption(base.wave === 2 ? 'THE LIEUTENANT!' : 'MORE OF THEM!', 2); return; }
    save.activities.bases.push(base.q.id);
    g.reward('base', { tokens: { base: BASE_TOKENS }, at: base.q });
    g.caption('HIDEOUT CLEARED', 3);
    g.stamp('HIDEOUT CLEARED');
    g.persist();
    base = null;
  }
  function baseWave() {
    const mixes = [['brawler', 'brawler', 'gunner', 'shield'], ['brawler', 'whip', 'gunner', 'rocket', 'shield'], ['brute', 'brawler', 'gunner', 'jetpack']];
    const enc = combat.spawnGang(base.q.x, base.q.z, base.q.district, { mix: mixes[base.wave], alert: true, kind: 'base', level: 1 + base.wave });
    // The lieutenant: the brute in the last wave, much tougher.
    if (base.wave === 2) { const lt = enc.list.find((e) => e.arch === 'brute'); if (lt) { lt.hp *= 2.5; lt.maxHp = lt.hp; lt.lieutenant = true; } }
    base.list = enc.list;
  }

  // Courses: races and the ring challenges ------------------------------------------------------------
  let run = null;
  const ringMeshes = [];
  const startGeo = new THREE.RingGeometry(2.6, 3.4, 28);
  for (const c of [...cat.races, ...cat.challenges]) {
    const m = new THREE.Mesh(startGeo, c.kind === 'race' ? mats.ringNext : mats.ring);
    m.layers.set(LAYER_FX); m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.08, c.z);
    scene.add(m);
    startMeshes.push({ m, x: c.x, z: c.z });
  }
  function startMarkers() { return [...cat.races, ...cat.challenges]; }
  // A run quit from the pause menu does not start again (nor another one sharing its marker) until
  // the hero has stepped away from where he quit.
  let skipStart = null;
  function updateRuns(dt) {
    const p = hero.body.p;
    if (!run) {
      if (skipStart && Math.hypot(p.x - skipStart.x, p.z - skipStart.z) > 6) skipStart = null;
      if (skipStart || g.busy()) return;
      // A start marker (on the street): step into it to begin.
      for (const c of startMarkers()) {
        if (Math.hypot(p.x - c.x, p.z - c.z) < 4 && p.y < 3) { beginRun(c); return; }
      }
      return;
    }
    run.t += dt;
    if (run.count > 0) { run.count -= dt; g.timer(run.c.name.toUpperCase(), run.count); if (run.count <= 0) { run.t = 0; g.caption('GO!', 1); } return; }
    g.timer(run.c.name.toUpperCase(), run.t);
    if (run.c.rings) {
      const r = run.c.rings[run.i];
      if (Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z) < (run.c.bombs ? 4 : 7)) {
        g.word(run.c.bombs ? 'DEFUSED!' : 'RING!', r, 'small');
        g.sfx.event({ type: 'stamp' });
        run.i++;
        drawRings();
        if (run.i >= run.c.rings.length) return finishRun(true);
      }
      if (run.c.bombs && run.t > run.c.medals[1]) return finishRun(false);
    } else {
      const left = run.list.filter((e) => e.alive && !['out', 'webbed', 'pinned'].includes(e.state)).length;
      if (run.c.type === 'stealth' && run.list.some((e) => e.alerted)) run.spotted = true;
      if (!left) { if (run.c.waves && ++run.wave < run.c.waves.length) { run.list = combat.spawnGang(run.c.x, run.c.z, run.c.district, { mix: run.c.waves[run.wave], alert: true, kind: 'challenge' }).list; } else return finishRun(true); }
    }
    if (run.t > 300 || Math.hypot(p.x - run.c.x, p.z - run.c.z) > 900) finishRun(false);
  }
  function beginRun(c) {
    run = { c, t: 0, i: 0, count: 3, list: [], wave: 0, spotted: false };
    g.caption(c.name.toUpperCase(), 2.5);
    if (c.rings) drawRings();
    else if (c.type === 'combat') run.list = combat.spawnGang(c.x, c.z, c.district, { mix: c.waves[0], alert: true, kind: 'challenge' }).list;
    else if (c.type === 'stealth') {
      run.list = [];
      for (let i = 0; i < c.guards; i++) {
        const a = (i / c.guards) * Math.PI * 2, x = c.x + Math.cos(a) * 14, z = c.z + Math.sin(a) * 14;
        const e = combat.enemies.spawn({ x, z, faction: 'street', arch: i % 2 ? 'gunner' : 'brawler', look: i, alert: false });
        e.stealth = true; e.patrol = [{ x, z }, { x: c.x + Math.cos(a + 0.6) * 18, z: c.z + Math.sin(a + 0.6) * 18 }];
        run.list.push(e);
      }
    }
  }
  function drawRings() {
    for (const m of ringMeshes) scene.remove(m);
    ringMeshes.length = 0;
    if (!run?.c.rings) return;
    for (let k = run.i; k < Math.min(run.c.rings.length, run.i + 3); k++) {
      const r = run.c.rings[k], n = run.c.rings[k + 1] ?? r;
      const m = new THREE.Mesh(geo.ring, k === run.i ? mats.ring : mats.ringNext);
      m.layers.set(LAYER_FX);
      m.position.set(r.x, r.y, r.z);
      m.lookAt(n.x, r.y, n.z);
      if (run.c.bombs) m.scale.setScalar(0.5);
      scene.add(m); ringMeshes.push(m);
    }
  }
  // Ends the run with no result (Retry and Quit from the pause menu): enemies, rings and timer go.
  function dropRun() {
    if (!run) return null;
    const c = run.c;
    for (const m of ringMeshes) scene.remove(m);
    ringMeshes.length = 0;
    for (const e of run.list) combat.enemies.remove(e);
    // The challenge's gang goes with it: left in place, the empty encounter would count as busted
    // and pay a crime token on the next step.
    if (combat.encounter?.kind === 'challenge') combat.clearEncounter();
    g.timer(null);
    run = null;
    return c;
  }
  function finishRun(ok) {
    const c = run.c;
    for (const m of ringMeshes) scene.remove(m);
    ringMeshes.length = 0;
    for (const e of run.list) if (!ok) combat.enemies.remove(e);
    if (!ok && combat.encounter?.kind === 'challenge') combat.clearEncounter();
    g.timer(null);
    if (ok) {
      let medal = medalFor(run.t, c);
      if (c.type === 'stealth' && run.spotted) medal = 1;
      const store = c.kind === 'race' ? save.activities.races : save.activities.challenges;
      const old = store[c.id]?.medal ?? 0;
      if (medal > old || !store[c.id]) store[c.id] = { medal: Math.max(medal, old), time: Math.min(run.t, store[c.id]?.time ?? Infinity) };
      if (c.kind === 'challenge' && medal > old) g.reward('challengeMedal', { tokens: { challenge: MEDAL_TOKENS[medal] - MEDAL_TOKENS[old] }, at: c });
      else g.reward('challengeMedal', { xp: 120, at: c });
      g.stamp(`${MEDALS[medal].toUpperCase()}! ${run.t.toFixed(1)} S`);
      g.persist();
    } else g.caption('TIME!', 2);
    run = null;
  }

  // Research stations ---------------------------------------------------------------------------------
  const kiosks = [];
  function addKiosks() {
  for (const ks of kiosks) scene.remove(ks.k);
  kiosks.length = 0;
  for (const r of cat.research) {
    if (has(save.activities.research, r.id)) continue;
    const k = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.8), mats.kiosk); b.position.y = 0.9;
    const t = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 0.9), mats.kioskTop); t.position.y = 1.9;
    k.add(b, t); k.position.set(r.x, r.y - 0.9, r.z);
    scene.add(k);
    kiosks.push({ r, k });
  }
  }
  addKiosks();
  let task = null, kioskPrompt = false;
  function updateResearch(dt) {
    const p = hero.body.p;
    if (!task) {
      for (const ks of kiosks) {
        const near = Math.hypot(p.x - ks.r.x, p.z - ks.r.z) < 3 && Math.abs(p.y - ks.r.y) < 2.5;
        if (near) { kioskPrompt = true; g.prompt('{hang} OSCORP RESEARCH', 0); if (g.pressedHang()) startTask(ks); return; }
      }
      if (kioskPrompt) { kioskPrompt = false; g.prompt(null); }
      return;
    }
    task.t += dt;
    if (task.drones) {
      for (const d of task.drones) if (!d.down) { const b = d.e.body; b.p.y = d.y + Math.sin(task.t * 2 + d.y) * 0.6; d.e.body.p.x = d.x + Math.sin(task.t * 0.7 + d.y) * 4; d.mesh.position.copy(b.p); }
      const left = task.drones.filter((d) => !d.down).length;
      g.timer('DRONES', 90 - task.t);
      if (!left) finishTask(true); else if (task.t > 90) finishTask(false);
    }
    if (task.birds) {
      for (const bd of task.birds) {
        if (bd.got) continue;
        bd.a += dt * 0.6;
        bd.mesh.position.set(task.ks.r.x + Math.cos(bd.a) * bd.r, task.ks.r.y + 2 + Math.sin(bd.a * 2) * 2, task.ks.r.z + Math.sin(bd.a) * bd.r);
        if (bd.mesh.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) < 2.4) { bd.got = true; scene.remove(bd.mesh); g.word('COO!', p, 'small'); }
      }
      g.timer('PIGEONS', 120 - task.t);
      if (task.birds.every((b) => b.got)) finishTask(true); else if (task.t > 120) finishTask(false);
    }
  }
  function startTask(ks) {
    const r = ks.r;
    task = { ks, t: 0 };
    g.prompt(null);
    if (r.task === 'pipes' || r.task === 'circuit' || r.task === 'cable') {
      g.puzzle(r.task).then((ok) => finishTask(ok));
      return;
    }
    if (r.task === 'drones') {
      task.drones = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, x = r.x + Math.cos(a) * 14, z = r.z + Math.sin(a) * 14, y = r.y + 4 + (i % 3);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mats.kiosk);
        scene.add(mesh);
        const body = createBody({ mass: 10 }); placeBody(body, x, y, z);
        const d = { x, y, mesh, down: false };
        d.e = { id: 810000 + i, faction: 'oscorp', arch: 'jetpack', A: ARCHETYPES.jetpack, body, hp: 1, maxHp: 1, state: 'engage', t: 0, alive: true, alerted: true, web: 0, facing: 0, strikeAt: 9, look: 0, model: { root: mesh, hurt: { value: 0 }, animator: { play() {}, update() {} }, mat: { dispose() {} } },
          boss: { hit: () => { down(d); return { dealt: 1, blocked: false }; }, yank: () => { down(d); return true; } } };
        combat.enemies.list.push(d.e);
        task.drones.push(d);
      }
      g.caption('POLLUTION DRONES: TAKE THEM DOWN', 2.5);
    }
    if (r.task === 'pigeons') {
      task.birds = [];
      for (let i = 0; i < 5; i++) { const m = new THREE.Group(); const b = new THREE.Mesh(geo.bird, mats.bird); b.scale.set(1, 0.8, 1.4); m.add(b); scene.add(m); task.birds.push({ mesh: m, a: i * 1.25, r: 8 + i * 3, got: false }); }
      g.caption('CATCH THE ESCAPED PIGEONS', 2.5);
    }
  }
  function down(d) { if (d.down) return; d.down = true; scene.remove(d.mesh); const i = combat.enemies.list.indexOf(d.e); if (i >= 0) combat.enemies.list.splice(i, 1); g.word('KRZZT!', d.e.body.p, 'small'); }
  function finishTask(ok) {
    const t = task;
    task = null;
    g.timer(null);
    for (const d of t.drones ?? []) down(d);
    for (const b of t.birds ?? []) scene.remove(b.mesh);
    if (!ok) { g.caption('TRY AGAIN', 2); return; }
    if (has(save.activities.research, t.ks.r.id)) return;
    save.activities.research.push(t.ks.r.id);
    scene.remove(t.ks.k);
    kiosks.splice(kiosks.indexOf(t.ks), 1);
    g.reward('research', { tokens: { research: RESEARCH_TOKENS }, at: t.ks.r });
    g.stamp('RESEARCH COMPLETE');
    g.persist();
  }

  return {
    catalog: cat,
    get crimeOn() { return !!crime; },
    update(dt, { active }) {
      time += dt;
      // Only what is near is drawn (a few hundred small meshes add up to draw calls).
      cullT -= dt;
      if (cullT <= 0) {
        cullT = 0.4;
        const hp = hero.body.p;
        for (const it of items) it.root.visible = Math.hypot(hp.x - it.q.x, hp.z - it.q.z) < 380;
        for (const s of startMeshes) s.m.visible = Math.hypot(hp.x - s.x, hp.z - s.z) < 600;
        for (const k of kiosks) k.k.visible = Math.hypot(hp.x - k.r.x, hp.z - k.r.z) < 500;
      }
      for (const it of items) {
        if (it.q.kind === 'pigeon') { it.root.position.y = it.q.y + Math.abs(Math.sin(time * 3 + it.q.x)) * 0.1; it.root.rotation.y = Math.sin(time * 0.7 + it.q.z) * 1.2; }
        if (it.q.kind === 'backpack') it.root.rotation.y = time * 1.2;
      }
      if (!active) return;
      const p = hero.body.p;
      for (const it of [...items]) if (Math.hypot(p.x - it.q.x, p.y - it.q.y, p.z - it.q.z) < (it.q.kind === 'tag' ? 3 : 2.2)) pickup(it);
      updateCrime(dt);
      updateBases(dt);
      updateRuns(dt);
      updateResearch(dt);
    },
    photo,
    get nights() { return nights ? { ...nights } : null; },
    startNights() { this.stop(); nights = { score: 0, level: 1, t: 0 }; crimeCd = 2; g.caption('CRIME NIGHTS: HOW LONG CAN YOU LAST?', 3); },
    // The night ends when you go down: the score is kept if it is a best.
    endNights() {
      if (!nights) return;
      const best = save.postGame.crimeNightsBest ?? 0;
      if (nights.score > best) save.postGame.crimeNightsBest = nights.score;
      g.stamp(`CRIME NIGHTS: ${nights.score}${nights.score > best ? ' NEW BEST!' : ''}`);
      nights = null; g.persist();
      if (crime) { for (const e of crime.list) combat.enemies.remove(e); endCrime(false); }
    },
    get busyHere() { return !!(crime || base || run || task); },
    // The race or challenge running now (for the pause menu's Retry and Quit), or null.
    get challenge() { return run ? { id: run.c.id, kind: run.c.kind, name: run.c.name } : null; },
    // Again from the start marker, with the countdown.
    retryRun() {
      const c = dropRun();
      if (!c) return;
      g.placeHero?.(c.x, 0.9, c.z);
      beginRun(c);
    },
    quitRun() {
      const c = dropRun();
      if (!c) return;
      skipStart = { x: hero.body.p.x, z: hero.body.p.z };
      g.caption(COPY.challengeQuit, 1.6);
    },
    // Map icons: what is still to find or do (collectibles only once you have been near).
    mapIcons() {
      const icons = [];
      for (const h of cat.hideouts) if (!has(save.activities.bases, h.id)) icons.push({ x: h.x, z: h.z, kind: 'base' });
      for (const c of [...cat.races, ...cat.challenges]) icons.push({ x: c.x, z: c.z, kind: c.kind === 'race' ? 'race' : 'challenge', done: !!(c.kind === 'race' ? save.activities.races : save.activities.challenges)[c.id] });
      for (const k of kiosks) icons.push({ x: k.r.x, z: k.r.z, kind: 'research' });
      for (const it of items) if (it.q.kind === 'backpack') icons.push({ x: it.q.x, z: it.q.z, kind: 'backpack' });
      return icons;
    },
    // The tracker: per district and in total.
    tracker() {
      const rows = city.districts.map((d) => {
        const inD = (list) => list.filter((q) => q.district === d.id);
        const bp = inD(cat.backpacks), ph = inD(cat.photos), tg = inD(cat.tags), pg = inD(cat.pigeons), hb = inD(cat.hideouts), rs = inD(cat.research);
        return {
          id: d.id, name: d.name,
          crimes: [Math.min(CRIME_QUOTA, save.activities.crimeByDistrict?.[d.id] ?? 0), CRIME_QUOTA],
          backpacks: [bp.filter((q) => has(save.collect.backpacks, q.id)).length, bp.length],
          photos: [ph.filter((q) => has(save.collect.photos, q.id)).length, ph.length],
          tags: [tg.filter((q) => has(save.collect.tags, q.id)).length, tg.length],
          pigeons: [pg.filter((q) => has(save.collect.pigeons, q.id)).length, pg.length],
          base: [hb.filter((q) => has(save.activities.bases, q.id)).length, hb.length],
          research: [rs.filter((q) => has(save.activities.research, q.id)).length, rs.length],
        };
      });
      const medals = (list, store) => list.map((c) => ({ id: c.id, name: c.name, medal: store[c.id]?.medal ?? 0, time: store[c.id]?.time ?? null }));
      return { rows, challenges: medals(cat.challenges, save.activities.challenges), races: medals(cat.races, save.activities.races), bugle: BUGLE.map((a) => ({ ...a, done: has(save.activities.bugle, a.id) })) };
    },
    // Test hooks.
    state() { return { crime: crime ? { kind: crime.kind, x: crime.spot.x, z: crime.spot.z, foes: crime.list.length, car: crime.car ? crime.car.hits : null } : null, base: base ? { id: base.q.id, wave: base.wave } : null, run: run ? { id: run.c.id, i: run.i, t: run.t, count: run.count } : null, task: task ? { id: task.ks.r.id, kind: task.ks.r.task } : null, items: items.length }; },
    forceCrime(kind) { if (crime) endCrime(false); const spot = streetSpot(25, 50); if (!spot) return null; startCrime(kind, spot); return crime && crime.kind; },
    // A new save (slot load, New Game+): collectibles and kiosks from what that save has done.
    reload() { this.stop(); addAllItems(); addKiosks(); },
    stop() { if (nights) this.endNights(); g.prompt(null); if (crime) { for (const e of crime.list) combat.enemies.remove(e); endCrime(false); } if (base) { for (const e of base.list) combat.enemies.remove(e); base = null; } if (run) finishRun(false); if (task) finishTask(false); },
  };
}
