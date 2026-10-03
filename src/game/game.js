import * as THREE from 'three';
import { createRenderer, pixelRatioCap } from '../render/renderer.js';
import { buildShadowVolume } from '../render/shadowVolume.js';
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
import { buildCity } from '../world/city.js';
import { buildCityMeshes, setNight } from '../world/cityMesh.js';
import { createSky } from '../world/sky.js';
import { env as envAt, createClock, PRESETS, WEATHERS } from '../world/timeWeather.js';
import { createRain } from '../world/rain.js';
import { createCityLife } from '../world/cityLife.js';
import { SHADE_UNIFORMS, setShadowVolume } from '../render/comicShade.js';
import { buildStreetProps, carBoxes } from '../world/streetProps.js';
import { buildStreetMeshes } from '../world/streetMesh.js';
import { createHero, emptyIntent } from '../hero/controller.js';
import { loadHeroAssets, buildHeroModel, loadCombatClips } from '../hero/model.js';
import { TUNE } from '../combat/tuning.js';
import { shake as stopShake } from '../combat/hitstop.js';
import { createPoser } from '../hero/pose.js';
import { createWebLine } from '../hero/webLine.js';
import { createCameraRig } from '../camera/cameraRig.js';
import { createSfx } from '../audio/sfx.js';
import { createHud } from '../ui/hud.js';
import { createMenus } from '../ui/menus.js';
import { createDevPanel } from '../ui/devPanel.js';
import { createMap } from '../ui/map.js';
import { newSave, loadSlot, writeSlot, lastSlot } from '../core/save.js';
import { COPY } from '../ui/copy.js';
import { el } from '../ui/dom.js';
import { createFx } from './fx.js';
import { createCombat } from '../combat/combat.js';
import { createCombatHud } from '../ui/combatHud.js';
import { createProgressRuntime } from '../progress/runtime.js';
import { createProgressMenu } from '../ui/progressMenu.js';
import { ROSTER, characterById } from '../roster/characters.js';
import { buildCharacter } from '../roster/build.js';
import { makeSpecial } from '../roster/specials.js';
import { MOVERS } from '../movers/movers.js';
import { createRosterMenu } from '../ui/rosterMenu.js';
import { createSession } from '../net/session.js';
import { createModes } from '../net/modes.js';
import { createSocial } from '../net/social.js';
import { createLobby } from '../ui/lobby.js';
import { unlockedSave } from '../progress/unlocked.js';
import { autoBuild } from '../progress/progression.js';
import { newGamePlus } from '../story/gauntlet.js';
import { ARCHETYPES } from '../combat/enemies.js';
import { DEFAULTS } from '../physics/constants.js';
import { createDirector } from '../story/director.js';
import { createStoryUi } from '../ui/storyUi.js';
import { createSlots } from '../ui/slots.js';
import { stepById } from '../story/steps.js';
import { resolveSite } from '../story/sites.js';
import { createContentWorld } from '../content/world.js';
import { createPuzzles } from '../ui/puzzles.js';
import { createTracker } from '../ui/tracker.js';

