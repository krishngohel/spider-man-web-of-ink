// Neighborhood requests gate: plays every request headless and muted. For each one: the giver is
// there, E starts their lines, the task starts (a crew spawns, or the item sits on its roof), the
// crew goes down (knocked out by the test) or Spider-Man reaches the item, and back at the giver E
// plays the thanks and the request is saved as done.
//   node scripts/request-check.mjs [url]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5310/';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(url + '?at=swing');
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await sleep(4000);
const spots = await p.evaluate(() => window.__game.requestSpots());
const tp = (x, y, z) => p.evaluate(([x, y, z]) => window.__game.teleport(x, y, z, 0, 0, 0, 'ground', 0), [x, y, z]);
const talk = async () => {
  await p.keyboard.down('KeyE'); await sleep(60); await p.keyboard.up('KeyE'); await sleep(250);
  if (!(await p.evaluate(() => window.__game.story().talking))) return false;
  for (let k = 0; k < 30 && (await p.evaluate(() => window.__game.story().talking)); k++) { await p.keyboard.press('Enter'); await sleep(150); }
  return true;
};
let bad = 0;
for (const s of spots) {
  const fail = (why) => { bad++; console.log(`FAIL  ${s.id} (${s.kind}): ${why}`); };
  await tp(s.giver.x + 1.2, 0.95, s.giver.z);
  await sleep(900);
  let st = await p.evaluate(() => window.__game.requests());
  if (st.giver !== s.id) { fail(`giver not shown (${st.giver})`); continue; }
  if (!(await talk())) { fail('E did not start the ask'); continue; }
  await sleep(200);
  st = await p.evaluate(() => window.__game.requests());
  if (st.active?.id !== s.id) { fail('task did not start'); continue; }
  if (s.kind === 'gang') {
    await sleep(500);
    await p.evaluate(() => { for (const e of window.__game.combat().enemies.list) if (!e.boss && !e.isPlayer) { e.hp = 0; e.state = 'out'; } });
  } else {
    if (!s.roof) { fail('no roof for the item'); continue; }
    await tp(s.roof.x, s.roof.y + 0.6, s.roof.z);
  }
  await sleep(900);
  for (let k = 0; k < 20 && (await p.evaluate(() => window.__game.story().talking)); k++) { await p.keyboard.press('Enter'); await sleep(150); }
  st = await p.evaluate(() => window.__game.requests());
  if (st.active?.phase !== 'return') { fail(`task did not finish (${JSON.stringify(st.active)})`); continue; }
  await tp(s.giver.x + 1.2, 0.95, s.giver.z);
  await sleep(700);
  if (!(await talk())) { fail('E did not start the thanks'); continue; }
  await sleep(300);
  st = await p.evaluate(() => window.__game.requests());
  console.log(`${st.done.includes(s.id) ? 'PASS ' : 'FAIL '} ${s.id} (${s.kind})`);
  if (!st.done.includes(s.id)) bad++;
}
console.log(errors.length ? `console errors:\n${errors.slice(0, 5).join('\n')}` : 'no console errors');
console.log(bad || errors.length ? 'FAILED' : 'ALL PASS');
await b.close();
process.exit(bad || errors.length ? 1 : 0);
