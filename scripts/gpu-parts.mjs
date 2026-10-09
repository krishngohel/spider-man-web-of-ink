// GPU time with parts of the scene hidden, from fixed views (headless, muted, vsync off).
//   node scripts/gpu-parts.mjs [hour] [url]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const hour = Number(process.argv[2] ?? 17.4);
const url = process.argv[3] ?? 'http://localhost:5300/';
const b = await chromium.launch({ args: launchArgs(['--disable-frame-rate-limit', '--disable-gpu-vsync']), headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(new URL('?at=swing&gputime=1', url).href);
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await sleep(4000);
const views = { tower: [[-20, 200, -150], [60, 60, 300]], street: [[-4, 7, 0], [40, 10, 60]], roofs: [[-700, 60, -300], [-500, 10, -100]] };
const parts = ['none', 'halos', 'wetStreaks', 'street', 'city', 'lanterns', 'cityLife'];
for (const [vn, [pos, look]] of Object.entries(views)) {
  const row = [];
  for (const part of parts) {
    const ms = await p.evaluate(async ([pos, look, part, hour]) => {
      const g = window.__game; g.setTime(hour);
      g.teleport(pos[0], 1, pos[2], 0, 0, 0, 'ground', 0);
      g.setCamOverride({ pos, look, fov: 60 });
      const hidden = [];
      g.scene.traverse((o) => { if (o.name === part && o.visible) { o.visible = false; hidden.push(o); } });
      await new Promise((r) => setTimeout(r, 700));
      g.resetTimes();
      await new Promise((r) => setTimeout(r, 1800));
      const t = g.gpuTimes.sort((a, b) => a - b);
      for (const o of hidden) o.visible = true;
      return t.length ? t[Math.floor(t.length / 2)] : -1;
    }, [pos, look, part, hour]);
    row.push(`${part} ${ms.toFixed(2)}`);
  }
  console.log(vn.padEnd(7), row.join(' | '));
}
await b.close();
