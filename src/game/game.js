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
import { findAnchor, findZipPoint } from '../physics/anchors.js';
import { buildTestCity } from '../world/testCity.js';
import { buildCityMeshes, setNight } from '../world/cityMesh.js';
import { createSky } from '../world/sky.js';
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
  world.build();
  buildCityMeshes(city, scene, quality);
  onProgress(0.15);

  const assets = await loadHeroAssets('./assets/', (f) => onProgress(0.15 + f * 0.7));
  const heroModel = buildHeroModel(assets);
  scene.add(heroModel.root);
  const poser = createPoser(heroModel);
  const webLine = createWebLine(scene);

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
    menus.hideAll();
    hud.show(true);
    input.setEnabled(true);
    canvas.requestPointerLock?.()?.catch?.(() => {});
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
    menus.hideAll();
    input.setEnabled(true);
    canvas.requestPointerLock?.()?.catch?.(() => {});
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
    intent.swingPressed = swing && !intent.swing;
    intent.swingReleased = !swing && intent.swing;
    intent.swing = swing;
    const jump = input.down('jump');
    intent.jumpPressed = input.pressed('jump');
    intent.jumpReleased = intent.jump && !jump;
    intent.jump = jump;
    intent.zipPressed = input.pressed('zip');
    intent.dive = input.down('dive');
  }
  const clearEdges = () => { intent.swingPressed = false; intent.swingReleased = false; intent.jumpPressed = false; intent.jumpReleased = false; intent.zipPressed = false; };

  // Anchor preview for the HUD, refreshed ten times a second.
  const preview = { visible: false, x: 0, y: 0, zip: false };
  const pv = new THREE.Vector3();
  let previewT = 0, previewPoint = null;
  function updatePreview(dt) {
    previewT -= dt;
    if (previewT <= 0) {
      previewT = 0.1;
      previewPoint = null;
      if (hero.state === 'air' || hero.state === 'glide') {
        const m = Math.hypot(intent.moveX, intent.moveZ);
        const f = m > 0.2 ? { x: intent.moveX / m, z: intent.moveZ / m } : { x: rig.fwd.x, z: rig.fwd.z };
        const fl = Math.hypot(f.x, f.z) || 1;
        previewPoint = findAnchor(world, hero.body, { dirX: f.x / fl, dirZ: f.z / fl, assist: settings.swingAssist, g: G[settings.gravity] });
        preview.zip = false;
      } else if (hero.state === 'ground' || hero.state === 'wall') {
        const hit = findZipPoint(world, hero.body, { x: rig.pos.x, y: rig.pos.y, z: rig.pos.z, fx: rig.fwd.x, fy: rig.fwd.y, fz: rig.fwd.z });
        previewPoint = hit; preview.zip = true;
      }
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
  const frameTimes = new Float32Array(600);
  let frameIdx = 0, frame = 0, fps = 60, last = performance.now(), time = 0;
  const events = [];

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
    input.update(dt);

    events.length = 0;
    if (mode === 'play') {
      if (input.pressed('pause')) { pauseGame(); }
      if (input.pressed('help')) hud.toggleHelp();
      buildIntent();
      const { steps } = fixed.advance(dt);
      for (let i = 0; i < steps; i++) {
        hero.step(intent, STEP);
        if (i === 0) clearEdges();
      }
      if (hero.state === 'swing' && intent.jump && hero.rope.reelRate > 0 && !hero.rope.stalled && hero.rope.tension > 0) hud.onEvent({ type: 'reel' });
      events.push(...hero.events);
      hero.events.length = 0;
      for (const e of events) { sfx.event(e); hud.onEvent(e); }
      rig.update(dt, locked() || input.device === 'pad' ? input.look : { dx: 0, dy: 0 }, hero, world, settings);
      hud.setLockHint(!locked() && input.device !== 'pad');
    } else {
      fixed.reset();
      if (mode === 'title') {
        // Slow orbit around the spawn roof behind the title card.
        rig.yaw = time * 0.05;
        rig.pitch = 0.22;
        rig.update(dt, { dx: 0, dy: 0 }, hero, world, settings);
      }
      if (menus.open) menus.padNav();
    }

    poser.update(hero, dt, events);
    poser.handWorld(hand);
    webLine.update(hand, hero.rope, hero.pendingWeb, tune.webTravel);
    sfx.setSpeed(mode === 'play' ? hero.speed : 0, dt);

    camera.position.set(rig.pos.x, rig.pos.y, rig.pos.z);
    camera.lookAt(rig.pos.x + rig.fwd.x, rig.pos.y + rig.fwd.y, rig.pos.z + rig.fwd.z);
    if (Math.abs(camera.fov - rig.fov) > 0.01) { camera.fov = rig.fov; camera.updateProjectionMatrix(); }
    sky.follow(camera);
    const hp = hero.body.p;
    sun.target.position.set(Math.round(hp.x / 8) * 8, 0, Math.round(hp.z / 8) * 8);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 400);
    updatePreview(dt);
    ink.render(scene, camera, time);

    hud.update(dt, { fps, speed: mode === 'play' ? hero.speed : 0, anchor: mode === 'play' ? preview : null, state: hero.state, dev: dev || devPanel.open, w: innerWidth, h: innerHeight });
    input.endFrame();

    const scriptMs = performance.now() - t0;
    dynRes.update(dtMs);
    if (capDetector.frame(dtMs, scriptMs)) { hud.lowPower(); dynRes.capTo(30); }
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
      rope: { active: hero.rope.active, length: hero.rope.length, pivots: hero.rope.pivots.length, tension: hero.rope.tension, stalled: hero.rope.stalled },
      facing: { ...hero.facing },
    }),
    camera: () => ({ yaw: rig.yaw, pitch: rig.pitch, pos: { ...rig.pos }, fwd: { ...rig.fwd }, fov: rig.fov }),
    teleport(x, y, z, vx = 0, vy = 0, vz = 0, st = 'air', yaw = null) {
      hero.place(x, y, z, vx, vy, vz, st);
      if (yaw !== null) rig.yaw = yaw;
      rig.focus.x = x; rig.focus.y = y + 0.55; rig.focus.z = z;
    },
    setLook(yaw, pitch) { rig.yaw = yaw; rig.pitch = pitch; rig.sinceLook = 0; },
    setSetting(k, v) { applySettings({ ...settings, [k]: v }); },
    get settings() { return settings; },
    play: () => enterPlay(),
    get frameTimes() { return Array.from(frameTimes.slice(0, Math.min(frame, frameTimes.length))); },
    events: () => events.map((e) => e.type),
    city, spawn, tune,
    dynRes: () => ({ scale: dynRes.scale, refresh: dynRes.refreshHz }),
    gpuMs: () => ink.gpuMs,
  };

  requestAnimationFrame((t) => { last = t; tick(t); });
  if (params.get('at') === 'swing') enterPlay(); else menus.showTitle();
}