export async function startGame({ canvas, params, onProgress = () => {} }) {
  performance.mark('boot:start');
  let settings = loadSettings(window.localStorage);
  // The story (Plan 7): on in a story slot, off in free swing and multiplayer.
  let storyOn = false, director = null, storyEnv = null, illusionK = 0;
  let quality = getQuality(settings.quality);
  const dev = params.has('dev');

  // Renderer and look ------------------------------------------------------------------------
  const renderer = createRenderer(canvas, quality);
  const basePixelRatio = () => pixelRatioCap(quality, navigator.userAgent, window.devicePixelRatio);
  const ink = createInkPipeline(renderer, quality, { gpuTime: params.has('gputime') });
  // The hero assets start downloading now; the city's shaders warm up while they arrive.
  const assetsP = loadHeroAssets('./assets/', (f) => onProgress(0.15 + f * 0.7));
  assetsP.catch(() => {}); // handled where it is awaited below
  if (params.has('aux')) ink.uniforms.uDebugAux.value = 1; // shows the aux target (normals, ids)
  if (params.has('inkrepeat')) ink.debug.repeat = Math.max(1, Math.min(16, Number(params.get('inkrepeat')) || 1));
  ink.setComic(quality.comic);
  const scene = new THREE.Scene();
  // Fog lives in the ink pass (spec G3), after the lines, so ink fades into the distance with the
  // buildings; this holds its colour and range for the time of day.
  const fogState = new THREE.Fog(PALETTE.haze, 320, quality.viewDistance);
  scene.fog = null;
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2200);
  camera.layers.enable(LAYER_FX);
  const sky = createSky(scene);
  ink.setFog(fogState, sky.uniforms);
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
  const city = buildCity();
  const world = createWorld();
  for (const b of city.boxes) world.addBox(b);
  const street = buildStreetProps(city);
  for (const b of carBoxes(street)) world.addBox(b);
  world.build();
  buildCityMeshes(city, scene, quality);
  setShadowVolume(buildShadowVolume(city.districts ?? []));
  const streetGroup = buildStreetMeshes(street, scene, quality);
  const rain = createRain(scene);
  const life = createCityLife(scene, city, quality);
  let scare = null;
  // Time of day and weather: free roam cycles unless the settings (or a mission) hold them.
  // Free roam opens at golden hour (spec G5), then the day cycles as before.
  const clock = createClock({ hour: 17.4, cycle: true });
  const weatherState = { from: 'clear', to: 'clear', k: 1, next: 240 };
  const C4 = new THREE.Color();
  let shadeFreeze = false;
  const mixC = (a, b, t, out) => out.setHex(a).lerp(C4.setHex(b), t);
  function applyEnv(dt) {
    // A mission holds its own hour and weather; free roam follows the settings.
    if (storyEnv) { clock.cycle = false; clock.set(storyEnv.hour); } else if (settings.timeOfDay === 'cycle') { clock.cycle = true; clock.update(dt); } else { clock.cycle = false; clock.set(PRESETS[settings.timeOfDay]); }
    const wantW = storyEnv?.weather ?? settings.weather;
    if (wantW === 'cycle') {
      weatherState.next -= dt;
      if (weatherState.next <= 0) {
        const r = Math.random();
        weatherState.from = weatherState.to; weatherState.to = r < 0.6 ? 'clear' : r < 0.85 ? 'overcast' : 'rain';
        weatherState.k = 0; weatherState.next = 180 + Math.random() * 240;
      }
    } else if (weatherState.to !== wantW) { weatherState.from = weatherState.to; weatherState.to = wantW; weatherState.k = 0; }
    weatherState.k = Math.min(1, weatherState.k + dt / 12);
    const a = envAt(clock.hour, weatherState.from), b = envAt(clock.hour, weatherState.to), t = weatherState.k;
    const u = sky.uniforms;
    mixC(a.skyTop, b.skyTop, t, u.uTop.value); mixC(a.skyMid, b.skyMid, t, u.uMid.value); mixC(a.horizon, b.horizon, t, u.uHorizon.value);
    mixC(a.sun, b.sun, t, u.uSun.value);
    u.uNight.value = a.night; u.uMoon.value = a.moon ? 1 : 0; u.uCover.value = a.cloud + (b.cloud - a.cloud) * t;
    sunDir.set(a.sunDir[0], a.sunDir[1], a.sunDir[2]).normalize();
    u.uSunDir.value.copy(sunDir);
    mixC(a.sun, b.sun, t, sun.color); sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    mixC(a.hemiSky, b.hemiSky, t, hemi.color); mixC(a.hemiGround, b.hemiGround, t, hemi.groundColor); hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * t;
    mixC(a.fog, b.fog, t, fogState.color); fogState.near = a.fogNear + (b.fogNear - a.fogNear) * t;
    setNight(a.night);
    streetGroup.userData.setNight?.(a.night);
    rain.setAmount(a.rain + (b.rain - a.rain) * t);
    // The light of the hour for the comic shading: its level and its colour.
    // Only partly lifted: a night stays mostly in shade, just not all of it.
    const lvl = Math.max(0.55, (sun.intensity * 0.55 + hemi.intensity * 0.45) / (1.9 * 0.55 + 1.25 * 0.45));
    if (shadeFreeze) return;
    SHADE_UNIFORMS.uLightLevel.value = lvl;
    const nightK = a.night, warm = Math.max(0, 1 - Math.abs(clock.hour - 18.4) / 1.6) + Math.max(0, 1 - Math.abs(clock.hour - 6.6) / 1.2);
    SHADE_UNIFORMS.uTint.value.setRGB(1, 1, 1)
      .lerp(C4.setRGB(1.08, 0.94, 0.8), Math.min(1, warm) * (1 - nightK))
      .lerp(C4.setRGB(0.34, 0.38, 0.62), nightK);
  }
  onProgress(0.15);

  performance.mark('boot:warmStart');
  await ink.warm(scene, camera);
  performance.mark('boot:warmEnd');
  const assets = await assetsP;
  let heroModel = buildHeroModel(assets);
  scene.add(heroModel.root);
  let poser = createPoser(heroModel);
  let character = characterById('peter');
  const webLine = createWebLine(scene);
  const fx = createFx(scene);

  const hero = createHero(world, { gravity: settings.gravity, assist: settings.swingAssist });
  // Combat: enemies, projectiles, gadgets and the hero's fighting state.
  const combat = createCombat({ scene, world, assets, hero, city, getSettings: () => ({ ...settings, crimes: session?.active ? settings.crimes : false, difficulty: storyOn && save.postGame?.ngPlus > 0 ? 'ultimate' : settings.difficulty }), feedback: {
    splat: (hit) => fx.splat(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz),
    boom: (p) => { fx.ring(p.x, p.y, p.z, 1.6); if (settings.cameraShake) rig.shake = Math.max(rig.shake, 0.6); const s = screenOf(p.x, p.y, p.z); if (s.front) hud.word('KA-BOOM!', s.x, s.y, 'hit'); sfx.event({ type: 'land', hard: true, impact: 30 }); },
    sense: (e, unblockable, ranged) => { combatHud.sense(e, unblockable, ranged); sfx.event({ type: 'sense' }); },
    senseRed: (e, heavy, ranged) => { combatHud.red(e, heavy, ranged); sfx.event({ type: 'senseRed', heavy }); },
    shot: () => sfx.event({ type: 'shot' }),
    event: (e) => combatEvent(e),
  } });
  const spawn = city.spawn;
  hero.place(spawn.x, spawn.y, spawn.z, 0, 0, 0, 'ground');
  const rig = createCameraRig();
  rig.yaw = 0; rig.pitch = 0.15;

  // Input, sound, UI -----------------------------------------------------------------------------
  const input = createInput({ target: window, bindings: settings.bindings });
  const sfx = createSfx(() => settings.volume);
  const uiRoot = el('div', { class: 'ui-layer' });
  document.body.append(uiRoot);
  const combatHud = createCombatHud(uiRoot, { get combat() { return combat; }, get hero() { return hero; }, getSettings: () => settings });
  {
    const sv = new THREE.Vector3();
    combat.setOnScreen((e) => { sv.set(e.body.p.x, e.body.p.y + 0.5, e.body.p.z).project(camera); return sv.z < 1 && Math.abs(sv.x) < 1 && Math.abs(sv.y) < 1; });
  }
  const hud = createHud(uiRoot, () => settings);
  const devPanel = createDevPanel(uiRoot);
  if (dev) devPanel.show();

  let mode = 'title';
  // The save (slot 1 until the story's slot screen arrives): found stations, districts, position.
  const saveSlot = lastSlot(window.localStorage) ?? 1;
  const save = loadSlot(window.localStorage, saveSlot) ?? newSave(saveSlot);
  let saveT = 0;
  const persist = () => {
    const p = hero.body.p;
    if (hero.state === 'ground') save.world.position = { x: p.x, y: p.y, z: p.z };
    save.world.hour = clock.hour;
    if (save.slot <= 3) writeSlot(window.localStorage, save);
  };
  // Map, waypoint and subway fast travel.
  let waypoint = null;
  const wpV = new THREE.Vector3();
  const map = createMap(uiRoot, city, {
    onWaypoint: (w) => { waypoint = w; },
    onTravel: (st) => { map.hide(); travel(st); },
  });
  map.onClose = () => { if (mode === 'map') { mode = 'play'; resetIntent(); } };
  let travelT = -1, travelTo = null;
  function travel(st) {
    travelTo = st; travelT = 0;
    hud.fade(true);
  }
  function travelStep(dt) {
    if (travelT < 0) return;
    travelT += dt;
    if (travelT > 0.6 && travelTo) {
      const st = travelTo; travelTo = null;
      hero.place(st.x, 0.9, st.z, 0, 0, 0, 'ground');
      prevP.x = renderP.x = st.x; prevP.y = renderP.y = 0.9; prevP.z = renderP.z = st.z;
      rig.focus.x = st.x; rig.focus.y = 1.45; rig.focus.z = st.z;
      hud.fade(false);
      hud.caption(`${COPY.subwayTo} ${st.name.toUpperCase()}`);
    }
    if (travelT > 1.2) travelT = -1;
  }
  function openMap() {
    mode = 'map';
    if (document.pointerLockElement) document.exitPointerLock();
    const p = hero.body.p;
    const icons = session.active ? [] : content.mapIcons().filter((ic) => ic.kind !== 'backpack' || save.world.districts.includes(city.districts.find((d) => ic.x >= d.minX && ic.x < d.maxX && ic.z >= d.minZ && ic.z < d.maxZ)?.id));
    if (storyOn && director.marker) icons.push({ ...director.marker, kind: 'mission' });
    map.show({ x: p.x, z: p.z, yaw: Math.atan2(hero.facing.x, hero.facing.z) }, save.world.stations, waypoint, icons);
  }
  const menus = createMenus(uiRoot, {
    getSettings: () => settings,
    setSettings: applySettings,
    input,
    onPlay: () => enterPlay(),
    onResume: () => resume(),
    onRestart: () => { hero.place(spawn.x, spawn.y, spawn.z, 0, 0, 0, 'ground'); resume(); },
    onQuit: () => toTitle(),
    onProgress: () => progressMenu.show(),
    onRoster: () => rosterMenu.show(),
    onMultiplayer: () => lobby.show(),
    onStory: () => slots.show(),
    onTracker: () => tracker.show(),
    postGame: () => !session.active && (save.story.done.includes('act4.epilogue') || !!save.story.choices?.completedOnce),
    onGauntlet: () => { storyOn = true; enterPlay(); director.startGauntlet(); },
    onNights: () => { if (storyOn) { director.stop(); storyOn = false; } storyEnv = { hour: 23, weather: 'clear' }; enterPlay(); content.startNights(); },
  });
  const slots = createSlots(uiRoot, { onPick: (slot, fresh) => enterStory(slot, fresh), onBack: () => menus.showTitle() });
  const storyUi = createStoryUi(uiRoot, { getSettings: () => settings, onSound: (k) => sfx.event({ type: k }) });
  // Characters (spec 13): the roster unlocks in solo free roam after the story; ?roster opens it.
  const rosterOpen = () => params.has('roster') || save.story.done.includes('act4.epilogue') || !!save.story.choices?.completedOnce;
  const rosterMenu = createRosterMenu(uiRoot, { isOpen: rosterOpen, current: () => character.id, onPick: (id) => { switchCharacter(id); rosterMenu.hide(); resume(); }, onBack: () => menus.showPause() });
  // Metal for Electro: lamp posts, traffic lights, antennas, cranes and the bridge cables.
  const metal = [
    ...street.lamps.map((l) => ({ x: l.x, y: 6.1, z: l.z })),
    ...street.lights.map((l) => ({ x: l.x, y: 5, z: l.z })),
    ...city.boxes.filter((b) => b.style === 16 || b.style === 10 || b.style === 25).map((b) => ({ x: (b.min[0] + b.max[0]) / 2, y: b.max[1], z: (b.min[2] + b.max[2]) / 2 })),
  ];
  function switchCharacter(id) {
    const def = characterById(id);
    scene.remove(heroModel.root);
    heroModel = buildCharacter(assets, def);
    scene.add(heroModel.root);
    poser = createPoser(heroModel);
    character = def;
    hero.mover = def.mover ? MOVERS[def.mover]({ ...(def.moverOpts ?? {}), metal }) : null;
    hero.body.mass = def.mass ?? 75;
    combat.heroCombat.c.special = makeSpecial(def.special, { hero, enemies: combat.enemies, projectiles: combat.projectiles, emit: (e) => combatEvent(e) });
    // Skills first, then the character's own differences on top.
    progress.setCharacter(heroModel, def.id, () => {
      for (const [k, v] of Object.entries(def.tune ?? {})) tune[k] += v;
      for (const [k, v] of Object.entries(hero.mover?.tune ?? {})) tune[k] = v;
    });
    hud.caption(def.name.toUpperCase(), 2);
    if (session?.active) session.setChar(def.id);
  }

  // Multiplayer (spec 14) -------------------------------------------------------------------------
  const mpSave = unlockedSave();
  let mpRule = {}, pvpOn = false;
  const session = createSession({
    scene, assets, hero, combat, hud, uiRoot, buildCharacter, createPoser, createWebLine, camera,
    characterId: () => character.id,
    makeSnapshot: () => ({
      mode: modes.state,
      encounter: combat.encounter ? { x: combat.encounter.x, z: combat.encounter.z, district: combat.encounter.district, faction: combat.encounter.faction,
        list: combat.enemies.list.filter((e) => e.alive && !e.puppet && !e.isPlayer && e.state !== 'out').map((e) => ({ arch: e.arch, faction: e.faction, look: e.look, x: e.body.p.x, z: e.body.p.z, hp: e.hp })) } : null,
    }),
    onSnapshot: (snap) => modes.adopt(snap?.mode),
    onBecomeHost: (snap) => { modes.adopt(snap?.mode); combat.restoreEncounter(snap?.encounter); },
  });
  combat.setTargets(() => { const t = session.targets(); const extra = storyOn ? director?.targets() : null; return extra ? t.concat(extra) : t; });
  combat.setAuthority(() => !session.active || session.isHost);
  const modes = createModes({ session, scene, hud, uiRoot, city, getHero: () => hero, getCamera: () => camera, applyRule: (r) => { mpRule = r; } });
  const social = createSocial({ session, scene, uiRoot, getCamera: () => camera, getAim: () => findAimPoint(world, hero.body, { x: rig.pos.x, y: rig.pos.y, z: rig.pos.z, fx: rig.fwd.x, fy: rig.fwd.y, fz: rig.fwd.z }) ?? world.raycast(rig.pos.x, rig.pos.y, rig.pos.z, rig.fwd.x, rig.fwd.y, rig.fwd.z, 300) });
  const lobby = createLobby(uiRoot, { session, onEnter: () => enterMp(), onBack: () => (session.active ? resume() : menus.showTitle()), startMode: (k, o) => modes.start(k, o) });
  session.on('message', (id, data) => { modes.message(id, data); social.message(id, data); });
  session.on('status', (kind) => { if (kind === 'closed') { progress.useSave(save); if (mode !== 'title') hud.caption('LEFT THE WORLD', 2); } });
  let mpEntered = false;
  function enterMp() {
    if (!mpEntered) {
      mpEntered = true;
      progress.useSave(mpSave);
      switchCharacter(lobby.profile.char);
      // A joiner starts next to whoever got there first.
      if (!session.isHost) setTimeout(() => { const first = [...session.players.values()][0]; const s = first?.buf.items[first.buf.items.length - 1]?.s; if (s) hero.place(s.p.x + 2, s.p.y + 0.5, s.p.z, 0, 0, 0, 'air'); }, 900);
    }
    menus.hideAll();
    if (mode !== 'play') enterPlay();
  }
  // Other players as targets while friendly fire is on (Brawl): hits on them go to their machine.
  function syncPvp(on) {
    if (on === pvpOn && !on) return;
    pvpOn = on;
    const have = new Map(combat.enemies.list.filter((e) => e.isPlayer).map((e) => [e.netPlayer, e]));
    for (const p of session.players.values()) {
      if (on && !p.away && !have.has(p.id)) {
        combat.enemies.list.push({ id: 900000 + p.id, isPlayer: true, netPlayer: p.id, arch: 'brawler', A: ARCHETYPES.brawler, faction: 'street', state: 'engage', alive: true, alerted: true, hp: 100, maxHp: 100, web: 0, facing: 0, body: p.puppet.body, model: { root: new THREE.Object3D(), hurt: { value: 0 }, animator: { play() {}, update() {} }, mat: { dispose() {} } } });
      }
    }
    for (const [id, e] of have) if (!on || !session.players.has(id)) combat.enemies.remove(e);
  }
  const progressMenu = createProgressMenu(uiRoot, { save, onChange: () => { progress.apply(); persist(); }, onBack: () => menus.showPause() });
  const progress = createProgressRuntime({ save, heroModel, combat, hero, hud, sfx, ink });
  progress.apply();

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
      fogState.far = quality.viewDistance;
    }
    dynRes.setEnabled(settings.dynamicRes);
    applyAccess();
    resize();
  }
  function applyAccess() {
    document.body.classList.toggle('cb', !!settings.colorblind);
    document.body.classList.toggle('text-large', settings.textSize === 'large');
    document.body.classList.toggle('text-huge', settings.textSize === 'huge');
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
  applyAccess();

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

  // Comic pages that began while the game was paused take over again when play resumes.
  const comicResumes = () => { if (storyOn && director?.blocking) { mode = 'comic'; input.setEnabled(false); return true; } return false; };
  const padComic = { a: false, b: false };
  function enterPlay() {
    mode = 'play';
    resetIntent();
    menus.hideAll();
    hud.show(true);
    input.setEnabled(true);
    // The mouse is only captured when the player clicks the game view (never on a menu button).
    sfx.unlock();
    comicResumes();
  }
  let pausedAt = 0;
  function pauseGame() {
    mode = 'paused';
    pausedAt = performance.now();
    input.setEnabled(false);
    // A locked pointer sends every click to the canvas: release it so the menu can be clicked.
    if (locked()) document.exitPointerLock();
    if (session.active) lobby.showWorld(); else menus.showPause();
  }
  function resume() {
    mode = 'play';
    resetIntent();
    menus.hideAll();
    input.setEnabled(true);
    comicResumes();
  }
  function toTitle() {
    content.stop(); storyEnv = null;
    if (storyOn) {
      director.stop(); storyOn = false; combat.setOccupation(null); content.stop();
      if (character.id !== 'peter' && !rosterOpen()) switchCharacter('peter');
      // A dev or test story never had a slot: free swing goes back to the real save.
      if (save.slot > 3) loadInto(loadSlot(window.localStorage, lastSlot(window.localStorage) ?? 1) ?? newSave(1));
    }
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
    // A tap that went down and up within one frame still counts (Shocker's blasts, Electro's pulls).
    intent.swingPressed = intent.swingPressed || (swing && !consumedSwing) || (!settings.swingToggle && input.pressed('swing'));
    intent.swingReleased = !swing && consumedSwing;
    const jump = input.down('jump');
    intent.jump = jump;
    intent.jumpPressed = intent.jumpPressed || input.pressed('jump');
    intent.jumpReleased = !jump && consumedJump;
    intent.zipPressed = intent.zipPressed || input.pressed('zip');
    intent.hangPressed = intent.hangPressed || input.pressed('hang');
    intent.trickPressed = intent.trickPressed || input.pressed('trick');
    intent.climb = input.move.y;
    intent.dive = input.down('dive');
    if (mpRule.frozen) { intent.moveX = 0; intent.moveZ = 0; intent.swing = false; intent.jump = false; }
    intent.divePressed = intent.divePressed || input.pressed('dive');
    intent.attack = input.down('attack');
    intent.web = input.down('web');
    intent.attackPressed = intent.attackPressed || input.pressed('attack');
    intent.webPressed = intent.webPressed || input.pressed('web');
    intent.finisher = input.down('finisher');
    intent.yankPressed = intent.yankPressed || input.pressed('hang');
    // Gadget: a tap uses it; holding the wheel key (or the pad's gadget button) opens the wheel.
    gadgetHold = input.down('gadgetWheel') || (input.device === 'pad' && input.down('gadget')) ? gadgetHold + 1 : 0;
    if (input.pressed('gadget') && input.device !== 'pad') intent.gadgetPressed = true;
    if (input.device === 'pad' && !input.down('gadget') && padGadgetDown && !wheelUsed) intent.gadgetPressed = true;
    if (input.device === 'pad') { if (!input.down('gadget')) wheelUsed = false; padGadgetDown = input.down('gadget'); }
  }
  let gadgetHold = 0, padGadgetDown = false, wheelUsed = false;
  const clearEdges = () => {
    intent.swingPressed = false; intent.swingReleased = false; intent.jumpPressed = false; intent.jumpReleased = false; intent.zipPressed = false; intent.hangPressed = false; intent.trickPressed = false;
    intent.attackPressed = false; intent.webPressed = false; intent.yankPressed = false; intent.gadgetPressed = false; intent.divePressed = false;
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
  // The fight for the camera (spec C7): the nearest three engaged enemies within 14 m, how far
  // they spread, and the soonest attacker.
  const fightView = { pts: [], spread: 0, threat: null };
  const view = {
    body: { p: renderP, get v() { return hero.body.v; } }, get state() { return hero.state; },
    get fight() {
      const p = hero.body.p;
      const near = combat.enemies.engaged.map((e) => ({ e, d: Math.hypot(e.body.p.x - p.x, e.body.p.z - p.z) })).filter((q) => q.d < 14).sort((a, b) => a.d - b.d).slice(0, 3);
      if (!near.length) return null;
      fightView.pts = near.map((q) => q.e.body.p);
      fightView.spread = near[near.length - 1].d;
      const w = near.filter((q) => q.e.state === 'windup').sort((a, b) => (a.e.strikeAt - a.e.t) - (b.e.strikeAt - b.e.t))[0];
      fightView.threat = w ? w.e.body.p : null;
      return fightView;
    },
  };
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
  let lastThwipWord = -10, lastWhipWord = -10;
  let gdt = 0;
  // Combat feedback: words, sounds, shakes, impact frames, the HUD.
  let impactTimer = 0, impactLong = false;
  function combatEvent(e) {
    const at = e.at ?? (e.e ? e.e.body.p : null);
    switch (e.type) {
      case 'word': { const s = screenOf(at.x, at.y + 1.1, at.z); if (s.front) hud.word(e.text, s.x + (Math.random() - 0.5) * 80, s.y - 40, e.kind); break; }
      case 'heroHit': {
        sfx.event({ type: 'punch', heavy: e.heavy });
        // Hit feel (spec 1.8): a camera kick, a punch of the field of view, and on the big ones
        // (enders, launchers, spikes) a one-frame impact panel.
        if (settings.cameraShake) rig.shake = Math.max(rig.shake, e.heavy ? 0.45 : 0.18);
        rig.fov += TUNE.fovPunch * (e.heavy ? 1.6 : 1);
        if (e.heavy && (e.stop ?? 0) >= 0.08 && settings.impactFrames !== 'off') {
          const s = screenOf(e.e.body.p.x, e.e.body.p.y, e.e.body.p.z);
          if (!impactLong) { ink.setImpact(1, true, s.x / innerWidth, 1 - s.y / innerHeight); clearTimeout(impactTimer); impactTimer = setTimeout(() => ink.setImpact(0), 50); }
        }
        break;
      }
      case 'heroHurt': sfx.event({ type: 'hurt' }); combatHud.hurt(); if (settings.cameraShake) rig.shake = Math.max(rig.shake, 0.5); break;
      case 'finisher': {
        const s = screenOf(at.x, at.y, at.z);
        if (settings.impactFrames !== 'off') ink.setImpact(1, settings.impactFrames === 'soft', s.x / innerWidth, 1 - s.y / innerHeight);
        clearTimeout(impactTimer); impactLong = true;
        impactTimer = setTimeout(() => { ink.setImpact(0); impactLong = false; }, 220);
        break;
      }
      case 'slam': fx.ring(e.at.x, e.at.y - 0.9, e.at.z, 2.2); if (settings.cameraShake) rig.shake = 0.8; break;
      case 'enemyOut': combatHud.ko(e.e); break;
      case 'enemyPinned': { const p = e.e.body.p; fx.splat(p.x, p.y, p.z, e.e.pin.nx, 0, e.e.pin.nz); const s = screenOf(p.x, p.y, p.z); if (s.front) hud.word('PINNED!', s.x, s.y - 40); break; }
      case 'encounterStart': if (e.encounter.kind !== 'story') { hud.caption(COPY.combat.gangSpotted); waypoint = { x: e.encounter.x, z: e.encounter.z, auto: true }; } break;
      case 'encounterDone': if (e.encounter.kind !== 'story') { hud.caption(COPY.combat.gangBusted); if (waypoint?.auto) waypoint = null; } break;
      case 'thwip': if (e.combat) sfx.event({ type: 'thwip' }); break;
      default: break;
    }
    progress.onCombatEvent(e);
    if (storyOn) director.onCombatEvent(e);
    events.push(e); // the poser and the HUD see combat moves too
    hud.onEvent(e);
  }
  // Defeated: a slow fall, a fade, and back on your feet at the nearest found subway station.
  let defeatT = 0;
  function defeatStep(dt) {
    if (content.nights) { content.endNights(); storyEnv = null; }
    if (storyOn && director.onDefeat()) return;
    if (session.active && mpRule.friendlyFire) {
      if (defeatT === 0) session.all({ k: 'ko', by: session.lastHurtBy });
      defeatT += dt;
      if (defeatT > 1.6) { combat.heroCombat.revive(); defeatT = 0; hud.caption('BACK IN!', 1); }
      return;
    }
    defeatT += dt;
    if (defeatT > 1.1 && defeatT - dt <= 1.1) { hud.fade(true); hud.caption(COPY.combat.defeated, 2.5); }
    if (defeatT > 2.0) {
      content.stop();
      const p = hero.body.p;
      const found = city.stations.filter((st) => save.world.stations.includes(st.id));
      const st = (found.length ? found : city.stations).reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
      combat.clear();
      hero.place(st.x, 0.9, st.z, 0, 0, 0, 'ground');
      prevP.x = renderP.x = st.x; prevP.y = renderP.y = 0.9; prevP.z = renderP.z = st.z;
      rig.focus.x = st.x; rig.focus.y = 1.45; rig.focus.z = st.z;
      combat.heroCombat.revive();
      hud.fade(false);
      defeatT = 0;
    }
  }
  // Entering a district shows its name in a caption box.
  let lastDistrict = null;
  function districtCheck() {
    const p = hero.body.p;
    const d = city.districts.find((q) => p.x >= q.minX && p.x < q.maxX && p.z >= q.minZ && p.z < q.maxZ);
    const id = d ? d.id : null;
    if (id && id !== lastDistrict && lastDistrict !== null) hud.caption(d.name.toUpperCase());
    if (id) lastDistrict = id;
    if (id && !save.world.districts.includes(id)) save.world.districts.push(id);
    for (const st of city.stations) {
      if (save.world.stations.includes(st.id) || Math.hypot(p.x - st.x, p.z - st.z) > 25 || p.y > 30) continue;
      save.world.stations.push(st.id);
      hud.caption(`${COPY.stationFound}: ${st.name.toUpperCase()}`, 3.2);
      persist();
    }
  }
  // The river: the last place the hero stood on something, and a splash that brings him back.
  const lastSafe = { x: spawn.x, y: spawn.y, z: spawn.z, t: 0 };
  let splashT = -1;
  function riverCheck(dt) {
    const p = hero.body.p;
    if (splashT >= 0) {
      splashT += dt;
      if (splashT > 0.9) {
        hero.place(lastSafe.x, lastSafe.y, lastSafe.z, 0, 0, 0, 'ground');
        prevP.x = renderP.x = lastSafe.x; prevP.y = renderP.y = lastSafe.y; prevP.z = renderP.z = lastSafe.z;
        rig.focus.x = lastSafe.x; rig.focus.y = lastSafe.y + 0.55; rig.focus.z = lastSafe.z;
        splashT = -1;
        hud.fade(false);
      }
      return;
    }
    const wet = p.y < 1.6 && city.isWater(p.x, p.z);
    if (wet) {
      splashT = 0;
      fx.ring(p.x, 0.05, p.z, 1.2);
      const s = screenOf(p.x, p.y + 1, p.z);
      if (s.front) hud.word('SPLASH!', s.x, s.y - 60, 'hit');
      sfx.event({ type: 'land', hard: true, impact: 20 });
      hud.fade(true);
      return;
    }
    if ((hero.state === 'ground' || hero.state === 'wall') && hero.speed < 12) {
      lastSafe.t += dt;
      if (lastSafe.t > 0.4) { lastSafe.x = p.x; lastSafe.y = p.y + (hero.state === 'wall' ? 0 : 0.01); lastSafe.z = p.z; lastSafe.t = 0; if (hero.state === 'wall') { lastSafe.x += hero.wall.nx * 0.4; lastSafe.z += hero.wall.nz * 0.4; } }
    }
  }
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
        if (p.y < 2.5) scare = { x: p.x, z: p.z, r: e.hard ? 14 : 6 };
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
      // The word now and then (corners come thick and fast down an avenue).
      if (s.front && time - lastWhipWord > 4) { lastWhipWord = time; hud.word('WHIP!', s.x + 90, s.y - 50, 'small'); }
      if (settings.cameraShake) rig.shake = Math.max(rig.shake, 0.25);
    }
    if (e.type === 'launch') { const s = screenOf(p.x, p.y, p.z); if (s.front) hud.word('HUP!', s.x - 80, s.y - 40, 'small'); }
  }
  let camOverride = null;
  let trace = null, traceSkip = 0;
  const traceDir = new THREE.Vector3();
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
      if (input.pressed('map')) openMap();
      buildIntent();
      gdt = dt * combat.timeScale(dt) * (settings.slowMo ? 0.75 : 1);
      if (gadgetHold > 12) { if (!combatHud.wheelOpen) combatHud.openWheel(); combatHud.steerWheel(input.look, input.move); wheelUsed = true; }
      else if (combatHud.wheelOpen) { const pick = combatHud.closeWheel(); if (pick) combat.gadgets.select(pick); }
      if (storyOn) director.preStep(intent, { x: rig.pos.x, y: rig.pos.y, z: rig.pos.z, fx: rig.fwd.x, fy: rig.fwd.y, fz: rig.fwd.z });
      combat.preStep(intent, gdt);
      const Tp = performance.now();
      // The hero's hitstop: frozen for a few frames on a blow while the world goes on.
      const heroFrozen = combat.heroCombat.c.heroStop > 0;
      const adv = fixed.advance(heroFrozen ? 0 : gdt);
      for (let i = 0; i < adv.steps; i++) {
        const p = hero.body.p;
        prevP.x = p.x; prevP.y = p.y; prevP.z = p.z;
        hero.step(intent, STEP);
        if (i === 0) clearEdges();
      }
      // No physics step this frame (the hero frozen in a hitstop, or a very high refresh rate):
      // combat has already read its presses, so they must not fire again next frame.
      if (adv.steps === 0) { intent.attackPressed = false; intent.webPressed = false; intent.yankPressed = false; intent.gadgetPressed = false; intent.divePressed = false; }
      alpha = adv.alpha;
      prof('physics', Tp);
      events.push(...hero.events);
      hero.events.length = 0;
      combat.step(gdt);
      progress.step(gdt);
      if (storyOn) director.update(gdt);
      if (session.active) {
        session.update(dt);
        modes.update(dt);
        social.update(dt);
        syncPvp(!!mpRule.friendlyFire);
        tune.maxSpeed = mpRule.fairCap ? 30 : DEFAULTS.maxSpeed;
        if (input.pressed('ping')) social.ping();
        if (input.pressed('chat')) social.openChat();
        social.toggleQuick(input.down('quickChat'));
        if (input.pressed('scan') && modes.ping()) hud.caption('SPIDER-SENSE!', 1);
      }
      if (input.pressed('suitPower')) progress.usePower();
      if (storyOn && !session.active && input.pressed('scan')) director.scan();
      if (input.pressed('photo') && !session.active) takePhoto();
      content.update(gdt, { active: !session.active && !(storyOn && director.quiet) });
      if (!storyOn) storyUi.update(gdt); // radio lines and stamps from free roam
      for (const e of events) progress.onHeroEvent(e);
      if (combat.heroCombat.c.defeated) defeatStep(dt);
      riverCheck(dt);
      travelStep(dt);
      saveT += dt;
      if (saveT > 20) { saveT = 0; save.playTime += 20; persist(); }
      districtCheck();
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
      if (mode === 'comic') {
        director.update(dt);
        // A gamepad reads the comic too: A reads on, B skips the scene.
        const pad = [...(navigator.getGamepads?.() ?? [])].find((q) => q && q.connected);
        const a = !!pad?.buttons[0]?.pressed, b = !!pad?.buttons[1]?.pressed;
        if (a && !padComic.a) storyUi.advanceComic();
        if (b && !padComic.b) storyUi.skipComic();
        padComic.a = a; padComic.b = b;
      }
      if (menus.open) menus.padNav();
      if (mode === 'map' && (input.pressed('map') || input.pressed('pause'))) map.hide();
    }

    if (mode !== 'play' && mode !== 'title') interpolate();
    // The hero shakes a little while frozen on a blow (drawn only).
    if (mode === 'play' && combat.heroCombat.c.heroStop > 0) {
      const s = stopShake(combat.heroCombat.c.heroStop, combat.heroCombat.c.heroStopAll, TUNE.shake * TUNE.shakeHero);
      renderP.x += s.x; renderP.z += s.z;
    }
    const Tpose = performance.now();
    poser.update(hero, mode === 'play' ? (combat.heroCombat.c.heroStop > 0 ? 0 : gdt) : dt, events, renderP);
    heroModel.updateGear?.(mode === 'play' ? gdt : dt, hero);
    prof('pose', Tpose);
    poser.lineWorld(hand);
    webLine.update(hand, hero.swing, hero.rope, hero.pendingWeb, tune.webTravel);
    sfx.setSpeed(mode === 'play' ? hero.speed : 0, dt);

    if (camOverride) {
      // Test hook: a fixed offset from the hero, looking at him (filming poses from the side).
      // side: metres to the hero's left of travel (negative: right); up: metres above; fov.
      const o = camOverride;
      if (o.pos) {
        // Absolute camera (tours and screenshots of the city).
        camera.position.set(o.pos[0], o.pos[1], o.pos[2]);
        camera.lookAt(o.look[0], o.look[1], o.look[2]);
        if (camera.fov !== (o.fov ?? 60)) { camera.fov = o.fov ?? 60; camera.updateProjectionMatrix(); }
      } else if (o.at) {
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
    if (waypoint && mode === 'play') {
      wpV.set(waypoint.x, Math.max(2, hero.body.p.y * 0.5), waypoint.z).project(camera);
      const behind = wpV.z > 1;
      const d = Math.hypot(waypoint.x - hero.body.p.x, waypoint.z - hero.body.p.z);
      if (d < 20) { if (!waypoint.story) waypoint = null; hud.waypoint(false); } else hud.waypoint(true, (wpV.x * 0.5 + 0.5) * innerWidth, (-wpV.y * 0.5 + 0.5) * innerHeight, d, behind);
    } else hud.waypoint(false);
    sky.follow(camera, time);
    applyEnv(mode === 'play' ? dt : 0);
    // Mysterio's smoke: a green cast over the ink and a slow tilt of the camera (visual only).
    if (illusionK > 0 && !shadeFreeze) SHADE_UNIFORMS.uTint.value.lerp(C4.setRGB(0.62, 1.05, 0.7), 0.4 * illusionK);
    if (illusionK > 0 && !camOverride) camera.rotateZ(Math.sin(time * 0.6) * 0.07 * illusionK);
    rain.update(camera, time);
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
    life.update(mode === 'play' ? gdt : dt * 0.5, renderP, scare);
    combatHud.update(dt, camera);
    scare = null;
    if (trace) {
      // Test hook: what the player sees each frame (smoothness probes).
      camera.getWorldDirection(traceDir);
      const q = heroModel.orient.quaternion;
      trace.push([traceSkip > 0 ? -dtMs : dtMs, camera.position.x, camera.position.y, camera.position.z, traceDir.x, traceDir.y, traceDir.z,
        q.x, q.y, q.z, q.w, renderP.x, renderP.y, renderP.z, camera.fov, hero.state, rig.closeness]);
      if (trace.length > 20000) trace.length = 0;
      traceSkip--;
    }
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
    if (frame === 3) {
      performance.mark('boot:firstFrame'); state.ready = true;
      loadCombatClips(assets).catch((err) => console.warn('combat clips', err));
    }
  }

  function placeHeroAt(x, y, z, vx = 0, vy = 0, vz = 0, st = 'air', yaw = null) {
    hero.place(x, y, z, vx, vy, vz, st);
    // Snap the drawn position too, so hooks used right after (aimAt) see the new spot.
    prevP.x = renderP.x = x; prevP.y = renderP.y = y; prevP.z = renderP.z = z;
    if (yaw !== null) rig.yaw = yaw;
    rig.focus.x = x; rig.focus.y = y + 0.55; rig.focus.z = z;
  }

  // Story ------------------------------------------------------------------------------------------
  director = createDirector({
    scene, world, city, combat, hero, ui: storyUi, save, assets, buildCharacter, createPoser,
    getSettings: () => ({ ...settings, difficulty: save.postGame?.ngPlus > 0 ? 'ultimate' : settings.difficulty }),
    heroDef: () => (character.id === 'peter' ? { ...characterById('peter'), suitId: save.progress.suit ?? 'classic' } : character),
    word: (t, p, kind) => { const sc = screenOf(p.x, p.y + 1, p.z); if (sc.front) hud.word(t, sc.x, sc.y - 40, kind); },
    shake: (k) => { if (settings.cameraShake) rig.shake = Math.max(rig.shake, k); },
    sfx, reward: (k, o) => progress.reward(k, o), caption: (t) => hud.caption(t), fade: (on) => hud.fade(on), persist: () => persist(),
    setEnv: (e) => { storyEnv = e; }, setWaypoint: (w) => { waypoint = w; },
    placeHero: (x, y, z) => placeHeroAt(x, y, z, 0, 0, 0, 'air'),
    hideHero: (on) => { heroModel.root.visible = !on; },
    focusSun: (x, z) => { sun.target.position.set(x, 0, z); sun.position.copy(sun.target.position).addScaledVector(sunDir, 400); sun.target.updateMatrixWorld(); },
    aspect: () => innerWidth / innerHeight,
    snapshot: (cam) => { ink.render(scene, cam, time); return renderer.domElement.toDataURL('image/jpeg', 0.86); },
    character: () => character.id,
    setCharacter: (id) => switchCharacter(id),
    setSuit: (id) => progress.setSuitOverride?.(id),
    setOccupation: (f) => combat.setOccupation(f),
    screen: (x, y, z) => screenOf(x, y, z),
    illusion: (k) => { illusionK = k; },
    onGauntletEnd: () => { storyOn = false; },
    onBlock: (on) => {
      if (on && mode === 'play') { mode = 'comic'; input.setEnabled(false); if (locked()) document.exitPointerLock(); }
      else if (!on && mode === 'comic') { mode = 'play'; resetIntent(); input.setEnabled(true); }
    },
  });
  // Open-world content (spec 11) -------------------------------------------------------------------------
  const puzzles = createPuzzles(uiRoot, { onSound: (k) => sfx.event({ type: k }) });
  let crimeWp = null;
  const content = createContentWorld({
    scene, world, city, hero, combat, save,
    reward: (kind, o = {}) => progress.reward(kind, o),
    say: (lines) => storyUi.say(lines),
    word: (t, p, kind) => { const sc = screenOf(p.x, (p.y ?? 1) + 1, p.z); if (sc.front) hud.word(t, sc.x, sc.y - 40, kind); },
    caption: (t, s) => hud.caption(t, s), sfx, persist: () => persist(),
    stamp: (t) => { storyUi.stamp(t); sfx.event({ type: 'stamp' }); },
    timer: (label, s) => storyUi.timer(label, s),
    prompt: (t, k) => storyUi.hold(t, k),
    hour: () => clock.hour, weather: () => weatherState.to,
    boom: (p) => { fx.ring(p.x, p.y, p.z, 2.2); if (settings.cameraShake) rig.shake = Math.max(rig.shake, 0.8); sfx.event({ type: 'land', hard: true, impact: 30 }); const h = hero.body.p; if (Math.hypot(h.x - p.x, h.z - p.z) < 6) combat.heroHit({ dmg: 30, dir: { x: 0, z: 1 }, from: null, unblockable: true }); },
    crimeWaypoint: (w) => { crimeWp = w; if (w) { if (!waypoint || waypoint.auto) waypoint = { ...w, auto: true }; } else if (waypoint?.auto) waypoint = null; },
    holding: () => input.down('hang'),
    pressedHang: () => input.pressed('hang'),
    busy: () => (storyOn && director.quiet) || session.active || !settings.crimes,
    puzzle: (kind) => { mode = 'comic'; input.setEnabled(false); if (locked()) document.exitPointerLock(); return puzzles.play(kind).then((ok) => { mode = 'play'; resetIntent(); input.setEnabled(true); return ok; }); },
  });
  const tracker = createTracker(uiRoot, { data: () => content.tracker(), onBack: () => menus.showPause() });
  function takePhoto() {
    const got = content.photo({ x: rig.pos.x, y: rig.pos.y, z: rig.pos.z, fx: rig.fwd.x, fy: rig.fwd.y, fz: rig.fwd.z });
    hud.flash?.();
    sfx.event({ type: 'stamp' });
    if (!got.length) hud.caption('SNAP!', 1);
  }

  // The save object stays the same one everywhere (menus and runtime hold it): a slot loads into it.
  function loadInto(next) {
    for (const k of Object.keys(save)) delete save[k];
    Object.assign(save, next);
    progress.useSave(save);
    content.reload();
  }
  function enterStory(slot, fresh) {
    if (session.active) return;
    combat.heroCombat.revive();
    const old = loadSlot(window.localStorage, slot);
    const next = fresh === 'ngplus' && old ? newGamePlus(old, slot, newSave(slot)) : fresh ? newSave(slot) : (old ?? newSave(slot));
    loadInto(next);
    slots.hide();
    if (character.id !== 'peter') switchCharacter('peter');
    const p = save.world.position;
    if (p && !fresh) placeHeroAt(p.x, p.y + 0.1, p.z, 0, 0, 0, 'ground'); else placeHeroAt(spawn.x, spawn.y, spawn.z, 0, 0, 0, 'ground', 0);
    storyOn = true;
    director.stop();
    enterPlay();
    director.start();
    persist();
  }
  // Dev and test entry: ?at=<step id> plays from that step in a scratch save (never written).
  function devStory(id) {
    // The level a player would have at this point (the story's pace), points spent.
    const LEVEL_AT = { prologue: 1, act1: 4, act2: 10, act3: 17, act4: 24 };
    loadInto(autoBuild(newSave(9), LEVEL_AT[stepById(id)?.act] ?? 1));
    storyOn = true;
    director.stop();
    combat.heroCombat.revive();
    enterPlay();
    director.start(id);
    const st = stepById(id);
    const site = st?.site ? resolveSite(city, st.site) : null;
    if (site) placeHeroAt(site.x, site.y + 0.2, site.z + (site.ground ? 10 : 0), 0, 0, 0, 'air');
  }

  // Shaders compile under the loading bar, not on the first swing.
  performance.mark('boot:compileStart');
  await ink.compileAsync(scene, camera);
  performance.mark('boot:compileEnd');
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
    teleport: placeHeroAt,
    setLook(yaw, pitch) { rig.yaw = yaw; rig.pitch = pitch; rig.sinceLook = 0; },
    // Turns the camera so the crosshair sits on a world point (for scripted play).
    aimAt(x, y, z) {
      traceSkip = 3; // the probe ignores the camera snap a scripted aim makes
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
    startTrace() { trace = []; },
    stopTrace() { const t = trace; trace = null; return t; },
    setSetting(k, v) { applySettings({ ...settings, [k]: v }); },
    get settings() { return settings; },
    combat: () => combat,
    spawnGang: (x, z, opts) => combat.spawnGang(x, z, 'midtown', opts),
    progress: () => progress,
    switchCharacter: (id) => switchCharacter(id),
    story: () => director.state(),
    content: () => content.state(),
    catalog: () => content.catalog,
    forceCrime: (k) => content.forceCrime(k),
    tracker: () => content.tracker(),
    photo: () => takePhoto(),
    storySkip: () => director.skip(),
    storyJump: (id) => director.jump(id),
    gauntlet: (from = 0) => { storyOn = true; enterPlay(); director.startGauntlet(from); },
    nights: () => { storyEnv = { hour: 23, weather: 'clear' }; enterPlay(); content.startNights(); },
    newGamePlus: (slot) => enterStory(slot, 'ngplus'),
    storyAt: (id) => devStory(id),
    startStory: (slot, fresh = true) => enterStory(slot, fresh),
    bossPhase: (n) => director.bossPhase(n),
    director: () => director,
    get storyOn() { return storyOn; },
    mp: () => session,
    modes: () => modes,
    lobby: () => lobby,
    character: () => character.id,
    roster: () => ROSTER.map((c) => c.id),
    combatState: () => ({ move: combat.heroCombat.c.move?.key ?? null, moveT: combat.heroCombat.c.move?.t ?? 0, heroState: hero.state, heroY: hero.body.p.y, held: combat.heroCombat.c.attackHeldT, hp: combat.heroCombat.c.hp, focus: combat.heroCombat.c.focus, combo: combat.heroCombat.c.combo, state: combat.heroCombat.c.state, defeated: combat.heroCombat.c.defeated, enemies: combat.enemies.list.map((e) => ({ id: e.id, arch: e.arch, state: e.state, hp: e.hp, x: e.body.p.x, y: e.body.p.y, z: e.body.p.z, vx: e.body.v.x, vy: e.body.v.y, vz: e.body.v.z, t: e.t, at: e.strikeAt, boss: !!e.boss, ranged: !!e.A?.ranged, reach: e.A?.reach ?? 2 })) }),
    props: () => director.props.list.filter((q) => q.state === 'rest').map((q) => ({ x: q.p.x, y: q.p.y, z: q.p.z })),
    // Test hook: the nearest point 1.6 m out from a building face (pilots back up to walls).
    wallSpot(x, z, r = 40, off = 1.6) {
      let best = null, bd = Infinity;
      for (const b of city.boxes) {
        if (b.kind !== 'building' || b.max[1] < 2.5) continue;
        const cx = Math.max(b.min[0], Math.min(b.max[0], x)), cz = Math.max(b.min[2], Math.min(b.max[2], z));
        const d = Math.hypot(cx - x, cz - z);
        if (d > r || d < 1e-3 || d >= bd) continue;
        bd = d; best = { x: cx + ((x - cx) / d) * off, z: cz + ((z - cz) / d) * off, nx: (x - cx) / d, nz: (z - cz) / d };
      }
      return best;
    },
    save: () => save,
    openMap: () => openMap(),
    travel: (id) => { const st = city.stations.find((s) => s.id === id); if (st) travel(st); },
    setShade(l, r, g, b) { shadeFreeze = true; SHADE_UNIFORMS.uLightLevel.value = l; SHADE_UNIFORMS.uTint.value.setRGB(r, g, b); },
    clock: () => ({ hour: clock.hour, weather: weatherState.to, light: SHADE_UNIFORMS.uLightLevel.value, tint: SHADE_UNIFORMS.uTint.value.toArray() }),
    setTime(h) { settings = { ...settings, timeOfDay: 'cycle' }; clock.set(h); },
    setWeather(w) { if (WEATHERS.includes(w)) { weatherState.from = w; weatherState.to = w; weatherState.k = 1; weatherState.next = 1e9; } },
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
  const at = params.get('at');
  if (at === 'swing') enterPlay();
  else if (at && stepById(at)) devStory(at);
  else menus.showTitle();
}
