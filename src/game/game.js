import * as THREE from 'three';
import { createRenderer } from '../render/renderer.js';
import { createInkPipeline } from '../render/inkPipeline.js';
import { getQuality } from '../render/quality.js';
import { createDynamicRes, sanitizeResScale } from '../render/dynamicRes.js';
import { createFrameCapDetector } from '../render/frameCap.js';
import { PALETTE } from '../render/palette.js';
import { LAYER_FX } from '../render/layers.js';
import { createFixedStep } from '../core/fixedStep.js';
import { createInput } from '../core/input.js';
import { loadSettings, saveSettings } from '../core/settings.js';
import { STEP, MAX_SUBSTEPS, G, tune } from '../physics/constants.js';
import { createWorld } from '../physics/world.js';
import { findAimPoint, findZipPoint, findAnchor } from '../physics/anchors.js';
import { buildTestCity } from '../world/testCity.js';
import { buildCityMeshes, setNight } from '../world/cityMesh.js';
import { createSky } from '../world/sky.js';
import { buildStreetProps, carBoxes } from '../world/streetProps.js';
import { buildStreetMeshes } from '../world/streetMesh.js';
import { createHero, emptyIntent } from '../hero/controller.js';
import { loadHeroAssets, buildHeroModel } from '../hero/model.js';
import { createPoser } from '../hero/pose.js';
import { createWebLine } from '../hero/webLine.js';
import { createCameraRig } from '../camera/cameraRig.js';
import { createSfx } from '../audio/sfx.js';
import { createHud } from '../ui/hud.js';
import { createMenus } from '../ui/menus.js';
import { createDevPanel } from '../ui/devPanel.js';
import { el } from '../ui/dom.js';
import { createFx } from './fx.js';

