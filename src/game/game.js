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
import { buildCityMeshes, setNight, setWet } from '../world/cityMesh.js';
import { createWetStreaks } from '../world/wetStreaks.js';
import { createSky, createSkyline } from '../world/sky.js';
import { env as envAt, createClock, PRESETS, WEATHERS } from '../world/timeWeather.js';
import { createRain } from '../world/rain.js';
import { createCityLife } from '../world/cityLife.js';
import { createHalos, HALO } from '../render/halos.js';
import { createCrowd } from '../world/crowd.js';
import { createMusic } from '../audio/music.js';
import { createRequests } from '../content/requests.js';
import { createPhotoMode } from '../ui/photoMode.js';
const CAR_HEAD = [1.0, 0.88, 0.6], CAR_TAIL = [1.0, 0.1, 0.08];
let carHalos = null;
// Two white heads in front and two red tails behind a moving car.
function carLamps(x, z, dx, dz) {
  for (let s = -0.75; s <= 0.75; s += 1.5) {
    carHalos.addDynamic(x + dx * 2.3 - dz * s, 0.75, z + dz * 2.3 + dx * s, CAR_HEAD, 1.0);
    carHalos.addDynamic(x - dx * 2.3 - dz * s, 0.8, z - dz * 2.3 + dx * s, CAR_TAIL, 0.9);
  }
}
import { SHADE_UNIFORMS, setShadowVolume } from '../render/comicShade.js';
import { buildStreetProps, carBoxes } from '../world/streetProps.js';
import { buildStreetMeshes } from '../world/streetMesh.js';
import { buildLanterns } from '../world/lanterns.js';
import { createEmoteWheel } from '../ui/emoteWheel.js';
import { emoteById } from '../hero/emotes.js';
import { createHero, emptyIntent } from '../hero/controller.js';
import { loadHeroAssets, buildHeroModel, loadCombatClips, loadSuitModel } from '../hero/model.js';
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
import { CAST } from '../story/cast.js';
import { buildCharacter } from '../roster/build.js';
import { makeSpecial } from '../roster/specials.js';
import { MOVERS } from '../movers/movers.js';
import { createRosterMenu } from '../ui/rosterMenu.js';
import { createSession } from '../net/session.js';
import { createModes } from '../net/modes.js';
import { createSocial } from '../net/social.js';
import { createLobby } from '../ui/lobby.js';
import { unlockedSave } from '../progress/unlocked.js';
import { autoBuild, SUITS } from '../progress/progression.js';
import { newGamePlus } from '../story/gauntlet.js';
import { ARCHETYPES, isActive } from '../combat/enemies.js';
import { DEFAULTS } from '../physics/constants.js';
import { createDirector } from '../story/director.js';
import { createStoryUi } from '../ui/storyUi.js';
import { createSlots, slotSummary } from '../ui/slots.js';
import { createNav } from '../ui/nav.js';
import { impactFlash } from './impact.js';
import { stepById } from '../story/steps.js';
import { resolveSite } from '../story/sites.js';
import { createContentWorld } from '../content/world.js';
import { createPuzzles } from '../ui/puzzles.js';
import { createTracker } from '../ui/tracker.js';
import { createSplashMemory } from './splash.js';
import { watchContextLoss } from '../ui/contextLost.js';

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
  // The worn suit's model (a fitted suit file) downloads beside them, so the title shows it at once.
  const wornSuitP = (() => {
    try { const id = params.get('suit') ?? loadSlot(window.localStorage, lastSlot(window.localStorage) ?? 1)?.progress?.suit; return loadSuitModel(SUITS.find((q) => q.id === id)?.model); } catch { return Promise.resolve(null); }
  })();
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
  const skyline = createSkyline(scene, sky.uniforms, fogState.color);
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
  const lanterns = buildLanterns(city, scene);
  const rain = createRain(scene);
  const life = createCityLife(scene, city, quality);
  // Halos for the city's small lights at night (render/halos.js): lamps, signals, beacons, cars.
  const halos = createHalos();
  carHalos = halos;
  halos.points.name = 'halos';
  scene.add(halos.points);
  {
    const LAMP = [1.0, 0.72, 0.36], RED = [1.0, 0.16, 0.12], AMBER = [1.0, 0.62, 0.12], GREEN = [0.25, 1.0, 0.45];
    for (const l of street.lamps) halos.add(l.x + (l.facing > 0 ? 1.5 : -1.5), 5.9, l.z, LAMP, 2.0);
    // The signal housing hangs 3.6 m out on its arm (streetMesh.js trafficGeometry, turned 90 deg).
    for (const l of street.lights) {
      halos.add(l.x - 3.62, 4.67, l.z, RED, 1.3, HALO.RED);
      halos.add(l.x - 3.62, 4.27, l.z, AMBER, 1.3, HALO.AMBER);
      halos.add(l.x - 3.62, 3.87, l.z, GREEN, 1.3, HALO.GREEN);
    }
    // Aircraft beacons: every antenna top, and the roofs of the tallest towers.
    let k = 0;
    const tall = city.boxes.filter((b) => b.kind === 'building' && b.max[1] > 140);
    for (const b of city.boxes) {
      const h = b.max[1], cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
      if (b.style === 16 && b.kind === 'prop') halos.add(cx, h + 0.3, cz, RED, 4.5, HALO.BLINK, (k++ * 0.37) % 1);
      // Only the topmost box of a tower (not every tier of a crown).
      else if (b.kind === 'building' && h > 150 && !tall.some((t) => t !== b && t.min[1] >= h - 0.01 && t.min[0] < b.max[0] && t.max[0] > b.min[0] && t.min[2] < b.max[2] && t.max[2] > b.min[2])) halos.add(cx, h + 1.5, cz, RED, 7, HALO.BLINK, (k++ * 0.61) % 1);
    }
  }
  let nightNow = 0, rainNow = 0;
  // Reflections on the wet street: every lamp, and the neon blades over the sidewalks.
  const wetStreaks = createWetStreaks([
    ...street.lamps.map((l) => ({ x: l.x + (l.facing > 0 ? 1.5 : -1.5), z: l.z, color: [1.0, 0.62, 0.26], w: 0.7, len: 9, k: 0.55, h: 5.9 })),
    ...city.boxes.filter((b) => b.kind === 'sign' && b.min[1] < 16).map((b, i) => ({
      x: (b.min[0] + b.max[0]) / 2, z: (b.min[2] + b.max[2]) / 2,
      color: [[1, 0.24, 0.48], [0.24, 0.98, 1], [1, 0.88, 0.24], [0.5, 1, 0.36], [1, 0.48, 0.16], [0.72, 0.5, 1]][i % 6], w: 0.9, len: 12, k: 0.7, h: b.min[1] + 2,
    })),
  ]);
  wetStreaks.name = 'wetStreaks';
  scene.add(wetStreaks);
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
    // Photo mode's hour holds while it is open (it never changes the saved setting).
    if (photoHour !== null && !storyEnv) { clock.cycle = false; clock.set(photoHour); }
    else if (storyEnv) { clock.cycle = false; clock.set(storyEnv.hour); } else if (settings.timeOfDay === 'cycle') { clock.cycle = true; clock.update(dt); } else { clock.cycle = false; clock.set(PRESETS[settings.timeOfDay]); }
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
    nightNow = a.night;
    streetGroup.userData.setNight?.(a.night);
    lanterns.userData.setNight(a.night);
    rain.setAmount(a.rain + (b.rain - a.rain) * t);
    rainNow = a.rain + (b.rain - a.rain) * t;
    setWet(Math.min(1, rainNow * 1.4));
    wetStreaks.userData.setWet(Math.max(Math.min(1, rainNow * 1.4), 0.3 * a.night));
    // The light of the hour for the comic shading: its level and its colour.
    // Only partly lifted: a night stays mostly in shade, just not all of it.
    const lvl = Math.max(0.55, (sun.intensity * 0.55 + hemi.intensity * 0.45) / (1.9 * 0.55 + 1.25 * 0.45));
    // Night: the darks go dark (the tint below) and the vignette deepens, so lit windows, signs
    // and lamps carry the frame.
    ink.setVignette?.(0.36 + 0.24 * a.night);
    if (shadeFreeze) return;
    SHADE_UNIFORMS.uLightLevel.value = lvl;
    const nightK = a.night, warm = Math.max(0, 1 - Math.abs(clock.hour - 18.4) / 1.6) + Math.max(0, 1 - Math.abs(clock.hour - 6.6) / 1.2);
    SHADE_UNIFORMS.uTint.value.setRGB(1, 1, 1)
      .lerp(C4.setRGB(1.08, 0.94, 0.8), Math.min(1, warm) * (1 - nightK))
      .lerp(C4.setRGB(0.15, 0.17, 0.33), nightK);
  }
  onProgress(0.15);

  performance.mark('boot:warmStart');
  await ink.warm(scene, camera);
  performance.mark('boot:warmEnd');
  const assets = await assetsP;
  let heroModel = buildHeroModel(assets);
  // Real figures for the nearest pedestrians (src/world/crowd.js), fewer on lower quality.
  const crowd = createCrowd({ scene, assets, buildCharacter, life, count: quality.name === 'low' ? 0 : quality.name === 'medium' ? 6 : 12 });
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
  // The title shot: Spider-Man perched on the west edge of the spawn roof at golden hour, looking
  // out over the city toward Fisk Tower, the camera drifting slowly behind his shoulder.
  const ledge = resolveSite(city, 'peterRoof');
  function placeTitle() {
    hero.place(ledge.x + 0.3, ledge.y, ledge.z, 0, 0, 0, 'ground');
    hero.facing.x = -1; hero.facing.z = 0;
  }
  hero.place(spawn.x, spawn.y, spawn.z, 0, 0, 0, 'ground');
  if (!params.has('at')) placeTitle();
  const rig = createCameraRig();
  rig.yaw = 0; rig.pitch = 0.15;

  // Input, sound, UI -----------------------------------------------------------------------------
  const input = createInput({ target: window, bindings: settings.bindings });
  const sfx = createSfx(() => settings.volume);
  const music = createMusic(() => settings.volume);
  let fightHold = 0;
  // What the soundtrack plays now: bosses, then fights (held a few seconds after the last thug, so
  // it does not flip back and forth), Peter's scenes, missions on the way, the city by day or night.
  function pickMusic(dt) {
    if (mode === 'title') return 'mission';
    const st = storyOn ? director.step : null;
    if (storyOn && director.inFight && st?.type === 'boss') return 'boss';
    const fighting = combat.enemies.engaged.length > 0 || (storyOn && director.inFight);
    fightHold = fighting ? 4 : Math.max(0, fightHold - dt);
    if (fightHold > 0) return st?.type === 'chase' ? 'mission' : 'fight';
    if (st?.type === 'stroll') return 'peter';
    // On the way to a mission site (the story's 'go there' steps): the mission theme.
    if (st?.type === 'reach') return 'mission';
    return nightNow > 0.5 ? 'night' : 'day';
  }
  const uiRoot = el('div', { class: 'ui-layer' });
  document.body.append(uiRoot);
  // Every menu page shares one way around: gamepad, Esc and B for Back, menu sounds (ui/nav.js).
  const nav = createNav({ sound: (k) => sfx.event({ type: k }), unlock: () => sfx.unlock(), capturing: () => input.capturing });
  const emoteWheel = createEmoteWheel(uiRoot, { has: (clip) => heroModel.animator.has(clip) });
  const combatHud = createCombatHud(uiRoot, { get combat() { return combat; }, get hero() { return hero; }, getSettings: () => settings, getDevice: () => input.device });
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
  await wornSuitP;
  // Dev: ?suits unlocks every suit in whichever save is loaded (a story slot or free swing loads its
  // own over this one), story suits included, to look them all over.
  // ?suit=<id> also wears that suit (perf and look checks of one suit).
  const unlockSuitsIfAsked = () => {
    if (params.has('suits') && save.progress) save.progress.suits = SUITS.map((q) => q.id);
    const want = params.get('suit');
    if (want && save.progress && SUITS.some((q) => q.id === want)) { if (!save.progress.suits.includes(want)) save.progress.suits.push(want); save.progress.suit = want; }
  };
  unlockSuitsIfAsked();
  let saveT = 0;
  const persist = () => {
    const p = hero.body.p;
    if (hero.state === 'ground') save.world.position = { x: p.x, y: p.y, z: p.z };
    save.world.hour = clock.hour;
    if (save.slot <= 3) writeSlot(window.localStorage, save);
  };
  // The GPU dropped the WebGL context: save the play there was (never the title's rooftop over a
  // slot's last spot, never a multiplayer world), then a comic card asks for a reload.
  watchContextLoss(canvas, { onLost: () => { if (mode === 'title' || session.active) return false; persist(); return true; } });
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
    const icons = session.active ? [] : [...content.mapIcons(), ...requests.mapIcons()].filter((ic) => ic.kind !== 'backpack' || save.world.districts.includes(city.districts.find((d) => ic.x >= d.minX && ic.x < d.maxX && ic.z >= d.minZ && ic.z < d.maxZ)?.id));
    if (storyOn && director.marker) icons.push({ ...director.marker, kind: 'mission' });
    map.show({ x: p.x, z: p.z, yaw: Math.atan2(hero.facing.x, hero.facing.z) }, save.world.stations, waypoint, icons);
  }
  const menus = createMenus(uiRoot, {
    getSettings: () => settings,
    setSettings: applySettings,
    input,
    nav,
    onPlay: () => enterPlay(),
    onResume: (o) => resume(o),
    onRestart: (o) => { hero.place(spawn.x, spawn.y, spawn.z, 0, 0, 0, 'ground'); resume(o); },
    // Continue on the title: the last slot played, straight in.
    getContinue: () => {
      const n = lastSlot(window.localStorage);
      const sv = n ? loadSlot(window.localStorage, n) : null;
      if (!sv) return null;
      const sm = slotSummary(sv);
      return { slot: n, where: sm.where, percent: sm.percent };
    },
    onContinue: (slot) => enterStory(slot, false),
    onResetTips: () => hud.resetTips(),
    inChallenge: () => content.challenge,
    onRetryChallenge: () => { content.retryRun(); resume(); },
    onQuitChallenge: () => { content.quitRun(); resume(); },
    onQuit: () => toTitle(),
    onProgress: () => progressMenu.show(),
    onRoster: () => rosterMenu.show(),
    onMultiplayer: () => lobby.show(),
    onStory: () => slots.show(),
    onTracker: () => tracker.show(),
    onPhoto: () => { resume(); enterPhoto(); },
    postGame: () => !session.active && (save.story.done.includes('act4.epilogue') || !!save.story.choices?.completedOnce),
    onGauntlet: () => { requests.stop(); storyOn = true; enterPlay(); director.startGauntlet(); },
    onNights: () => { requests.stop(); if (storyOn) { director.stop(); storyOn = false; } storyEnv = { hour: 23, weather: 'clear' }; enterPlay(); content.startNights(); },
  });
  const slots = createSlots(uiRoot, { onPick: (slot, fresh) => enterStory(slot, fresh), onBack: () => menus.showTitle() });
  nav.register(slots.node, () => slots.back());
  const storyUi = createStoryUi(uiRoot, { getSettings: () => settings, onSound: (k) => sfx.event({ type: k }), canAdvanceRadio: () => mode === 'play' && !session?.active });
  // Street gangs wait while a comic or card is up, and while a crime runs (one fight at a time: a
  // crime used to overwrite a running gang's slot and orphan it).
  combat.setQuiet(() => storyUi.comicOpen || storyUi.cardOpen || !!content?.crimeOn);
  let padRadioWas = false;
  // Characters (spec 13): the roster unlocks in solo free roam after the story; ?roster opens it.
  const rosterOpen = () => params.has('roster') || save.story.done.includes('act4.epilogue') || !!save.story.choices?.completedOnce;
  const rosterMenu = createRosterMenu(uiRoot, { isOpen: rosterOpen, current: () => character.id, onPick: (id) => { switchCharacter(id); rosterMenu.hide(); resume(); }, onBack: () => menus.showPause() });
  nav.register(rosterMenu.node, () => rosterMenu.back());
  // Metal for Electro: lamp posts, traffic lights, antennas, cranes and the bridge cables.
  const metal = [
    ...street.lamps.map((l) => ({ x: l.x, y: 6.1, z: l.z })),
    ...street.lights.map((l) => ({ x: l.x, y: 5, z: l.z })),
    ...city.boxes.filter((b) => b.style === 16 || b.style === 10 || b.style === 25).map((b) => ({ x: (b.min[0] + b.max[0]) / 2, y: b.max[1], z: (b.min[2] + b.max[2]) / 2 })),
  ];
  function switchCharacter(id) {
    // Peter out of the suit (a stroll) is a cast look, not a roster character.
    const def = !ROSTER.some((c) => c.id === id) && CAST[id] ? { ...CAST[id], kind: 'civilian' } : characterById(id);
    scene.remove(heroModel.root);
    // The old body's own materials and gear geometry go (the skinned body geometry is shared).
    heroModel.root.traverse((o) => { if (!o.isMesh) return; for (const mt of [].concat(o.material)) mt?.dispose?.(); if (!o.isSkinnedMesh) o.geometry?.dispose?.(); });
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
        list: combat.enemies.list.filter((e) => isActive(e) && !e.puppet && !e.isPlayer).map((e) => ({ arch: e.arch, faction: e.faction, look: e.look, x: e.body.p.x, z: e.body.p.z, hp: e.hp })) } : null,
    }),
    onSnapshot: (snap) => modes.adopt(snap?.mode),
    onBecomeHost: (snap) => { modes.adopt(snap?.mode); combat.restoreEncounter(snap?.encounter); },
  });
  combat.setTargets(() => { const t = session.targets(); const extra = storyOn ? director?.targets() : null; return extra ? t.concat(extra) : t; });
  combat.setAuthority(() => !session.active || session.isHost);
  const modes = createModes({ session, scene, hud, uiRoot, city, getHero: () => hero, getCamera: () => camera, applyRule: (r) => { mpRule = r; } });
  const social = createSocial({ session, scene, uiRoot, getCamera: () => camera, getAim: () => findAimPoint(world, hero.body, { x: rig.pos.x, y: rig.pos.y, z: rig.pos.z, fx: rig.fwd.x, fy: rig.fwd.y, fz: rig.fwd.z }) ?? world.raycast(rig.pos.x, rig.pos.y, rig.pos.z, rig.fwd.x, rig.fwd.y, rig.fwd.z, 300) });
  const lobby = createLobby(uiRoot, { session, onEnter: () => enterMp(), onBack: () => (session.active ? resume() : menus.showTitle()), startMode: (k, o) => modes.start(k, o) });
  nav.register(lobby.node, () => lobby.back());
  nav.register(lobby.worldNode, () => lobby.backWorld());
  session.on('message', (id, data) => { modes.message(id, data); social.message(id, data); });
  session.on('status', (kind) => { if (kind === 'closed') { progress.useSave(save); if (mode !== 'title') hud.caption('LEFT THE WORLD', 2); } });
  let mpEntered = false;
  function enterMp() {
    requests.stop();
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
  nav.register(progressMenu.node, () => progressMenu.back());
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
  let benchPixelRatio = null; // ?bench=1 holds a fixed resolution while it measures
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(benchPixelRatio ?? basePixelRatio() * sanitizeResScale(settings.renderScale, dynRes.scale, 0.45));
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
    // Esc on the pause menu resumes through the shared menu navigation (ui/nav.js), which also
    // ignores the Esc that released the pointer and opened the menu.
  });
  // A hidden tab (closed, switched away from, a laptop lid) saves now, not at the next 20 s save.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || mode === 'title' || session?.active) return;
    save.playTime += saveT; saveT = 0;
    persist();
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
  // Photo mode: the world holds, the HUD goes, an orbit camera and a framing card (ui/photoMode.js).
  let filterWas = 0, photoHour = null;
  const photoMode = createPhotoMode(document.body, {
    capture: () => { ink.render(scene, camera, time); return renderer.domElement.toDataURL('image/png'); },
    setFilter: (n) => { if (n === 'restore') ink.uniforms.uFilter.value = filterWas; else ink.setFilter(n); },
    getHour: () => clock.hour,
    setHour: (h) => { if (!storyEnv) photoHour = h; },
    playPose: (e) => { if (e) poser.playEmote(e); else poser.stopEmote(); },
    onShot: () => { content.photo({ x: camera.position.x, y: camera.position.y, z: camera.position.z, fx: -Math.sin(photoMode.cam.yaw), fy: 0, fz: -Math.cos(photoMode.cam.yaw) }); sfx.event({ type: 'stamp' }); },
    onExit: () => exitPhoto(),
  });
  function enterPhoto() {
    if (mode !== 'play') return;
    mode = 'photo';
    photoHour = null;
    filterWas = ink.uniforms.uFilter.value;
    if (locked()) document.exitPointerLock();
    uiRoot.style.visibility = 'hidden';
    photoMode.show(Math.atan2(hero.facing.x, hero.facing.z));
  }
  function exitPhoto() {
    if (mode !== 'photo') return;
    mode = 'play';
    photoHour = null;
    uiRoot.style.visibility = '';
    // The key that closed photo mode must not also pause the game or open it again.
    input.swallowCode('Escape'); input.swallowCode('KeyO');
    resetIntent();
  }
  function pauseGame() {
    mode = 'paused';
    pausedAt = performance.now();
    input.setEnabled(false);
    // A locked pointer sends every click to the canvas: release it so the menu can be clicked.
    if (locked()) document.exitPointerLock();
    if (session.active) lobby.showWorld(); else menus.showPause();
  }
  // From a click on Resume (a real user gesture) the mouse is taken back straight away; Esc and a
  // pad's B resume without it (the next click on the game takes it, as always).
  function resume({ lock = false } = {}) {
    mode = 'play';
    resetIntent();
    menus.hideAll();
    input.setEnabled(true);
    if (comicResumes()) return;
    if (lock && !locked() && input.device !== 'pad') { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* engines that throw instead */ } }
  }
  function toTitle() {
    content.stop(); requests.stop(); storyEnv = null;
    if (storyOn) {
      director.stop(); storyOn = false; combat.setOccupation(null); content.stop();
      if (character.id !== 'peter' && (!rosterOpen() || character.kind === 'civilian')) switchCharacter('peter');
      // A dev or test story never had a slot: free swing goes back to the real save.
      if (save.slot > 3) loadInto(loadSlot(window.localStorage, lastSlot(window.localStorage) ?? 1) ?? newSave(1));
    }
    mode = 'title';
    hud.show(false);
    input.setEnabled(false);
    placeTitle();
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
    moveIdleT = Math.hypot(input.move.x, input.move.y) > 0.2 ? 0 : moveIdleT + (rig.lastDt ?? 1 / 60);
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
  let gadgetHold = 0, padGadgetDown = false, wheelUsed = false, emoteHold = 0;
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
      const aim = findAimPoint(world, hero.body, aimCam);
      preview.valid = !!aim;
      // The dot marks where a zip would take you (zip points, as in Insomniac's games); with
      // nothing to zip to, where the crosshair's web would stick.
      const zp = findZipPoint(world, hero.body, aimCam);
      previewPoint = zp ?? aim;
      preview.zip = !!zp;
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
  const fightView = { pts: [], spread: 0, threat: null, handsOff: false };
  let moveIdleT = 0; // seconds since the player last steered (the fight camera only helps after a second of nothing)
  const view = {
    body: { p: renderP, get v() { return hero.body.v; } }, get state() { return hero.state; },
    get wall() { return hero.state === 'wall' ? hero.wall : null; }, // the wall camera (it never ran without this)
    get fight() {
      const p = hero.body.p;
      const near = combat.enemies.engaged.map((e) => ({ e, d: Math.hypot(e.body.p.x - p.x, e.body.p.z - p.z) })).filter((q) => q.d < 14).sort((a, b) => a.d - b.d).slice(0, 3);
      if (!near.length) return null;
      fightView.pts = near.map((q) => q.e.body.p);
      fightView.spread = near[near.length - 1].d;
      const w = near.filter((q) => q.e.state === 'windup').sort((a, b) => (a.e.strikeAt - a.e.t) - (b.e.strikeAt - b.e.t))[0];
      fightView.threat = w ? w.e.body.p : null;
      // The camera may only turn by itself with the pointer captured (or a pad), after a second with
      // no camera and no move input (fix spec A4).
      fightView.handsOff = (locked() || input.device === 'pad') && moveIdleT > 1.0;
      return fightView;
    },
  };
  let alpha = 1;
  const frameTimes = new Float32Array(4000);
  const workTimes = new Float32Array(4000);
  const gpuTimes = new Float32Array(4000);
  let frameIdx = 0, frame = 0, fps = 60, last = performance.now(), time = 0;
  const events = [];
  const eventLog = []; // event types for the test hook __game.events()

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
  const wordAt = new Map();
  const wordGate = (k, s) => { if (time - (wordAt.get(k) ?? -99) < s) return false; wordAt.set(k, time); return true; };
  let gdt = 0;
  // Combat feedback: words, sounds, shakes, impact frames, the HUD.
  let impactTimer = 0, impactLong = false;
  // Hit feel on the camera (fix spec C9): the field of view punches in and springs back in about
  // 0.12 s, and the camera kicks a few centimetres along the blow for three frames.
  let fovKick = 0, camKickT = 0;
  const camKickV = new THREE.Vector3();
  function combatEvent(e) {
    const at = e.at ?? (e.e ? e.e.body.p : null);
    switch (e.type) {
      case 'word': { const s = screenOf(at.x, at.y + 1.1, at.z); if (s.front) hud.word(e.text, s.x + (Math.random() - 0.5) * 80, s.y - 40, e.kind); break; }
      case 'heroHit': {
        sfx.event({ type: 'punch', heavy: e.heavy });
        // Hit feel (spec 1.8): a camera kick, a punch of the field of view, and on the big ones
        // (enders, launchers, spikes) a one-frame impact panel.
        fovKick = TUNE.fovPunch * (e.heavy ? 2 : 1);
        if (e.e) {
          const q = e.e.body.p, hp = hero.body.p, dx = q.x - hp.x, dz = q.z - hp.z, l = Math.hypot(dx, dz) || 1;
          if (settings.cameraShake) { camKickV.set(dx / l, 0.25, dz / l).multiplyScalar(TUNE.camKick * (e.heavy ? 1.8 : 1)); camKickT = 0.1; }
          if (settings.cameraShake && e.heavy) rig.shake = Math.max(rig.shake, 0.2);
          // A spark where the blow lands (between the two, at chest height); the big burst on heavies.
          const cx = hp.x + (dx / l) * Math.max(0.4, l - 0.35), cz = hp.z + (dz / l) * Math.max(0.4, l - 0.35);
          if (e.heavy) fx.burst(cx, q.y + 0.45, cz); else fx.spark(cx, q.y + 0.45, cz);
        }
        const hitFlash = e.heavy && (e.stop ?? 0) >= 0.08 ? impactFlash(settings.impactFrames, 'hit') : null;
        if (hitFlash && !impactLong) {
          const s = screenOf(e.e.body.p.x, e.e.body.p.y, e.e.body.p.z);
          ink.setImpact(hitFlash.strength, hitFlash.soft, s.x / innerWidth, 1 - s.y / innerHeight); clearTimeout(impactTimer); impactTimer = setTimeout(() => ink.setImpact(0), hitFlash.ms);
        }
        break;
      }
      case 'heroHurt': sfx.event({ type: 'hurt' }); combatHud.hurt(); combat.enemies.cheer?.(); if (settings.cameraShake) rig.shake = Math.max(rig.shake, 0.5); break;
      case 'finisher': {
        const s = screenOf(at.x, at.y, at.z);
        const fl = impactFlash(settings.impactFrames, 'finisher');
        if (fl) ink.setImpact(fl.strength, fl.soft, s.x / innerWidth, 1 - s.y / innerHeight);
        clearTimeout(impactTimer); impactLong = true;
        impactTimer = setTimeout(() => { ink.setImpact(0); impactLong = false; }, fl ? fl.ms : 220);
        break;
      }
      case 'slam': fx.ring(e.at.x, e.at.y - 0.9, e.at.z, 2.2); if (settings.cameraShake) rig.shake = 0.8; break;
      case 'enemyOut': combatHud.ko(e.e); break;
      case 'hint': hud.caption(e.text, 2.4); break;
      case 'finisherStart': rig.cinematic(e.time); break;
      case 'groundWarn': fx.warn(e.at.x, e.at.y, e.at.z, e.r, e.t); break;
      case 'takedown': rig.cinematic(0.8); break;
      case 'enemyPinned': { const p = e.e.body.p; fx.splat(p.x, p.y, p.z, e.e.pin.nx, 0, e.e.pin.nz); const s = screenOf(p.x, p.y, p.z); if (s.front) hud.word('PINNED!', s.x, s.y - 40); break; }
      case 'encounterStart': if (e.encounter.kind === 'gang') { hud.caption(COPY.combat.gangSpotted); waypoint = { x: e.encounter.x, z: e.encounter.z, auto: true }; } break;
      case 'encounterDone': if (e.encounter.kind === 'gang') { hud.caption(COPY.combat.gangBusted); if (waypoint?.auto) waypoint = null; } break;
      case 'thwip': if (e.combat) sfx.event({ type: 'thwip' }); break;
      case 'propBreak': fx.burst(e.at.x, e.at.y, e.at.z); sfx.event({ type: 'punch', heavy: true }); break;
      case 'enemyBrokeFree': { const p = e.e.body.p, s = screenOf(p.x, p.y + 1, p.z); if (s.front) hud.word('RIIP!', s.x, s.y - 30, 'small'); break; }
      case 'webBlast': fx.ring(e.at.x, e.at.y - 0.9, e.at.z, 3); sfx.event({ type: 'webThrow' }); if (settings.cameraShake) rig.shake = Math.max(rig.shake, 0.35); break;
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
    if (defeatT === 0) requests.onDefeat();
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
  // The river: a splash brings the hero back to dry land (see splash.js for where).
  const splashMem = createSplashMemory(spawn, city.isWater);
  let splashT = -1;
  function riverCheck(dt) {
    const p = hero.body.p;
    if (splashT >= 0) {
      splashT += dt;
      if (splashT > 0.9) {
        const r = splashMem.respawn();
        hero.place(r.x, r.y, r.z, 0, 0, 0, r.state);
        prevP.x = renderP.x = r.x; prevP.y = renderP.y = r.y; prevP.z = renderP.z = r.z;
        rig.focus.x = r.x; rig.focus.y = r.y + 0.55; rig.focus.z = r.z;
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
    splashMem.record(p, hero.state, hero.speed, dt, hero.wall);
  }
  function worldEvent(e) {
    const p = hero.body.p;
    switch (e.type) {
      case 'attach': fx.splat(e.x, e.y, e.z, e.nx, e.ny, e.nz); rig.onAttach(); break;
      case 'release': case 'perfect': case 'swingJump': fx.letGo(); if (e.type === 'perfect') rig.pop(6); break;
      case 'zipBoost': rig.pop(7); sfx.event({ type: 'zip' }); break;
      case 'diveCarry': rig.pop(5); break;
      case 'thwip': {
        // THWIP! now and then, by the hand (every shot would be noise; the sound carries the rest).
        if (time - lastThwipWord > 9) {
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
    // Swing words now and then, not on every release (the boost and its sound say it already).
    if (e.type === 'perfect' && wordGate('perfect', 8)) { const s = screenOf(p.x, p.y + 1, p.z); hud.word('PERFECT!', s.x, s.y - 90, 'small'); }
    if (e.type === 'swingJump' && wordGate('whoosh', 10)) { const s = screenOf(p.x, p.y, p.z); hud.word('WHOOSH!', s.x - 100, s.y + 20, 'small'); }
    if (e.type === 'corner') {
      const s = screenOf(p.x, p.y + 0.5, p.z);
      // The word now and then (corners come thick and fast down an avenue).
      if (s.front && time - lastWhipWord > 4) { lastWhipWord = time; hud.word('WHIP!', s.x + 90, s.y - 50, 'small'); }
      if (settings.cameraShake) rig.shake = Math.max(rig.shake, 0.25);
    }
    if (e.type === 'launch' && wordGate('hup', 8)) { const s = screenOf(p.x, p.y, p.z); if (s.front) hud.word('HUP!', s.x - 80, s.y - 40, 'small'); }
  }
  let camOverride = null;
  let trace = null, traceSkip = 0;
  const traceDir = new THREE.Vector3(), traceV = new THREE.Vector3(), traceRoot = new THREE.Vector3(), traceInv = new THREE.Quaternion();
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
    music.set(pickMusic(dt));
    music.duck(storyUi.comicOpen ? 0.45 : storyUi.talking ? 0.6 : 1);
    music.update(dt);
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
      // The gadget wheel slows the world while it is open, and the stick picks instead of steering.
      if (combatHud.wheelOpen) { if (!session.active) gdt *= 0.25; intent.moveX = intent.moveZ = 0; }
      if (gadgetHold > 12) { if (!combatHud.wheelOpen) combatHud.openWheel(); combatHud.steerWheel(input.look, input.move); wheelUsed = true; }
      else if (combatHud.wheelOpen) { const pick = combatHud.closeWheel(); if (pick) combat.gadgets.select(pick); }
      // The emote wheel (hold B / D-pad down): free roam, standing on the ground, nobody to fight.
      emoteHold = input.down('emote') ? emoteHold + 1 : 0;
      const emoteOk = hero.state === 'ground' && !combat.heroCombat.c.move && combat.enemies.engaged.length === 0;
      if (emoteHold > 10 && emoteOk) {
        if (!emoteWheel.open) emoteWheel.show();
        if (input.pressed('jump')) emoteWheel.flip();
        emoteWheel.steer(input.look, input.move); intent.moveX = intent.moveZ = 0; intent.jump = intent.jumpPressed = false;
      }
      else if (emoteWheel.open) { const id = emoteWheel.close(); if (id && emoteOk) poser.playEmote(emoteById(id)); }
      // A neighbourhood request's giver in reach: E talks.
      requests.preStep(intent);
      // A fist bump with a fan who stopped to cheer (E / pad Y, standing near them, no fight on).
      if (crowd.bumpable && emoteOk && intent.hangPressed && !(storyOn && director.quiet)) {
        const at = crowd.fistBump();
        if (at) {
          intent.hangPressed = intent.yankPressed = false;
          const y = Math.atan2(at.x - hero.body.p.x, at.z - hero.body.p.z);
          hero.facing.x = Math.sin(y); hero.facing.z = Math.cos(y);
          poser.playEmote({ clip: 'Handshake' });
          const sc = screenOf(at.x, 2, at.z); if (sc.front) hud.word('FIST BUMP!', sc.x, sc.y - 30, 'small');
          sfx.event({ type: 'stamp' });
        }
      }
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
      if (input.pressed('suitPower') && character.kind !== 'civilian') progress.usePower();
      if (storyOn && !session.active && input.pressed('scan')) director.scan();
      if (input.pressed('photo') && !session.active) takePhoto();
      if (input.pressed('photoMode') && !session.active) enterPhoto();
      content.update(gdt, { active: !session.active && !(storyOn && director.quiet) && !storyUi.cardOpen && !storyUi.comicOpen });
      requests.update(gdt, { active: !session.active && !(storyOn && director.quiet) && !storyUi.comicOpen && character.kind !== 'civilian' && !content.busyHere });
      if (!storyOn) storyUi.update(gdt); // radio lines and stamps from free roam
      // One voice at a time: the traversal tip steps aside for story tips, dialogue and fights.
      hud.setTipQuiet(storyUi.tipsShown || storyUi.talking || combat.enemies.engaged.length > 0);
      // The pad's D-pad down moves the radio on (spec F4).
      {
        const pad = [...(navigator.getGamepads?.() ?? [])].find((q) => q && q.connected) ?? null;
        const down = !!pad?.buttons[13]?.pressed;
        if (down && !padRadioWas && storyUi.talking) storyUi.advanceRadio();
        padRadioWas = down;
      }
      for (const e of events) progress.onHeroEvent(e);
      if (combat.heroCombat.c.defeated) defeatStep(dt);
      riverCheck(dt);
      travelStep(dt);
      saveT += dt;
      if (saveT > 20) { saveT = 0; save.playTime += 20; persist(); }
      districtCheck();
      for (const e of events) { sfx.event(e); hud.onEvent(e); worldEvent(e); }
      for (const e of events) { eventLog.push(e.type); if (eventLog.length > 200) eventLog.shift(); }
      interpolate();
      rig.update(dt, locked() || input.device === 'pad' ? input.look : NO_LOOK, view, world, settings);
      hud.setLockHint(!locked() && input.device !== 'pad');
    } else {
      fixed.reset();
      if (mode === 'photo') {
        photoMode.update(dt, input);
        interpolate();
        // A pad: A takes the shot, B or Start leaves.
        if (input.device === 'pad') { if (input.pressed('jump')) photoMode.shot(); if (input.pressed('dive') || input.pressed('pause')) photoMode.hide(); }
      }
      if (mode === 'title') {
        // The hero holds his perch on the ledge (the poser crouches on a perch event).
        events.push({ type: 'perch' });
        hero.facing.x = -1; hero.facing.z = 0;
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
      nav.update(dt);
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
    sfx.setAmbience({ height: Math.max(0, hero.body.p.y - 1), night: nightNow, crime: content?.crimeOn ? 1 : 0, quiet: mode !== 'play' && mode !== 'photo' }, dt);

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
    } else if (mode === 'photo') {
      // Photo mode's orbit round the hero.
      const c = photoMode.cam, cp = Math.cos(c.pitch);
      camera.position.set(renderP.x + Math.sin(c.yaw) * cp * c.dist, renderP.y + 0.3 + Math.sin(c.pitch) * c.dist + c.up, renderP.z + Math.cos(c.yaw) * cp * c.dist);
      camera.lookAt(renderP.x, renderP.y + 0.3 + c.up * 0.6, renderP.z);
      if (camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
    } else if (mode === 'title') {
      // Out past the ledge and a little below him, looking up: the hero against the sky, the
      // camera drifting slowly.
      const s = Math.sin(time * 0.06), c = Math.cos(time * 0.045);
      camera.position.set(renderP.x - 3.2 + c * 0.3, renderP.y - 0.7 + s * 0.2, renderP.z + 2.2 + s * 0.7);
      camera.lookAt(renderP.x + 0.8, renderP.y + 1.1, renderP.z - 2.6);
      if (camera.fov !== 46) { camera.fov = 46; camera.updateProjectionMatrix(); }
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
      if (camKickT > 0) { camera.position.addScaledVector(camKickV, Math.sin(Math.PI * (1 - camKickT / 0.1))); camKickT -= dt; }
      if (rig.shake > 0.001) {
        // Smooth noise: a fresh random tilt every frame read as buzz at high frame rates.
        const a = rig.shake * 0.035, t = time;
        camera.rotateX(a * (Math.sin(t * 37) * 0.6 + Math.sin(t * 61 + 1.7) * 0.4));
        camera.rotateY(a * (Math.sin(t * 43 + 0.6) * 0.6 + Math.sin(t * 29 + 2.9) * 0.4));
        rig.shake *= Math.exp(-dt * 7);
      }
    }
    fovKick *= Math.exp(-dt * 25);
    if (!camOverride && mode !== 'photo' && mode !== 'title' && Math.abs(camera.fov - (rig.fov + fovKick + rig.fovPop)) > 0.01) { camera.fov = rig.fov + fovKick + rig.fovPop; camera.updateProjectionMatrix(); }
    if (waypoint && mode === 'play') {
      wpV.set(waypoint.x, Math.max(2, hero.body.p.y * 0.5), waypoint.z).project(camera);
      const behind = wpV.z > 1;
      const d = Math.hypot(waypoint.x - hero.body.p.x, waypoint.z - hero.body.p.z);
      if (d < 20) { if (!waypoint.story) waypoint = null; hud.waypoint(false); } else hud.waypoint(true, (wpV.x * 0.5 + 0.5) * innerWidth, (-wpV.y * 0.5 + 0.5) * innerHeight, d, behind);
    } else hud.waypoint(false);
    sky.follow(camera, time);
    // The print slips further out of register at speed (off with impact frames off).
    ink.uniforms.uSpeedK.value = settings.impactFrames === 'off' ? 0 : Math.min(1, Math.max(0, (hero.speed - 30) / 30));
    skyline.follow(camera);
    applyEnv(mode === 'play' ? dt : 0);
    // Mysterio's smoke: a green cast over the ink and a slow tilt of the camera (visual only).
    if (illusionK > 0 && !shadeFreeze) SHADE_UNIFORMS.uTint.value.lerp(C4.setRGB(0.62, 1.05, 0.7), 0.4 * illusionK);
    if (illusionK > 0 && !camOverride) camera.rotateZ(Math.sin(time * 0.6) * 0.07 * illusionK);
    rain.update(camera, time);
    // The camera crammed right up against the hero (a tight corner): hide him rather than fill the
    // screen with his back.
    heroModel.root.visible = camOverride || mode === 'photo' || mode === 'title' || rig.closeness > 0.9;
    const hp = hero.body.p;
    sun.target.position.set(Math.round(hp.x / 8) * 8, 0, Math.round(hp.z / 8) * 8);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 400);
    const Tprev = performance.now();
    updatePreview(dt);
    prof('aim', Tprev);
    fx.update(dt);
    life.update(mode === 'play' ? gdt : dt * 0.5, renderP, scare);
    crowd.update(dt, camera.position, hero, { spidey: character.kind !== 'civilian' && mode === 'play' });
    {
      const b = crowd.bumpable, rq = requests.prompt, inStroll = storyOn && director.step?.type === 'stroll';
      // Missions own the prompt (strolls, stealth takedowns): no fist bumps or requests then.
      if (!inStroll && !(storyOn && director.quiet)) {
        if (rq) storyUi.talkPrompt(rq, screenOf);
        else if (b) storyUi.talkPrompt({ p: { x: b.m.root.position.x, y: 0.9, z: b.m.root.position.z }, label: 'FIST BUMP' }, screenOf);
        else storyUi.talkPrompt(null);
      }
    }
    halos.update(performance.now() / 1000, life.lightT, nightNow);
    skyline.setNight?.(nightNow, performance.now() / 1000);
    if (nightNow > 0.02) {
      // Car lamps: two white heads in front, two red tails behind.
      halos.beginDynamic();
      life.eachCar(carLamps);
      halos.endDynamic();
    }
    combatHud.update(dt, camera);
    scare = null;
    if (trace) {
      // Test hook: what the player sees each frame (smoothness probes).
      camera.getWorldDirection(traceDir);
      const q = heroModel.orient.quaternion;
      const row = [traceSkip > 0 ? -dtMs : dtMs, camera.position.x, camera.position.y, camera.position.z, traceDir.x, traceDir.y, traceDir.z,
        q.x, q.y, q.z, q.w, renderP.x, renderP.y, renderP.z, camera.fov, hero.state, rig.closeness,
        `${combat.heroCombat.c.move?.key ?? ''}|${heroModel.animator?.currentName ?? ''}`];
      // Hands, feet and head in the body's own frame (animation pops show up here, not in the root).
      const B = heroModel.bones;
      heroModel.root.updateMatrixWorld(true); // read this frame's pose, not last frame's matrices
      traceInv.copy(heroModel.orient.quaternion).invert();
      heroModel.orient.getWorldPosition(traceRoot);
      for (const bn of [B?.handL, B?.handR, B?.footL, B?.footR, B?.head]) {
        if (!bn) { row.push(0, 0, 0); continue; }
        bn.getWorldPosition(traceV).sub(traceRoot).applyQuaternion(traceInv);
        row.push(traceV.x, traceV.y, traceV.z);
      }
      trace.push(row);
      if (trace.length > 20000) trace.length = 0;
      traceSkip--;
    }
    const Tr = performance.now();
    streetGroup.userData.updateCars?.(camera.position, dt);
    streetGroup.userData.updateProps?.(camera.position, dt);
    ink.render(scene, camera, time);
    const renderMs = performance.now() - Tr;
    prof('render', Tr);

    const Th = performance.now();
    hud.update(dt, { fps, speed: mode === 'play' ? hero.speed : 0, anchor: mode === 'play' ? preview : null, state: hero.state, dev: dev || devPanel.open, w: innerWidth, h: innerHeight, play: mode === 'play' && !nav.open });
    prof('hud', Th);
    input.endFrame();

    const scriptMs = performance.now() - t0;
    state.stepMs = scriptMs - renderMs; // the frame's own script time (read by ?bench=1)
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
    placeHero: (x, y, z, st = 'air') => placeHeroAt(x, y, z, 0, 0, 0, st),
    hideHero: (on) => { heroModel.root.visible = !on; },
    // A boss fight opens with letterbox bars and a push-in; a boss going down gets a beat of slow
    // motion (spec 1.10).
    bossIntro: () => { hud.letterbox(1.6); rig.cinematic(1.3); },
    faceToward: (p) => {
      const dx = p.x - hero.body.p.x, dz = p.z - hero.body.p.z;
      const flyingFast = hero.state !== 'ground' && hero.state !== 'wall' && Math.hypot(hero.body.v.x, hero.body.v.z) > 10;
      if (Math.hypot(dx, dz) > 10 && !flyingFast) rig.faceYaw(Math.atan2(dx, dz));
    },
    bossDown: () => combat.heroCombat.slowmo(0.8),
    focusSun: (x, z) => { sun.target.position.set(x, 0, z); sun.position.copy(sun.target.position).addScaledVector(sunDir, 400); sun.target.updateMatrixWorld(); },
    aspect: () => innerWidth / innerHeight,
    snapshot: (cam) => {
      // The sky and the skyline rings follow the shot's camera; no speed slip in a panel.
      const sk = ink.uniforms.uSpeedK.value;
      sky.follow(cam, time); skyline.follow(cam); ink.uniforms.uSpeedK.value = 0;
      ink.render(scene, cam, time);
      const url = renderer.domElement.toDataURL('image/jpeg', 0.86);
      sky.follow(camera, time); skyline.follow(camera); ink.uniforms.uSpeedK.value = sk;
      return url;
    },
    character: () => character.id,
    setCharacter: (id) => switchCharacter(id),
    // Peter in a stroll: talk with his hands (an emote clip on the poser), or stop.
    heroEmote: (e) => { if (e) poser.playEmote(e); else poser.stopEmote(); },
    quietTraffic: (z) => life.setQuietZone(z),
    faceYaw: (y) => { hero.facing.x = Math.sin(y); hero.facing.z = Math.cos(y); rig.faceYaw(y); },
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
    caption: (t, s) => hud.caption(t, s), alert: (t, s) => hud.alert(t, s), sfx, persist: () => persist(),
    stamp: (t) => { storyUi.stamp(t); sfx.event({ type: 'stamp' }); },
    timer: (label, s) => storyUi.timer(label, s),
    prompt: (t, k) => storyUi.hold(t, k),
    hour: () => clock.hour, weather: () => weatherState.to,
    boom: (p) => { fx.ring(p.x, p.y, p.z, 2.2); if (settings.cameraShake) rig.shake = Math.max(rig.shake, 0.8); sfx.event({ type: 'land', hard: true, impact: 30 }); const h = hero.body.p; if (Math.hypot(h.x - p.x, h.z - p.z) < 6) combat.heroHit({ dmg: 30, dir: { x: 0, z: 1 }, from: null, unblockable: true }); },
    crimeWaypoint: (w) => { crimeWp = w; if (w) { if (!waypoint || waypoint.auto) waypoint = { ...w, auto: true }; } else if (waypoint?.auto) waypoint = null; },
    holding: () => input.down('hang'),
    placeHero: (x, y, z) => placeHeroAt(x, y, z, 0, 0, 0, 'ground'),
    pressedHang: () => input.pressed('hang'),
    busy: () => (storyOn && director.quiet) || session.active || !settings.crimes || !!combat.encounter,
    puzzle: (kind) => { mode = 'comic'; input.setEnabled(false); if (locked()) document.exitPointerLock(); return puzzles.play(kind).then((ok) => { mode = 'play'; resetIntent(); input.setEnabled(true); return ok; }); },
  });
  // Neighborhood requests (src/content/requests.js): people around the city who need a hand.
  const requests = createRequests({
    scene, city, hero, combat, save, assets, buildCharacter, ui: storyUi, camera, lamps: street.lamps,
    reward: (kind, o = {}) => progress.reward(kind, o), persist: () => persist(),
    alert: (t, s) => hud.alert(t, s), caption: (t, s) => hud.caption(t, s), stamp: (t) => { storyUi.stamp(t); sfx.event({ type: 'stamp' }); },
    waypoint: (w) => { if (w) { if (!waypoint || waypoint.auto) waypoint = { ...w, auto: true }; } else if (waypoint?.auto) waypoint = null; },
  });
  const tracker = createTracker(uiRoot, { data: () => ({ ...content.tracker(), requests: requests.count() }), onBack: () => menus.showPause() });
  nav.register(tracker.node, () => tracker.back());
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
    unlockSuitsIfAsked();
    progress.useSave(save);
    content.reload();
  }
  function enterStory(slot, fresh) {
    if (session.active) return;
    requests.stop();
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
    requests.stop();
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
    scene, // dev probes toggle parts of the scene to time them
    renderer, // dev probes count shader programs
    music: () => music.current,
    // Test hook: whether the mocap sets arrived (they load after boot) and how many clips there are.
    clips: () => ({ combat: !!assets.combatReady, social: !!assets.socialReady, count: assets.clips.size }),
    requests: () => requests.state(),
    requestSpots: () => requests.spots.map((s) => ({ id: s.r.id, giver: s.giver, roof: s.roof, corner: s.corner, kind: s.r.task.kind })),
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
    setLook(yaw, pitch) { rig.yaw = yaw; rig.pitch = pitch; rig.sinceLook = 0; rig.sinceAim = 0; rig.turnTo = null; },
    // Turns the camera so the crosshair sits on a world point (for scripted play).
    aimAt(x, y, z) {
      traceSkip = 3; // the probe ignores the camera snap a scripted aim makes
      interpolate();
      for (let i = 0; i < 4; i++) {
        const dx = x - rig.pos.x, dy = y - rig.pos.y, dz = z - rig.pos.z, l = Math.hypot(dx, dy, dz) || 1;
        rig.yaw = Math.atan2(dx, dz); rig.pitch = -Math.asin(dy / l); rig.sinceLook = 0; rig.sinceAim = 0; rig.turnTo = null;
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
    hud: () => hud, // test hook: sound words, notices, letterbox
    nav: () => nav,
    get frameTimes() { return Array.from(frameTimes.slice(0, Math.min(frameIdx, frameTimes.length))); },
    get workTimes() { return Array.from(workTimes.slice(0, Math.min(frameIdx, workTimes.length))); },
    get gpuTimes() { return Array.from(gpuTimes.slice(0, Math.min(frameIdx, gpuTimes.length))).filter((v) => v >= 0); },
    profile: () => ({ ...profMax }),
    resetProfile() { for (const k in profMax) delete profMax[k]; },
    resetTimes() { frameTimes.fill(0); workTimes.fill(0); gpuTimes.fill(-1); frameIdx = 0; },
    // Test hook: the event types since the last call (a rolling log, so an event in a frame between
    // two polls is not lost; it used to return only the last frame's).
    events: () => { const out = eventLog.splice(0); return out; },
    city, spawn, tune,
    dynRes: () => ({ scale: dynRes.scale, refresh: dynRes.refreshHz }),
    gpuMs: () => ink.gpuMs,
  };

  requestAnimationFrame((t) => { last = t; tick(t); });
  const at = params.get('at');
  const bench = params.get('bench') === '1';
  if (at === 'swing' || bench) enterPlay();
  else if (at && stepById(at)) devStory(at);
  else menus.showTitle();
  // ?bench=1: the one-link benchmark for the player's own machine (loaded only when asked for).
  if (bench) {
    import('../dev/perfBench.js').then(({ runPerfBench }) => runPerfBench({
      renderer, ink, scene, dynRes, crowd, state,
      getQuality: () => quality,
      basePixelRatio,
      setPixelRatio: (pr) => { benchPixelRatio = pr; resize(); },
      // The title shot's ledge: the hero on the spawn roof's west edge, looking out over the city,
      // golden hour held and clear skies, so every row draws the same frame.
      place: () => {
        photoHour = 17.4; weatherState.from = weatherState.to = 'clear'; weatherState.k = 1; weatherState.next = 1e9;
        placeHeroAt(ledge.x + 0.3, ledge.y, ledge.z, 0, 0, 0, 'ground', -Math.PI / 2); rig.pitch = 0.12;
      },
      isClear: () => mode === 'play' && !storyOn,
    }));
  }
}
