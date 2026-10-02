import * as THREE from 'three';
import { STEPS, actById } from './steps.js';
import { createStoryRunner } from './runner.js';
import { resolveSite } from './sites.js';
import { BOSSES } from './bosses/index.js';
import { createProps } from './props.js';
import { createStoryFx, buildMarker } from './storyFx.js';
import { createActors } from './actors.js';
import { LAYER_FX } from '../render/layers.js';
import { COPY } from '../ui/copy.js';

// Runs the story (spec 10): the current step from the save, one handler per step type, the
// objective card and waypoint, mission time and weather, retries on defeat (the step starts over;
// a retry is the one place a story beat moves the hero), rewards, and the comic panels drawn in
// engine. Free roam goes on around 'start' steps: the next mission waits at its marker.

export function createDirector(g) {
  const { scene, world, city, combat, hero, ui, save } = g;
  let runner = createStoryRunner(STEPS, save.story);
  const props = createProps({ scene, world });
  const fx = createStoryFx(scene);
  const marker = buildMarker(scene);
  const actors = createActors({ scene, assets: g.assets, buildCharacter: g.buildCharacter, createPoser: g.createPoser, heroDef: g.heroDef });
  const shotCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2200);
  shotCam.layers.enable(LAYER_FX);

  let cur = null;       // { step, site, phase, ... } for the step being run
  let boss = null;      // the boss module of a boss or chase step
  let blocking = false; // comic pages up: play waits
  let retryT = -1, retries = 0;
  let env = null;
  let started = false;

  const say = (lines, opts) => ui.say(lines, opts);
  const word = (text, p, kind = 'small') => g.word(text, p, kind);
  const shake = (k) => g.shake(k);
  const heroInvuln = () => combat.heroCombat.c.iframes > 0;
  const bossCtx = () => ({
    scene, world, assets: g.assets, combat, hero, city, buildCharacter: g.buildCharacter, createPoser: g.createPoser, getSettings: g.getSettings,
    props, fx, say, word, shake, heroInvuln, sfx: (e) => g.sfx.event(e),
  });

  function heroD(site) {
    const p = hero.body.p;
    return { d: Math.hypot(p.x - site.x, p.z - site.z), dy: p.y - site.y };
  }

  // Begins whatever step the runner is on.
  function begin() {
    const step = runner.step;
    cur = null;
    if (!step) { ui.objective(null); marker.show(null); g.setWaypoint(null); setEnv(null); return; }
    const site = step.site ? resolveSite(city, step.site) : null;
    cur = { step, site, t: 0, phase: 'run', wave: 0, waveT: 0 };
    if (step.env) setEnv(step.env);
    else if (step.type === 'start') setEnv(null);
    ui.objective(step.text ?? null);
    if (step.tutorial) ui.tips(step.tutorial);
    marker.show(step.type === 'start' ? site : null);
    g.setWaypoint(site && ['start', 'reach', 'fight', 'boss', 'chase'].includes(step.type) ? { x: site.x, z: site.z, story: true } : null);
    switch (step.type) {
      case 'radio': say(step.lines).then(() => complete(step.id)); break;
      case 'broadcast': say(step.lines, { bugle: true }).then(() => complete(step.id)); break;
      case 'title': ui.card(step.card, actById(step.act)).then(() => complete(step.id)); break;
      case 'panels': cur.phase = 'draw'; cur.drawIn = 2; setBlock(true); break;
      case 'fight': case 'boss': case 'chase': cur.phase = 'arrive'; break;
      default: break;
    }
    g.persist();
  }

  function complete(id) {
    const step = runner.step;
    if (!step || step.id !== id) return;
    if (step.type === 'fight') g.reward('storyStep');
    if (step.type === 'boss') g.reward('bossDefeated');
    if (step.type === 'start') combat.clear(); // the mission begins: free-roam gangs clear off
    runner.complete(id);
    begin();
  }

  function setEnv(e) { env = e; g.setEnv(e); }
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
          actors.place(c.who, { x: base.x + c.p[0], y: base.y + c.p[1], z: base.z + c.p[2] }, yaw, c.pose);
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
    boss = BOSSES[step.boss]({ ...bossCtx(), site: cur.site, step });
    cur.phase = 'fight';
    g.setWaypoint(null);
    ui.objective(step.text);
  }
  function endBoss() {
    boss?.dispose();
    boss = null;
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
    fx.update(dt);
    ui.update(dt);
    if (retryT >= 0) { retryStep(dt); return; }
    if (!cur) return;
    const { step, site } = cur;
    cur.t += dt;
    props.step(dt, {
      hero, heroInvuln,
      hitHero: (p, v) => { const l = Math.hypot(v.x, v.z) || 1; combat.heroHit({ dmg: 16, dir: { x: v.x / l, z: v.z / l }, from: null, unblockable: true }); word('WHAM!', hero.body.p, 'hit'); },
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
          ui.comic(pages).then(() => { setBlock(false); complete(step.id); });
        }
        break;
      case 'fight': {
        if (cur.phase === 'arrive') {
          if (heroD(site).d < 70) { cur.phase = 'fight'; cur.wave = 0; spawnWave(); }
          break;
        }
        const enc = combat.encounter;
        if (!enc || enc.kind !== 'story') {
          cur.waveT += dt;
          if (cur.waveT > 1.4) {
            cur.waveT = 0;
            if (++cur.wave < step.waves.length) { spawnWave(); g.caption(COPY.combat.more ?? 'MORE OF THEM!'); } else { ui.stamp(COPY.story.missionDone); g.sfx.event({ type: 'stamp' }); complete(step.id); }
          }
        }
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
        if (boss.objective !== undefined) { ui.objective(boss.objective ?? step.text); g.setWaypoint(boss.waypoint ? { ...boss.waypoint, story: true } : null); }
        if (step.type === 'boss') ui.boss({ name: boss.actor.name, hp: boss.actor.hpFrac() });
        if (boss.failed) { retry(); break; }
        if (boss.done && cur.phase === 'fight') {
          cur.phase = 'won'; cur.wonT = 0;
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

  function spawnWave() {
    const w = cur.step.waves[cur.wave];
    const d = city.districts.find((q) => cur.site.x >= q.minX && cur.site.x < q.maxX && cur.site.z >= q.minZ && cur.site.z < q.maxZ);
    combat.spawnGang(cur.site.x, cur.site.z, d?.id ?? 'midtown', { faction: w.faction, mix: w.mix, alert: true, kind: 'story', level: w.level ?? 1 });
  }

  return {
    get blocking() { return blocking; },
    // Free-roam gangs stay away while a mission runs.
    get quiet() { return !!cur && cur.step.type !== 'start'; },
    get inFight() { return !!cur && ['fight', 'boss', 'chase'].includes(cur.step.type) && cur.phase !== 'arrive'; },
    get env() { return env; },
    get step() { return runner.step; },
    get finished() { return runner.finished; },
    get marker() { const s = runner.step; return s && s.type === 'start' && cur?.site ? { x: cur.site.x, z: cur.site.z } : null; },
    // From the save's step, or from a given step (chapter select, ?at=).
    start(at = null) { if (!started) { started = true; retries = 0; runner = createStoryRunner(STEPS, save.story); if (at) runner.jump(at); begin(); } },
    stop() { endBoss(); combat.clear(); ui.clear(); marker.show(null); g.setWaypoint(null); setEnv(null); cur = null; started = false; setBlock(false); },
    update,
    // Before combat reads the intent: a yank aimed at a loose crate throws it at the boss.
    preStep(intent, cam) {
      if (!intent.yankPressed || !boss) return;
      const thrown = props.tryYank(cam, hero.body.p, boss.actor.e);
      if (thrown) { intent.yankPressed = false; intent.hangPressed = false; word('YANK!', thrown.p, 'small'); g.sfx.event({ type: 'thwip' }); }
    },
    // The hero went down. In a mission fight the step restarts; true means it was handled.
    onDefeat() { if (this.inFight && retryT < 0) { retry(); return true; } return retryT >= 0; },
    // Test hooks.
    state() {
      return { step: runner.step?.id ?? null, type: runner.step?.type ?? null, phase: cur?.phase ?? null, wave: cur?.wave ?? 0, finished: runner.finished, boss: boss ? { ...boss.state } : null, site: cur?.site ? { x: cur.site.x, y: cur.site.y, z: cur.site.z } : null, blocking, talking: ui.talking, retries, done: [...save.story.done] };
    },
    skip() {
      const s = runner.step;
      if (!s) return;
      if (blocking) { ui.skipComic(); return; }
      if (s.type === 'radio' || s.type === 'broadcast') { ui.skipRadio(); return; }
      endBoss(); combat.clear();
      complete(s.id);
    },
    jump(id) { endBoss(); combat.clear(); ui.clear(); setBlock(false); if (runner.jump(id)) { started = true; retries = 0; begin(); return true; } return false; },
    bossPhase(n) { boss?.setPhase(n); },
    get boss() { return boss; },
    props, fx,
  };
}
