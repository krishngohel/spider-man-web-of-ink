// FBX to GLB without Blender: three's FBXLoader and GLTFExporter in muted headless Chromium,
// served by the polish dev server (it resolves the three imports). Mixamo only exports FBX.
//   node scripts/fbx2glb.mjs in.fbx [out.glb] [more.fbx ...]   (dev server on :5310)
// With several inputs each becomes the same name with .glb beside it.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { launchArgs } from './lib.mjs';

const args = process.argv.slice(2);
const pairs = [];
if (args.length === 2 && args[1].endsWith('.glb')) pairs.push([args[0], args[1]]);
else for (const a of args) pairs.push([a, a.replace(/\.fbx$/i, '.glb')]);
if (!pairs.length) { console.error('usage: node scripts/fbx2glb.mjs in.fbx [out.glb]'); process.exit(1); }

const base = process.env.DEV_URL ?? 'http://localhost:5310';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage();
// A blank page on the dev server's origin, so its module imports resolve.
await p.route(base + '/__fbx.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>fbx</title>' }));
await p.goto(base + '/__fbx.html');
for (const [inp, outp] of pairs) {
  const b64 = readFileSync(inp).toString('base64');
  const res = await p.evaluate(async (data) => {
    const { FBXLoader } = await import('/node_modules/three/examples/jsm/loaders/FBXLoader.js');
    const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
    const bin = Uint8Array.from(atob(data), (c) => c.charCodeAt(0)).buffer;
    const root = new FBXLoader().parse(bin, '');
    const glb = await new GLTFExporter().parseAsync(root, { binary: true, animations: root.animations, onlyVisible: false });
    let s = '';
    const u = new Uint8Array(glb);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return { glb: btoa(s), clips: root.animations.map((a) => `${a.name} ${a.duration.toFixed(2)}s`) };
  }, b64);
  writeFileSync(outp, Buffer.from(res.glb, 'base64'));
  console.log(`${inp} -> ${outp} (${res.clips.join(', ')})`);
}
await b.close();
