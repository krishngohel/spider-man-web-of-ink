// Web hang with real keys, filmed as a strip: swing, grab the line (E), settle, upside down, climb,
// slide. Usage: node scripts/hang-film.mjs [url] [out.png]
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { launchArgs, sleep } from './lib.mjs';
const url = process.argv[2] ?? 'http://localhost:5310/';
const out = process.argv[3] ?? 'shots/hang.png';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 640, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
const H = () => p.evaluate(() => window.__game.hero());
const shots = [], notes = [];
const snap = async (label) => { const h = await H(); notes.push(`${label}: ${h.state} L ${h.swing.L.toFixed(1)} y ${h.p.y.toFixed(1)} inv ${h.hangInverted}`); shots.push(await p.screenshot()); };

await p.evaluate(() => {
  const g = window.__game;
  g.teleport(0, 50, -330, 0, 0, 14, 'air', 0);
  const t = g.suggest(0, 1);
  g.aimAt(t.x, t.y, t.z);
});
await p.keyboard.down('Shift');
await p.waitForFunction(() => window.__game.hero().swing.active, null, { timeout: 3000 });
await sleep(250);
await p.keyboard.press('KeyE');
await p.keyboard.up('Shift');
await p.evaluate(() => window.__game.setCamOverride({ side: 4.5, up: 0.4, fov: 45 }));
await sleep(300); await snap('grabbed');
await sleep(2500); await snap('settled');
await sleep(3500); await snap('upside down');
await p.keyboard.down('KeyW'); await sleep(900); await snap('climbing'); await p.keyboard.up('KeyW');
await p.keyboard.down('KeyS'); await sleep(900); await snap('sliding'); await p.keyboard.up('KeyS');
await p.keyboard.press('Space'); await sleep(250); await snap('jumped off');
await b.close();
const tiles = await Promise.all(shots.map((s) => sharp(s).resize(320, 360).toBuffer()));
await sharp({ create: { width: 320 * tiles.length, height: 360, channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: i * 320, top: 0 }))).png().toFile(out);
console.log(notes.join('\n'));
console.log(errors.length ? errors.join('\n') : 'no console errors');
