// Contact sheets of retargeted clips on the hero body (headless, muted; needs a dev server).
//   DEV_URL=http://localhost:5300 node scripts/clip-sheet.mjs combat|social [filter-regex] [out-prefix]
// Each row is one clip: five frames across its duration, seen from the side-front.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { launchArgs } from './lib.mjs';

const [file = 'combat', filter = '.', prefix = 'sheet'] = process.argv.slice(2);
const base = process.env.DEV_URL ?? 'http://localhost:5300';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 1000, height: 1000 } });
p.on('console', (m) => { if (m.type() === 'error') console.log('page:', m.text()); });
await p.route(base + '/__clips.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>clips</title><body style="margin:0;background:#fff">' }));
await p.goto(base + '/__clips.html');
const pages = await p.evaluate(async ({ file, filter }) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const L = new GLTFLoader();
  const hero = await L.loadAsync('/assets/hero_m.glb');
  const anims = await L.loadAsync(`/assets/anims_${file}.glb`);
  const re = new RegExp(filter);
  const clips = anims.animations.filter((c) => re.test(c.name)).map((c) => new THREE.AnimationClip(c.name, c.duration, c.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('pelvis')))));
  const W = 1000, ROWS = 8, COLS = 5, cw = W / COLS, ch = 1000 / ROWS;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(cw, ch);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f1ea);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666655, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(3, 5, 4); scene.add(sun);
  const grid = new THREE.GridHelper(6, 12, 0x999999, 0xcccccc); scene.add(grid);
  scene.add(hero.scene);
  hero.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material = new THREE.MeshLambertMaterial({ color: 0xc8343a }); } });
  const cam = new THREE.PerspectiveCamera(40, cw / ch, 0.1, 50);
  const mixer = new THREE.AnimationMixer(hero.scene);
  const pelvis = hero.scene.getObjectByName('pelvis');
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = 1000;
  const g = canvas.getContext('2d');
  const out = [];
  for (let k = 0; k < clips.length; k += ROWS) {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, 1000);
    clips.slice(k, k + ROWS).forEach((clip, row) => {
      mixer.stopAllAction();
      const a = mixer.clipAction(clip); a.reset().play();
      for (let c = 0; c < COLS; c++) {
        const t = (clip.duration * (c + 0.5)) / COLS;
        a.time = t; mixer.update(0);
        hero.scene.updateMatrixWorld(true);
        const pw = pelvis.getWorldPosition(new THREE.Vector3());
        cam.position.set(pw.x + 3.2, 1.6, pw.z + 3.6); cam.lookAt(pw.x, 0.85, pw.z);
        r.render(scene, cam);
        g.drawImage(r.domElement, c * cw, row * ch);
        g.fillStyle = '#000'; g.font = '12px sans-serif';
        g.fillText(c === 0 ? `${clip.name} ${clip.duration.toFixed(2)}s` : `${t.toFixed(2)}s`, c * cw + 4, row * ch + 14);
      }
      mixer.uncacheClip(clip);
    });
    out.push(canvas.toDataURL('image/png').split(',')[1]);
  }
  return out;
}, { file, filter });
pages.forEach((d, i) => { const f = `${prefix}-${file}-${i}.png`; writeFileSync(f, Buffer.from(d, 'base64')); console.log(f); });
await b.close();
