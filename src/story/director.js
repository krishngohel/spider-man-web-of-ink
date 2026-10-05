import * as THREE from 'three';
import { STEPS, actById } from './steps.js';
import { createStoryRunner } from './runner.js';
import { resolveSite } from './sites.js';
import { BOSSES } from './bosses/index.js';
import { GAUNTLET, gauntletMedal } from './gauntlet.js';
import { createProps } from './props.js';

// How many phases each boss has (pips by the boss bar, as in Insomniac's games).
const BOSS_PHASES = { electro: 2, goblin: 2, kingpin: 3, kraven: 2, lizard: 3, mysterio: 3, ock: 3, rhino: 3, sandman: 3, scorpion: 2, shocker: 3, venom: 2, vulture: 2 };
import { createStoryFx, buildMarker } from './storyFx.js';
import { createActors } from './actors.js';
import { LAYER_FX } from '../render/layers.js';
import { COPY } from '../ui/copy.js';
import { comicToon } from '../render/comicShade.js';

// Runs the story (spec 10): the current step from the save, one handler per step type, the
// objective card and waypoint, mission time and weather, retries on defeat (the step starts over;
// a retry is the one place a story beat moves the hero), rewards, and the comic panels drawn in
// engine. Free roam goes on around 'start' steps: the next mission waits at its marker.