export async function startGame({ canvas, params, onProgress = () => {} }) {
  performance.mark('boot:start');
  let settings = loadSettings(window.localStorage);
  let quality = getQuality(settings.quality);
  const dev = params.has('dev');

  // Renderer and look ------------------------------------------------------------------------
  const renderer = createRenderer(canvas, quality);
  const basePixelRatio = () => Math.min(window.devicePixelRatio, quality.pixelRatioCap);
  const ink = createInkPipeline(renderer, quality, { gpuTime: params.has('gputime') });
  ink.setComic(quality.comic);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.haze, 320, quality.viewDistance);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2200);
  camera.layers.enable(LAYER_FX);
  const sky = createSky(scene);
  const hemi = new THREE.HemisphereLight(PALETTE.skyMid, 0xb8a58c, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.9);
  const sunDir = new THREE.Vector3(0.4, 0.6, 0.5).normalize();
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(quality.shadowMapSize || 1024, quality.shadowMapSize || 1024);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 700 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  setNight(0);

  // World ------------------------------------------------------------------------------------
  const city = buildTestCity();
  const world = createWorld();
  for (const b of city.boxes) world.addBox(b);
  const street = buildStreetProps(city);
  for (const b of carBoxes(street)) world.addBox(b);
  world.build();
  buildCityMeshes(city, scene, quality);
  buildStreetMeshes(street, scene, quality);
  onProgress(0.15);

  const assets = await loadHeroAssets('./assets/', (f) => onProgress(0.15 + f * 0.7));
  const heroModel = buildHeroModel(assets);
  scene.add(heroModel.root);
  const poser = createPoser(heroModel);
  const webLine = createWebLine(scene);
  const fx = createFx(scene);

  const hero = createHero(world, { gravity: settings.gravity, assist: settings.swingAssist });
  const spawn = city.spawn;
  hero.place(spawn.x, spawn.y, spawn.z, 0, 0, 0, 'ground');
  const rig = createCameraRig();
  rig.yaw = 0; rig.pitch = 0.15;

  // Input, sound, UI -----------------------------------------------------------------------------
  const input = createInput({ target: window, bindings: settings.bindings });
  const sfx = createSfx(() => settings.volume);
  const uiRoot = el('div', { class: 'ui-layer' });
  document.body.append(uiRoot);
  const hud = createHud(uiRoot, () => settings);
  const devPanel = createDevPanel(uiRoot);
  if (dev) devPanel.show();

  let mode = 'title';
  const menus = createMenus(uiRoot, {
    getSettings: () => settings,
    setSettings: applySettings,
    input,
    onPlay: () => enterPlay(),
    onResume: () => resume(),
    onRestart: () => { hero.place(spawn.x, spawn.y, spawn.z, 0, 0, 0, 'ground'); resume(); },
    onQuit: () => toTitle(),
  });

  function applySettings(next) {
    const prevQuality = settings.quality;
    settings = next;
    saveSettings(window.localStorage, settings);
    input.setBindings(settings.bindings);
    hero.gravity = settings.gravity;
    hero.assist = settings.swingAssist;
    sfx.applyVolume();
    if (settings.quality !== prevQuality) {
      quality = getQuality(settings.quality);
      ink.setComic(quality.comic);
      const shadows = quality.shadows;
      if (renderer.shadowMap.enabled !== shadows) {
        renderer.shadowMap.enabled = shadows;
        sun.castShadow = shadows;
        scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      }
      scene.fog.far = quality.viewDistance;
    }
    dynRes.setEnabled(settings.dynamicRes);
    resize();
  }

  // Resolution ---------------------------------------------------------------------------------
  const dynRes = createDynamicRes({ missLimit: 0.03, start: devicePixelRatio > 1.5 ? 0.8 : 1, onChange: () => resize() });
  dynRes.setEnabled(settings.dynamicRes);
  const capDetector = createFrameCapDetector();
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(basePixelRatio() * sanitizeResScale(settings.renderScale, dynRes.scale, 0.45));
    renderer.setSize(w, h, false);
    ink.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // Pointer lock: the first click after the pointer was released only re-locks (Safari needs a
  // real user gesture, and the click must not also fire whatever it's bound to).
  const locked = () => document.pointerLockElement === canvas;
  canvas.addEventListener('mousedown', (e) => {
    sfx.unlock();
    if (mode === 'play' && !locked()) {
      input.swallowCode('Mouse' + e.button);
      canvas.requestPointerLock?.()?.catch?.(() => {});
    }
  });
  document.addEventListener('pointerlockchange', () => {
    if (!locked() && mode === 'play' && !menus.open) pauseGame();
  });
  addEventListener('keydown', (e) => {
    sfx.unlock();
    if (e.code === 'Backquote') devPanel.toggle();
    // Esc with the pointer locked makes the browser release it (which pauses); some browsers then
    // also deliver the keydown. That one must not resume the game straight away.
    if (e.code === 'Escape' && mode === 'paused' && menus.pauseOpen && !input.capturing && performance.now() - pausedAt > 300) { e.preventDefault(); resume(); }
  });

  function enterPlay() {
    mode = 'play';
    resetIntent();
    menus.hideAll();
    hud.show(true);
    input.setEnabled(true);
    // The mouse is only captured when the player clicks the game view (never on a menu button).
    sfx.unlock();
  }
  let pausedAt = 0;
  function pauseGame() {
    mode = 'paused';
    pausedAt = performance.now();
    input.setEnabled(false);
    // A locked pointer sends every click to the canvas: release it so the menu can be clicked.
    if (locked()) document.exitPointerLock();
    menus.showPause();
  }
  function resume() {
    mode = 'play';
    resetIntent();
    menus.hideAll();
    input.setEnabled(true);
  }
  function toTitle() {
    mode = 'title';
    hud.show(false);
    input.setEnabled(false);
    hero.place(spawn.x, spawn.y, spawn.z, 0, 0, 0, 'ground');
    if (locked()) document.exitPointerLock();
    menus.showTitle();
  }

  // Intent -----------------------------------------------------------------------------------------
  const intent = emptyIntent();
  let swingLatch = false;
  // Edges (pressed / released) are judged against what the physics last consumed, and presses are
  // latched until a step runs: on a fast display many frames run no physics step at all, and a
  // tap read on one of those frames must still reach the hero (code review: taps were dropped).
  let consumedSwing = false, consumedJump = false;
  function buildIntent() {
    const sy = Math.sin(rig.yaw), cy = Math.cos(rig.yaw);
    // Camera-relative: forward is where the camera looks (flattened), right is (-cos, sin).
    intent.moveX = sy * input.move.y - cy * input.move.x;
    intent.moveZ = cy * input.move.y + sy * input.move.x;
    intent.camFwd.x = rig.fwd.x; intent.camFwd.y = rig.fwd.y; intent.camFwd.z = rig.fwd.z;
    intent.camPos.x = rig.pos.x; intent.camPos.y = rig.pos.y; intent.camPos.z = rig.pos.z;
    let swing;
    if (settings.swingToggle) {
      if (input.pressed('swing')) swingLatch = !swingLatch;
      if (hero.state === 'ground' && !input.down('swing')) swingLatch = false;
      swing = swingLatch || (hero.state === 'ground' && input.down('swing'));
    } else swing = input.down('swing');
    intent.swing = swing;
    // A press counts when the button went down since the last step, or when a keydown arrived this
    // frame even though the button was already down for the last step (let go and pressed again
    // between frames: a fast re-tap).
    intent.swingPressed = intent.swingPressed || (swing && !consumedSwing) || (swing && !settings.swingToggle && input.pressed('swing'));
    intent.swingReleased = !swing && consumedSwing;
    const jump = input.down('jump');
    intent.jump = jump;
    intent.jumpPressed = intent.jumpPressed || input.pressed('jump');
    intent.jumpReleased = !jump && consumedJump;
    intent.zipPressed = intent.zipPressed || input.pressed('zip');
    intent.hangPressed = intent.hangPressed || input.pressed('hang');
    intent.climb = input.move.y;
    intent.dive = input.down('dive');
  }
  const clearEdges = () => {
    intent.swingPressed = false; intent.swingReleased = false; intent.jumpPressed = false; intent.jumpReleased = false; intent.zipPressed = false; intent.hangPressed = false;
    consumedSwing = intent.swing; consumedJump = intent.jump;
  };
  const resetIntent = () => { clearEdges(); intent.swing = false; intent.jump = false; consumedSwing = false; consumedJump = false; swingLatch = false; };

  // Anchor preview for the HUD, refreshed ten times a second.
  const preview = { visible: false, x: 0, y: 0, zip: false, valid: false };
  const pv = new THREE.Vector3();
  let previewT = 0, previewPoint = null;
  // Every frame: would a web shot now stick, and where? (The same aim test the hero uses.)
  const aimCam = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1 };
  function updatePreview(dt) {
    previewT -= dt;
    if (previewT <= 0) {
      previewT = 1 / 30;
      aimCam.x = rig.pos.x; aimCam.y = rig.pos.y; aimCam.z = rig.pos.z;
      aimCam.fx = rig.fwd.x; aimCam.fy = rig.fwd.y; aimCam.fz = rig.fwd.z;
      previewPoint = findAimPoint(world, hero.body, aimCam);
      preview.valid = !!previewPoint;
      preview.zip = false;
    }
    preview.visible = false;
    if (previewPoint) {
      pv.set(previewPoint.x, previewPoint.y, previewPoint.z).project(camera);
      if (pv.z < 1 && Math.abs(pv.x) < 1.1 && Math.abs(pv.y) < 1.1) {
        preview.visible = true;
        preview.x = (pv.x * 0.5 + 0.5) * innerWidth;
        preview.y = (-pv.y * 0.5 + 0.5) * innerHeight;
      }
    }
  }

  // Loop -------------------------------------------------------------------------------------------
  const fixed = createFixedStep({ step: STEP, maxSteps: MAX_SUBSTEPS });
  const hand = new THREE.Vector3();
  // Render the hero between the last two physics steps (alpha), so motion is smooth when the
  // display rate and the 240 Hz physics don't line up (0, 1 or 2 steps per frame at 240 Hz).
  const prevP = { x: 0, y: 0, z: 0 };
  const renderP = { x: 0, y: 0, z: 0 };
  const view = { body: { p: renderP, get v() { return hero.body.v; } }, get state() { return hero.state; } };
  let alpha = 1;
  const frameTimes = new Float32Array(4000);
  const workTimes = new Float32Array(4000);
  const gpuTimes = new Float32Array(4000);
  let frameIdx = 0, frame = 0, fps = 60, last = performance.now(), time = 0;
  const events = [];

  const NO_LOOK = { dx: 0, dy: 0 };
  // Per-section frame cost (max over a window), read by scripts/fps-check.mjs.
  const profMax = {};
  function prof(name, t0) { const d = performance.now() - t0; profMax[name] = Math.max(profMax[name] ?? 0, d); }
  // World-side reactions to hero events: web splats, shock rings, camera shake, sound words.
  const wp = new THREE.Vector3();
  function screenOf(x, y, z) {
    wp.set(x, y, z).project(camera);
    return { x: (wp.x * 0.5 + 0.5) * innerWidth, y: (-wp.y * 0.5 + 0.5) * innerHeight, front: wp.z < 1 };
  }
  let lastThwipWord = -10;
  function worldEvent(e) {
    const p = hero.body.p;
    switch (e.type) {
      case 'attach': fx.splat(e.x, e.y, e.z, e.nx, e.ny, e.nz); break;
      case 'release': case 'perfect': case 'swingJump': fx.letGo(); break;
      case 'thwip': {
        // THWIP! now and then, by the hand (every shot would be noise).
        if (time - lastThwipWord > 2.5) {
          lastThwipWord = time;
          const s = screenOf(p.x, p.y + 0.8, p.z);
          if (s.front) hud.word('THWIP!', s.x + 70, s.y - 40, 'small');
        }
        break;
      }
      case 'land':
        if (e.hard) {
          fx.ring(p.x, p.y - 0.9, p.z, Math.min(1.6, e.impact / 25));
          if (settings.cameraShake) rig.shake = Math.min(1, e.impact / 30);
          const s = screenOf(p.x, p.y, p.z);
          if (s.front && e.impact > 24) hud.word('WHAM!', s.x - 90, s.y - 30, 'hit');
        }
        break;
      default: break;
    }
    if (e.type === 'perfect') { const s = screenOf(p.x, p.y + 1, p.z); hud.word('PERFECT!', s.x, s.y - 90, 'big'); }
    if (e.type === 'swingJump') { const s = screenOf(p.x, p.y, p.z); hud.word('WHOOSH!', s.x - 100, s.y + 20, 'small'); }
    if (e.type === 'corner') {
      const s = screenOf(p.x, p.y + 0.5, p.z);
      if (s.front) hud.word('WHIP!', s.x + 90, s.y - 50, 'small');
      if (settings.cameraShake) rig.shake = Math.max(rig.shake, 0.25);
    }
    if (e.type === 'launch') { const s = screenOf(p.x, p.y, p.z); if (s.front) hud.word('HUP!', s.x - 80, s.y - 40, 'small'); }
  }
  let camOverride = null;
  let camHeading = 0, camRoll = 0;
  const sideDir = { x: 1, z: 0 };
  function interpolate() {
    const p = hero.body.p;
    // A teleport or respawn jumps: show the new spot, don't sweep to it.
    if (Math.hypot(p.x - prevP.x, p.y - prevP.y, p.z - prevP.z) > 5) { prevP.x = p.x; prevP.y = p.y; prevP.z = p.z; }
    renderP.x = prevP.x + (p.x - prevP.x) * alpha;
    renderP.y = prevP.y + (p.y - prevP.y) * alpha;
    renderP.z = prevP.z + (p.z - prevP.z) * alpha;
  }

  const state = { ready: false };
  function tick(now) {
    requestAnimationFrame(tick);
    const t0 = performance.now();
    let dtMs = now - last;
    last = now;
    if (!(dtMs > 0)) dtMs = 16.7;
    const dt = Math.min(0.1, dtMs / 1000);
    time += dt;
    frame++;
    fps += (1000 / Math.max(1, dtMs) - fps) * 0.05;
    const T0 = performance.now();
    input.update(dt);

    events.length = 0;
    if (mode === 'play') {
      if (input.pressed('pause')) { pauseGame(); }
      if (input.pressed('help')) hud.toggleHelp();
      buildIntent();
      const Tp = performance.now();
      const adv = fixed.advance(dt);
      for (let i = 0; i < adv.steps; i++) {
        const p = hero.body.p;
        prevP.x = p.x; prevP.y = p.y; prevP.z = p.z;
        hero.step(intent, STEP);
        if (i === 0) clearEdges();
      }
      alpha = adv.alpha;
      prof('physics', Tp);
      events.push(...hero.events);
      hero.events.length = 0;
      for (const e of events) { sfx.event(e); hud.onEvent(e); worldEvent(e); }
      interpolate();
      rig.update(dt, locked() || input.device === 'pad' ? input.look : NO_LOOK, view, world, settings);
      hud.setLockHint(!locked() && input.device !== 'pad');
    } else {
      fixed.reset();
      if (mode === 'title') {
        // Slow orbit around the spawn roof behind the title card.
        rig.yaw = time * 0.05;
        rig.pitch = 0.22;
        interpolate();
        rig.update(dt, NO_LOOK, view, world, settings);
      }
      if (menus.open) menus.padNav();
    }

    if (mode !== 'play' && mode !== 'title') interpolate();
    const Tpose = performance.now();
    poser.update(hero, dt, events, renderP);
    prof('pose', Tpose);
    poser.lineWorld(hand);
    webLine.update(hand, hero.swing, hero.rope, hero.pendingWeb, tune.webTravel);
    sfx.setSpeed(mode === 'play' ? hero.speed : 0, dt);

    if (camOverride) {
      // Test hook: a fixed offset from the hero, looking at him (filming poses from the side).
      // side: metres to the hero's left of travel (negative: right); up: metres above; fov.
      const o = camOverride;
      if (o.at) {
        // Absolute offset from the hero (close-ups).
        camera.position.set(renderP.x + o.at[0], renderP.y + o.at[1], renderP.z + o.at[2]);
        camera.lookAt(renderP.x, renderP.y + (o.lookY ?? 0), renderP.z);
        if (camera.fov !== o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
      } else {
      const v = hero.body.v, sh = Math.hypot(v.x, v.z);
      const hx = sh > 1 ? v.x / sh : hero.facing.x, hz = sh > 1 ? v.z / sh : hero.facing.z;
      sideDir.x += (hz - sideDir.x) * Math.min(1, dt * 4); sideDir.z += (-hx - sideDir.z) * Math.min(1, dt * 4);
      const l = Math.hypot(sideDir.x, sideDir.z) || 1;
      camera.position.set(renderP.x + (sideDir.x / l) * o.side, renderP.y + o.up, renderP.z + (sideDir.z / l) * o.side);
      camera.lookAt(renderP.x, renderP.y, renderP.z);
      if (camera.fov !== o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
      }
    } else {
      camera.position.set(rig.pos.x, rig.pos.y, rig.pos.z);
      camera.lookAt(rig.pos.x + rig.fwd.x, rig.pos.y + rig.fwd.y, rig.pos.z + rig.fwd.z);
      // A little roll with the hero's turns while flying (the camera leans into the swing).
      const v = hero.body.v, heading = Math.atan2(v.x, v.z);
      let turn = heading - camHeading;
      while (turn > Math.PI) turn -= 2 * Math.PI;
      while (turn < -Math.PI) turn += 2 * Math.PI;
      camHeading = heading;
      const flying = hero.state === 'swing' || hero.state === 'air' || hero.state === 'glide';
      const want = flying && Math.hypot(v.x, v.z) > 6 && dt > 0 && settings.cameraShake ? Math.max(-0.12, Math.min(0.12, (turn / dt) * 0.06)) : 0;
      camRoll += (want - camRoll) * Math.min(1, dt * 3);
      camera.rotateZ(camRoll);
      if (rig.shake > 0.001) {
        const a = rig.shake * 0.06;
        camera.rotateX((Math.random() - 0.5) * a); camera.rotateY((Math.random() - 0.5) * a);
        rig.shake *= Math.exp(-dt * 7);
      }
    }
    if (!camOverride && Math.abs(camera.fov - rig.fov) > 0.01) { camera.fov = rig.fov; camera.updateProjectionMatrix(); }
    sky.follow(camera, time);
    // The camera crammed right up against the hero (a tight corner): hide him rather than fill the
    // screen with his back.
    heroModel.root.visible = camOverride || rig.closeness > 0.9;
    const hp = hero.body.p;
    sun.target.position.set(Math.round(hp.x / 8) * 8, 0, Math.round(hp.z / 8) * 8);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 400);
    const Tprev = performance.now();
    updatePreview(dt);
    prof('aim', Tprev);
    fx.update(dt);
    const Tr = performance.now();
    ink.render(scene, camera, time);
    const renderMs = performance.now() - Tr;
    prof('render', Tr);

    const Th = performance.now();
    hud.update(dt, { fps, speed: mode === 'play' ? hero.speed : 0, anchor: mode === 'play' ? preview : null, state: hero.state, dev: dev || devPanel.open, w: innerWidth, h: innerHeight });
    prof('hud', Th);
    input.endFrame();

    const scriptMs = performance.now() - t0;
    dynRes.update(dtMs);
    if (capDetector.frame(dtMs, scriptMs)) { hud.lowPower(); dynRes.capTo(30); }
    // The game's own CPU work: the frame minus the render submission, which can block on a busy GPU
    // (that wait is GPU time, already measured by gpuMs).
    workTimes[frameIdx % workTimes.length] = scriptMs - renderMs;
    gpuTimes[frameIdx % gpuTimes.length] = ink.gpuMs ?? -1;
    frameTimes[frameIdx++ % frameTimes.length] = dtMs;
    if (frame === 3) { performance.mark('boot:firstFrame'); state.ready = true; }
  }

  // Shaders compile under the loading bar, not on the first swing.
  await ink.compileAsync(scene, camera);
  onProgress(1);

  window.__game = {
    state,
    get frame() { return frame; },
    get fps() { return fps; },
    get mode() { return mode; },
    hero: () => ({
      p: { ...hero.body.p }, v: { ...hero.body.v }, state: hero.state, speed: hero.speed,
      rope: { active: hero.rope.active || hero.swing.active, length: hero.swing.active ? hero.swing.L : hero.rope.length, pivots: hero.rope.pivots.length, tension: hero.swing.active ? hero.swing.tension : hero.rope.tension, stalled: hero.rope.stalled },
      swing: { active: hero.swing.active, L: hero.swing.L, angle: hero.swing.active ? hero.swing.angle(hero.body.p, hero.body.v) : 0 },
      facing: { ...hero.facing }, hangInverted: hero.hangInverted,
    }),
    camera: () => ({ yaw: rig.yaw, pitch: rig.pitch, pos: { ...rig.pos }, fwd: { ...rig.fwd }, fov: rig.fov }),
    teleport(x, y, z, vx = 0, vy = 0, vz = 0, st = 'air', yaw = null) {
      hero.place(x, y, z, vx, vy, vz, st);
      // Snap the drawn position too, so hooks used right after (aimAt) see the new spot.
      prevP.x = renderP.x = x; prevP.y = renderP.y = y; prevP.z = renderP.z = z;
      if (yaw !== null) rig.yaw = yaw;
      rig.focus.x = x; rig.focus.y = y + 0.55; rig.focus.z = z;
    },
    setLook(yaw, pitch) { rig.yaw = yaw; rig.pitch = pitch; rig.sinceLook = 0; },
    // Turns the camera so the crosshair sits on a world point (for scripted play).
    aimAt(x, y, z) {
      interpolate();
      for (let i = 0; i < 4; i++) {
        const dx = x - rig.pos.x, dy = y - rig.pos.y, dz = z - rig.pos.z, l = Math.hypot(dx, dy, dz) || 1;
        rig.yaw = Math.atan2(dx, dz); rig.pitch = -Math.asin(dy / l); rig.sinceLook = 0;
        rig.update(0, NO_LOOK, view, world, settings);
      }
      return findAimPoint(world, hero.body, { x: rig.pos.x, y: rig.pos.y, z: rig.pos.z, fx: rig.fwd.x, fy: rig.fwd.y, fz: rig.fwd.z });
    },
    // A good point to web next (the skilled-player pick the swing simulator uses).
    suggest(dirX, dirZ) {
      const a = findAnchor(world, hero.body, { dirX, dirZ, assist: 'high', g: G[settings.gravity] });
      return a && { x: a.x, y: a.y, z: a.z };
    },
    poser: () => ({ trick: poser.trick, hand: poser.webHand }),
    setCamOverride(o) { camOverride = o; },
    setSetting(k, v) { applySettings({ ...settings, [k]: v }); },
    get settings() { return settings; },
    play: () => enterPlay(),
    get frameTimes() { return Array.from(frameTimes.slice(0, Math.min(frameIdx, frameTimes.length))); },
    get workTimes() { return Array.from(workTimes.slice(0, Math.min(frameIdx, workTimes.length))); },
    get gpuTimes() { return Array.from(gpuTimes.slice(0, Math.min(frameIdx, gpuTimes.length))).filter((v) => v >= 0); },
    profile: () => ({ ...profMax }),
    resetProfile() { for (const k in profMax) delete profMax[k]; },
    resetTimes() { frameTimes.fill(0); workTimes.fill(0); gpuTimes.fill(-1); frameIdx = 0; },
    events: () => events.map((e) => e.type),
    city, spawn, tune,
    dynRes: () => ({ scale: dynRes.scale, refresh: dynRes.refreshHz }),
    gpuMs: () => ink.gpuMs,
  };

  requestAnimationFrame((t) => { last = t; tick(t); });
  if (params.get('at') === 'swing') enterPlay(); else menus.showTitle();
}
