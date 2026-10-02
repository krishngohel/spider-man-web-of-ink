// Close-ups of enemy faces for each faction (idle, far from the hero so they do not engage).
//   node scripts/enemy-face.mjs [url] [out.png]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5310/';
const out = process.argv[3] ?? 'shots/enemy-face.png';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 480, height: 600 } });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
const facs = ['street', 'kingpin', 'maggia', 'sable', 'oscorp', 'sinister', 'kraven', 'symbiote'];
await p.evaluate(() => { window.__game.teleport(0, 0.9, -360, 0, 0, 0, 'ground', 0); window.__game.setSetting('crimes', false); });
const shots = [];
for (let i = 0; i < facs.length; i++) {
  await p.evaluate(([f, i]) => {
    const g = window.__game, c = g.combat();
    c.clear();
    const e = c.enemies.spawn({ x: 0, z: -250, faction: f, arch: 'brawler', look: i % 2 });
    e.facing = Math.PI; // face -z, toward the camera
    g.setCamOverride({ pos: [0.35, 1.72, -251.3], look: [0, 1.62, -250], fov: 30 });
    document.querySelector('.lockhint')?.remove(); document.querySelector('.tip')?.remove();
  }, [facs[i], i]);
  await sleep(500);
  shots.push(await p.screenshot());
}
await b.close();
const tiles = await Promise.all(shots.map((s) => sharp(s).resize(240, 300).toBuffer()));
await sharp({ create: { width: 240 * tiles.length, height: 300, channels: 3, background: '#000' } }).composite(tiles.map((t, i) => ({ input: t, left: i * 240, top: 0 }))).png().toFile(out);
console.log('wrote', out);