export function createDirector(g) {
  const { scene, world, city, combat, hero, ui, save } = g;
  let runner = createStoryRunner(STEPS, save.story);
  let gauntlet = null; // { t, story } while the Villain Gauntlet runs
  const props = createProps({ scene, world });
  const fx = createStoryFx(scene);
  const marker = buildMarker(scene);
  const actors = createActors({ scene, assets: g.assets, buildCharacter: g.buildCharacter, createPoser: g.createPoser, heroDef: g.heroDef });
  const shotCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2200);
  shotCam.layers.enable(LAYER_FX);

  let cur = null;       // { step, site, phase, ... } for the step being run
  let boss = null;      // the boss module of a boss or chase step
  // The phase a boss fight had reached and the health it began at, so a retry resumes there.
  let phaseMark = null;
  let markerOn = false; // the step shows a beacon (hidden only while the hero stands at it)
  let blocking = false; // comic pages up: play waits
  let retryT = -1, retries = 0;
  // Bumped whenever the story is stopped or jumped: a pending card, comic or radio from before
  // must not complete the step that runs now.
  let epoch = 0;
  const genMat = { body: comicToon({ color: 0x5a6a4a }), band: comicToon({ color: 0xf2c230 }) };
  let env = null;
  let started = false;

  const say = (lines, opts) => ui.say(lines, opts);
  const word = (text, p, kind = 'small') => g.word(text, p, kind);
  const shake = (k) => g.shake(k);
  const heroInvuln = () => combat.heroCombat.c.iframes > 0;
  const bossCtx = () => ({
    scene, world, assets: g.assets, combat, hero, city, buildCharacter: g.buildCharacter, createPoser: g.createPoser, getSettings: g.getSettings,
    props, fx, say, word, shake, heroInvuln, sfx: (e) => g.sfx.event(e),
    timer: (label, s) => ui.timer(label, s),
    illusion: (k) => g.illusion?.(k),
    // The poison wins, a fall into the river in a fight: down at once, whatever the iframes.
    knockOut: () => combat.heroCombat.knockOut(),
  });
  let bctx = null; // the context the running boss module was given (it may hang hooks on it)

  function heroD(site) {
    const p = hero.body.p;
    return { d: Math.hypot(p.x - site.x, p.z - site.z), dy: p.y - site.y };
  }

  // Begins whatever step the runner is on.
  function begin() {
    const step = runner.step;
    cur = null;
    if (gauntlet && !step) { finishGauntlet(); return; }
    if (!step) { ui.objective(null); markerOn = false; marker.show(null); g.setWaypoint(null); setEnv(null); return; }
    const site = step.site ? resolveSite(city, step.site) : null;
    cur = { step, site, t: 0, phase: 'run', wave: 0, waveT: 0 };
    // Whose story this is: Miles in his missions, Peter everywhere else.
    // The Gauntlet starts each fight at its arena (a post-game mode, not a story beat).
    if (gauntlet && site) g.placeHero(site.x, site.y + 0.2, site.z + (site.ground ? 8 : 0));
    const who = step.char ?? 'peter';
    if (g.character && g.character() !== who) g.setCharacter(who);
    g.setSuit?.(step.suit ?? null);
    g.setOccupation?.(step.act === 'act4' && !save.story.done.includes('act4.epilogue') ? 'sable' : null);
    if (step.env) setEnv(step.env);
    else if (step.type === 'start') setEnv(null);
    ui.objective(step.text ?? null);
    // Tutorial tips for a fight wait until the fight starts (they used to expire on the way there).
    const fightish = ['fight', 'defend', 'stealth', 'boss', 'chase'].includes(step.type);
    if (step.tutorial && !fightish) ui.tips(step.tutorial);
    cur.tips = fightish ? step.tutorial ?? null : null;
    // A beacon on every place to go (spec F2); hidden once the hero is there.
    markerOn = ['start', 'reach'].includes(step.type) && !!site;
    marker.show(markerOn ? site : null);
    // The camera turns toward where the step happens (spec F3).
    if (site && step.type !== 'radio' && step.type !== 'broadcast' && step.type !== 'title' && step.type !== 'panels' && step.type !== 'credits') g.faceToward?.(site);
    g.setWaypoint(site && ['start', 'reach', 'fight', 'defend', 'stealth', 'boss', 'chase'].includes(step.type) ? { x: site.x, z: site.z, story: true } : null);
    const ep = epoch;
    const done = () => { if (ep === epoch) complete(step.id); };
    switch (step.type) {
      case 'radio': say(step.lines).then(done); break;
      case 'broadcast': say(step.lines, { bugle: true }).then(done); break;
      case 'title': ui.card(step.card, actById(step.act)).then(done); break;
      case 'credits': setBlock(true); ui.credits(COPY.story.credits).then(() => { if (ep === epoch) { setBlock(false); complete(step.id); } }); break;
      case 'panels': cur.phase = 'draw'; cur.drawIn = 2; setBlock(true); break;
      case 'fight': case 'defend': case 'stealth': case 'boss': case 'chase': cur.phase = 'arrive'; break;
      default: break;
    }
    g.persist();
  }

  function complete(id) {
    const step = runner.step;
    if (!step || step.id !== id) return;
    if (step.type === 'fight' || step.type === 'defend' || step.type === 'stealth') g.reward('storyStep');
    // A mission won: a breather, back to full health (spec F3).
    if (['fight', 'defend', 'stealth', 'boss', 'chase'].includes(step.type) && !gauntlet) combat.heroCombat.revive();
    if (step.type === 'stealth' && !cur?.alarm) { g.reward('storyStep'); ui.stamp(COPY.story.ghost); }
    dropGenerator();
    if (step.type === 'boss' && !gauntlet) g.reward('bossDefeated');
    if (step.type === 'start') combat.clear(); // the mission begins: free-roam gangs clear off
    runner.complete(id);
    begin();
    g.persist(); // the last step too (begin saves only when there is a next one)
  }

  function setEnv(e) { env = e; g.setEnv(e); }
  function finishGauntlet() {
    const t = gauntlet.t, medal = gauntletMedal(t);
    const pg = save.postGame;
    const best = pg.gauntlet?.time ?? Infinity;
    pg.gauntlet = { time: Math.min(best, t), medal: Math.max(pg.gauntlet?.medal ?? 0, medal) };
    ui.timer(null);
    ui.objective(null);
    ui.stamp(`GAUNTLET ${['', 'BRONZE', 'SILVER', 'GOLD', 'ULTIMATE'][medal]}! ${Math.round(t)} S`);
    g.reward('bossDefeated', { xp: 5000 });
    g.persist();
    gauntlet = null;
    g.onGauntletEnd?.();
  }
  function setBlock(on) { blocking = on; g.onBlock?.(on); }

  // Comic panels: each shot puts the cast in the city and draws one frame through the ink pipeline.
  function drawPanels(step) {
    const out = [];
    g.hideHero(true);
    for (const pg of step.pages) {
      const panels = [];
      for (const p of pg.panels) {
        const s = p.shot, site = resolveSite(city, s.at);
        const base = { x: site.x, y: site.y - 0.9, z: site.z };
        actors.hideAll();
        const camP = { x: s.cam[0], z: s.cam[2] };
        const at = (who) => s.cast.find((q) => q.who === who)?.p ?? [0, 0, 0];
        const deg = (from, to) => (Math.atan2(to.x - from[0], to.z - from[2]) * 180) / Math.PI;
        for (const c of s.cast) {
          let yaw = c.yaw;
          if (yaw === 'cam') yaw = deg(c.p, camP);
          else if (typeof yaw === 'string') {
            const [kind, who] = yaw.split(':'), o = at(who), toWho = deg(c.p, { x: o[0], z: o[2] }), toCam = deg(c.p, camP);
            let d = toCam - toWho; while (d > 180) d -= 360; while (d < -180) d += 360;
            yaw = kind === 'to' ? toWho : toWho + d * 0.5;
          }
          actors.place(c.who, { x: base.x + c.p[0], y: base.y + c.p[1], z: base.z + c.p[2] }, yaw, c.pose, c.who === 'hero' ? s.suit : null);
        }
        shotCam.fov = s.fov ?? 45;
        shotCam.aspect = g.aspect();
        shotCam.updateProjectionMatrix();
        shotCam.position.set(base.x + s.cam[0], base.y + s.cam[1], base.z + s.cam[2]);
        shotCam.lookAt(base.x + s.look[0], base.y + s.look[1], base.z + s.look[2]);
        g.focusSun(base.x, base.z);
        panels.push({ ...p, img: g.snapshot(shotCam) });
      }
      out.push({ ...pg, panels });
    }
    actors.hideAll();
    g.hideHero(false);
    return out;
  }

  function startBoss() {
    const step = cur.step;
    bctx = { ...bossCtx(), site: cur.site, step };
    boss = BOSSES[step.boss](bctx);
    cur.phase = 'fight';
    showFightTips();
    if (step.type === 'boss') {
      // A retry starts at the phase the last attempt reached (spec 1.10): the boss begins with the
      // health that phase began at, and its own rules step it into that phase.
      if (phaseMark && phaseMark.step === step.id && phaseMark.phase > 1 && retries > 0) {
        if (boss.setPhase) boss.setPhase(phaseMark.phase);
        else { const e = boss.actor.e; e.hp = Math.max(1, e.maxHp * (phaseMark.frac - 0.005)); }
        word(`PHASE ${phaseMark.phase}`, boss.actor.body.p, 'big');
      } else { phaseMark = { step: step.id, phase: 1, frac: 1 }; g.bossIntro?.(); }
    }
    g.setWaypoint(null);
    ui.objective(step.text);
  }
  function showFightTips() { if (cur?.tips) { ui.tips(cur.tips); cur.tips = null; } }
  function endBoss() {
    boss?.dispose();
    boss = null;
    bctx = null;
    ui.timer(null);
    ui.boss(null);
    fx.clear();
  }

  // Lost a fight: the step starts over from its site.
  function retry() {
    retryT = 0; retries++;
    g.fade(true);
    ui.stamp(COPY.story.retry);
  }
  function retryStep(dt) {
    retryT += dt;
    if (retryT < 1.1) return;
    retryT = -1;
    endBoss();
    dropGenerator();
    combat.clear();
    props.clear();
    const s = cur?.site;
    if (s) g.placeHero(s.x + (s.ground ? 0 : 0), s.y + 0.2, s.z + (s.ground ? 8 : 0));
    combat.heroCombat.revive();
    g.fade(false);
    begin();
  }

  function update(dt) {
    marker.update(dt);
    if (markerOn) marker.group.visible = Math.hypot(hero.body.p.x - marker.group.position.x, hero.body.p.z - marker.group.position.z) > 7;
    fx.update(dt);
    ui.update(dt);
    if (retryT >= 0) { retryStep(dt); return; }
    if (!cur) return;
    const { step, site } = cur;
    cur.t += dt;
    props.step(dt, {
      hero, heroInvuln,
      hitHero: (p, v) => { const l = Math.hypot(v.x, v.z) || 1; combat.heroHit({ dmg: Math.round(p.K.dmg * 0.27), dir: { x: v.x / l, z: v.z / l }, from: null, unblockable: true }); word('WHAM!', hero.body.p, 'hit'); },
      hitBoss: (target, p) => {
        const b = target.boss;
        if (!b) return;
        b.damage(p.K.dmg); b.stun(2.6);
        word('KRASH!', target.body.p, 'big'); shake(0.7); fx.shock(target.body.p, 4);
      },
      onBreak: (p) => fx.shock(p.p, 2.4),
    });
    switch (step.type) {
      case 'start': case 'reach': {
        const h = heroD(site);
        const near = step.type === 'start' ? h.d < 18 && Math.abs(h.dy) < 30 : h.d < (step.radius ?? 25) && (step.minY == null || h.dy > step.minY);
        if (near) complete(step.id);
        break;
      }
      case 'panels':
        if (cur.phase === 'draw' && --cur.drawIn <= 0) {
          cur.phase = 'read';
          const pages = drawPanels(step);
          const ep = epoch;
          ui.comic(pages).then(() => { if (ep !== epoch) return; setBlock(false); complete(step.id); });
        }
        break;
      case 'fight': case 'defend': {
        if (cur.phase === 'arrive') {
          if (heroD(site).d < 70) { cur.phase = 'fight'; cur.wave = 0; if (step.type === 'defend') placeGenerator(site); spawnWave(); showFightTips(); }
          break;
        }
        // Defend: the generator is a target too; if it goes, the step starts over.
        if (cur.gen) {
          ui.boss({ name: COPY.story.generator, hp: cur.gen.hp / cur.gen.max });
          if (cur.gen.hp <= 0) { fx.shock(cur.gen.p, 6); word('KA-BLAM!', cur.gen.p, 'big'); dropGenerator(); retry(); break; }
        }
        // Walked away from the fight: the crew packs up and waits for you to come back.
        if (heroD(site).d > 260) { for (const e of cur.waveList ?? []) combat.enemies.remove(e); combat.clearEncounter(); dropGenerator(); cur.phase = 'arrive'; break; }
        // The wave is over when every one of its own enemies is out (webbed, pinned or down).
        const left = (cur.waveList ?? []).filter((e) => e.alive && !['out', 'webbed', 'pinned'].includes(e.state)).length;
        if (left === 0) {
          cur.waveT += dt;
          if (cur.waveT > 1.4) {
            cur.waveT = 0;
            if (++cur.wave < step.waves.length) { spawnWave(); g.caption(COPY.combat.more ?? 'MORE OF THEM!'); } else { ui.stamp(COPY.story.missionDone); g.sfx.event({ type: 'stamp' }); complete(step.id); }
          }
        }
        break;
      }
      case 'stealth': {
        if (cur.phase === 'arrive') {
          if (heroD(site).d < 90) { cur.phase = 'sneak'; spawnGuards(); showFightTips(); }
          break;
        }
        if (heroD(site).d > 260) { for (const e of cur.waveList ?? []) combat.enemies.remove(e); ui.stealth(null); cur.phase = 'arrive'; break; }
        // The suspicion marks over the guards and the takedown prompt.
        const marks = [];
        for (const e of cur.waveList) {
          if (!e.alive || ['out', 'webbed', 'pinned'].includes(e.state)) continue;
          marks.push({ p: e.body.p, k: e.alerted ? 1 : e.suspicion ?? 0, alert: !!e.alerted });
        }
        // A guard hit or webbed in plain view (not a silent takedown) brings everyone.
        if (!cur.alarm && cur.waveList.some((e) => e.alerted && e.alive && !['out', 'webbed', 'pinned'].includes(e.state))) raiseAlarm();
        const td = combat.enemies.takedownTarget?.(hero);
        ui.stealth(marks, td ? { p: td.e.body.p, kind: td.kind } : null, g.screen);
        const left = cur.waveList.filter((e) => e.alive && !['out', 'webbed', 'pinned'].includes(e.state)).length;
        if (left === 0) { ui.stealth(null); ui.stamp(COPY.story.missionDone); g.sfx.event({ type: 'stamp' }); complete(step.id); }
        break;
      }
      case 'boss': case 'chase': {
        if (cur.phase === 'arrive') {
          const h = heroD(site);
          const ready = step.type === 'chase' ? h.d < 120 : h.d < 70 && h.dy > -12;
          if (ready) startBoss();
          break;
        }
        if (!boss) break;
        boss.update(dt);
        const ph = boss.state?.phase;
        if (step.type === 'boss' && phaseMark?.step === step.id && typeof ph === 'number' && ph > phaseMark.phase) { phaseMark.phase = ph; phaseMark.frac = boss.actor.hpFrac(); }
        if (boss.objective !== undefined) { ui.objective(boss.objective ?? step.text); g.setWaypoint(boss.waypoint ? { ...boss.waypoint, story: true } : null); }
        if (step.type === 'boss') ui.boss({ name: boss.actor.name, hp: boss.actor.hpFrac(), phase: boss.state?.phase ?? 1, phases: BOSS_PHASES[step.boss] ?? 0 });
        if (boss.failed) { retry(); break; }
        if (boss.done && cur.phase === 'fight') {
          cur.phase = 'won'; cur.wonT = 0; phaseMark = null;
          if (step.type === 'boss') g.bossDown?.();
          if (step.type === 'boss') { ui.stamp(COPY.story.bossDown); g.sfx.event({ type: 'stamp' }); }
        }
        if (cur.phase === 'won') {
          cur.wonT += dt;
          if (cur.wonT > (step.type === 'boss' ? 2.6 : 1.2)) { endBoss(); complete(step.id); }
        }
        break;
      }
      default: break;
    }
  }

  // Guards on patrol for a stealth step; the first one to raise the alarm brings everyone (and more).
  function spawnGuards() {
    const step = cur.step, s = cur.site;
    cur.alarm = false;
    cur.waveList = step.guards.map((gd, i) => {
      const r = gd.route.map((q) => ({ x: s.x + q.x, z: s.z + q.z }));
      const e = combat.enemies.spawn({ x: r[0].x, z: r[0].z, faction: gd.faction ?? step.faction, arch: gd.arch, look: i, alert: false });
      e.stealth = true; e.patrol = r; e.suspicion = 0; e.facing = Math.random() * Math.PI * 2;
      return e;
    });
  }
  function raiseAlarm() {
    if (!cur || cur.step.type !== 'stealth' || cur.alarm) return;
    cur.alarm = true;
    for (const e of cur.waveList) if (e.alive && !e.alerted) { e.alerted = true; e.state = 'engage'; }
    word('ALARM!', hero.body.p, 'big');
    g.caption(COPY.story.alarm);
    const rf = cur.step.reinforce;
    if (rf) {
      const s = cur.site;
      const d = city.districts.find((q) => s.x >= q.minX && s.x < q.maxX && s.z >= q.minZ && s.z < q.maxZ);
      const enc = combat.spawnGang(s.x + 20, s.z + 20, d?.id ?? 'midtown', { faction: rf.faction, mix: rf.mix, alert: true, kind: 'story' });
      cur.waveList.push(...enc.list);
    }
  }

  // The thing to protect in a defend step: a generator the enemies go for if it is nearer.
  function placeGenerator(site) {
    dropGenerator();
    const p = { x: site.x - 4, y: 0.9, z: site.z - 2 };
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 1.1), genMat.body);
    body.position.y = 0.65;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.22, 1.12), genMat.band);
    band.position.y = 0.95;
    mesh.add(body, band);
    mesh.position.set(p.x, 0, p.z);
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(mesh);
    cur.gen = { p, hp: 100, max: 100, mesh };
  }
  function dropGenerator() {
    if (!cur?.gen) return;
    scene.remove(cur.gen.mesh);
    cur.gen = null;
    ui.boss(null);
  }

  function spawnWave() {
    const w = cur.step.waves[cur.wave];
    const d = city.districts.find((q) => cur.site.x >= q.minX && cur.site.x < q.maxX && cur.site.z >= q.minZ && cur.site.z < q.maxZ);
    cur.waveList = combat.spawnGang(cur.site.x, cur.site.z, d?.id ?? 'midtown', { faction: w.faction, mix: w.mix, alert: true, kind: 'story', level: w.level ?? 1 }).list;
  }

  return {
    get blocking() { return blocking; },
    // Free-roam gangs stay away while a mission runs.
    get quiet() { return !!cur && cur.step.type !== 'start'; },
    get inFight() { return !!cur && ['fight', 'defend', 'stealth', 'boss', 'chase'].includes(cur.step.type) && cur.phase !== 'arrive'; },
    get env() { return env; },
    get step() { return runner.step; },
    get finished() { return runner.finished; },
    get marker() { const s = runner.step; return s && s.type === 'start' && cur?.site ? { x: cur.site.x, z: cur.site.z } : null; },
    // From the save's step, or from a given step (chapter select, ?at=).
    start(at = null) { if (!started) { started = true; retries = 0; runner = createStoryRunner(STEPS, save.story); if (at) runner.jump(at); begin(); } },
    stop() { g.setOccupation?.(null); if (gauntlet) { gauntlet = null; ui.timer(null); runner = createStoryRunner(STEPS, save.story); } epoch++; endBoss(); dropGenerator(); combat.clear(); ui.clear(); g.setSuit?.(null); markerOn = false; marker.show(null); g.setWaypoint(null); setEnv(null); cur = null; started = false; setBlock(false); if (retryT >= 0) { retryT = -1; g.fade(false); } },
    update(dt) { if (gauntlet && retryT < 0) { gauntlet.t += dt; ui.timer('GAUNTLET', gauntlet.t); } update(dt); },
    get gauntlet() { return gauntlet ? { t: gauntlet.t, step: runner.step?.id ?? null, index: runner.index } : null; },
    startGauntlet(from = 0) {
      this.stop();
      gauntlet = { t: 0, story: { step: GAUNTLET[from].id, done: GAUNTLET.slice(0, from).map((s) => s.id), choices: {} } };
      runner = createStoryRunner(GAUNTLET, gauntlet.story);
      started = true; retries = 0;
      begin();
    },
    // Before combat reads the intent: a yank aimed at a loose crate throws it at the boss.
    preStep(intent, cam) {
      if (!boss) return;
      // A boss's own melee target first (Electro's roof relays): the blow goes there.
      if (intent.attackPressed && boss.attackAt?.(hero.body.p)) { intent.attackPressed = false; g.sfx.event({ type: 'punch', heavy: true }); return; }
      if (!intent.yankPressed) return;
      // A boss's own yank targets first (Electro's relays), then loose crates.
      const own = boss.yankAt?.(cam, hero.body.p);
      if (own) { intent.yankPressed = false; intent.hangPressed = false; g.sfx.event({ type: 'thwip' }); return; }
      const thrown = props.tryYank(cam, hero.body.p, boss.actor.e);
      if (thrown) { intent.yankPressed = false; intent.hangPressed = false; word('YANK!', thrown.p, 'small'); g.sfx.event({ type: 'thwip' }); }
    },
    // The hero went down. In a mission fight the step restarts; true means it was handled.
    onDefeat() {
      // Knocked out after the boss already went down: no replay, just back on your feet.
      if (cur?.phase === 'won') { combat.heroCombat.revive(); return true; }
      if (this.inFight && retryT < 0) { retry(); return true; }
      return retryT >= 0;
    },
    // Spider-sense scan (V): the running boss may use it (the real Mysterio).
    scan() { bctx?.onScan?.(); },
    // Combat events a boss cares about (perfect dodges against the poison).
    onCombatEvent(e) {
      boss?.onEvent?.(e);
      if (e.type === 'spotted') raiseAlarm();
    },
    // Extra targets the enemies may go for (the generator in a defend step).
    targets() {
      const gen = cur?.gen;
      if (!gen || gen.hp <= 0) return null;
      // One target object per generator, kept: the enemies' director keys its turns on the body.
      gen.target ??= [{ body: { p: gen.p, v: { x: 0, y: 0, z: 0 } }, invuln: () => false, hit: (h) => { gen.hp = Math.max(0, gen.hp - h.dmg * 0.8); word('CLANG!', gen.p, 'small'); return true; } }];
      return gen.target;
    },
    // Test hooks.
    state() {
      return { step: runner.step?.id ?? null, type: runner.step?.type ?? null, phase: cur?.phase ?? null, wave: cur?.wave ?? 0, finished: runner.finished, boss: boss ? { ...boss.state } : null, site: cur?.site ? { x: cur.site.x, y: cur.site.y, z: cur.site.z } : null, blocking, talking: ui.talking, retries, gen: cur?.gen ? cur.gen.hp : null, alarm: !!cur?.alarm,
        guards: cur?.step?.type === 'stealth' && cur.waveList ? cur.waveList.map((e) => ({ x: e.body.p.x, y: e.body.p.y, z: e.body.p.z, state: e.state, alerted: !!e.alerted, suspicion: e.suspicion ?? 0, facing: e.facing })) : null, done: [...save.story.done] };
    },
    skip() {
      const s = runner.step;
      if (!s) return;
      if (blocking) { ui.skipComic(); return; }
      if (s.type === 'radio' || s.type === 'broadcast') { ui.skipRadio(); return; }
      endBoss(); combat.clear();
      complete(s.id);
    },
    jump(id) { epoch++; if (retryT >= 0) { retryT = -1; g.fade(false); } endBoss(); dropGenerator(); combat.clear(); ui.clear(); setBlock(false); if (runner.jump(id)) { started = true; retries = 0; begin(); return true; } return false; },
    bossPhase(n) { boss?.setPhase(n); },
    get boss() { return boss; },
    props, fx,
  };
}
