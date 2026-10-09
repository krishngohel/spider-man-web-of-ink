// The combo moves with real inputs: a counter after a dodge, a web pull on a webbed thug out of
// reach, a sweep after a pause in the string, a back kick while steering away from a thug, the
// web blast, and a street prop thrown with the yank key.
// Usage: node scripts/combo-check.mjs [url]
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
await p.mouse.click(640, 360);
await sleep(300);
const results = [];
const state = () => p.evaluate(() => window.__game.combatState());
const hero = () => p.evaluate(() => window.__game.hero());
// Watches the hero's move for up to `ms`, returning every move key seen.
async function watch(ms) {
  const seen = new Set(), t0 = Date.now();
  while (Date.now() - t0 < ms) { const s = await state(); if (s.move) seen.add(s.move); await sleep(25); }
  return seen;
}
async function fresh(spots, opts = {}) {
  await p.evaluate(([sp, o]) => {
    const g = window.__game;
    g.setSetting('crimes', false);
    g.combat().clear?.();
    g.teleport(0, 0.9, -200, 0, 0, 0, 'ground', 0);
    for (const [x, z] of sp) g.spawnGang(x, z, { mix: [o.arch ?? 'brawler'], alert: true });
  }, [spots, opts]);
  await sleep(700);
}
const look = (x, z) => p.evaluate(([xx, zz]) => { const h = window.__game.hero(); window.__game.setLook(Math.atan2(xx - h.p.x, zz - h.p.z), 0.1); }, [x, z]);
const click = async (button = 'left') => { await p.mouse.down({ button }); await sleep(35); await p.mouse.up({ button }); };

// 1. Counter: wait for the windup, dodge, attack.
{
  await fresh([[0, -197.8]]);
  let ok = false;
  for (let tries = 0; tries < 4 && !ok; tries++) {
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) { const s = await state(); const e = s.enemies[0]; if (e && e.state === 'windup' && e.at - e.t < 0.35) break; await sleep(20); }
    await p.keyboard.press('KeyC');
    await sleep(260);
    await click();
    ok = (await watch(900)).has('counter');
  }
  results.push(['counter after a dodge', ok]);
}
// 2. Web pull: web a thug 7 m off, then attack.
{
  await fresh([[0, -193]]);
  const s = await state(); await look(s.enemies[0].x, s.enemies[0].z);
  await sleep(150);
  await click('right');
  await sleep(250);
  await click();
  const pulled = (await watch(900)).has('pull');
  const after = (await state()).enemies[0];
  // It must land: he is launched (air) or at least hurt, not a whiff at range.
  results.push(['web pull on a webbed thug out of reach (and it lands)', pulled && (after.state === 'air' || after.state === 'down' || after.hp < s.enemies[0].hp)]);
}
// 3. Sweep: two hits, a pause, a hit.
{
  await fresh([[0, -198.4]]);
  const s = await state(); await look(s.enemies[0].x, s.enemies[0].z);
  await click(); await sleep(200); await click();
  // Wait for the string to end, then the pause.
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) { const st = await state(); if (!st.move) break; await sleep(20); }
  await sleep(450);
  await click();
  results.push(['sweep after a pause in the string', (await watch(900)).has('sweep')]);
}
// 4. Back kick: steer away from a thug just behind and attack.
{
  await fresh([[0, -201.6]]);
  { const h = await hero(), e = (await state()).enemies[0]; await look(2 * h.p.x - e.x, 2 * h.p.z - e.z); }
  // Steer away from him and attack while steering.
  await p.keyboard.down('KeyW'); await sleep(60);
  await click();
  await sleep(120); await p.keyboard.up('KeyW');
  const seen4 = await watch(900); const h4 = await hero(); const e4 = (await state()).enemies[0];
  if (!seen4.has('backKick')) console.log('  back kick saw', [...seen4].join(','), 'd', e4 && Math.hypot(e4.x - h4.p.x, e4.z - h4.p.z).toFixed(2), 'facing', h4.facing.x.toFixed(2), h4.facing.z.toFixed(2));
  results.push(['back kick at a thug behind', seen4.has('backKick')]);
}
// 5. Web blast: build a combo of 10 on a brute (he soaks hits), then both buttons.
{
  await fresh([[0, -198.2]], { arch: 'brute' });
  const s = await state(); await look(s.enemies[0].x, s.enemies[0].z);
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) { const st = await state(); if (st.combo >= 10) break; await click(); await sleep(150); }
  await p.evaluate(() => window.__game.events?.()?.length);
  await p.mouse.down({ button: 'left' }); await p.mouse.down({ button: 'right' }); await sleep(40); await p.mouse.up({ button: 'left' }); await p.mouse.up({ button: 'right' });
  await sleep(200);
  const st = await state();
  results.push(['web blast on a combo of 10', st.combo < 3]);
}
// 6. Street throw: a gang brings loose bins and crates; aimed at one, the yank key throws it at the
// target (aimed at the thug, it yanks the thug instead: the next check).
{
  await fresh([[0, -197]]);
  const before = await p.evaluate(() => window.__game.combat().props.list.length);
  const crate = await p.evaluate(() => { const h = window.__game.hero().p; const l = window.__game.combat().props.list.filter((q) => q.state === 'rest'); l.sort((a, b) => Math.hypot(a.p.x - h.x, a.p.z - h.z) - Math.hypot(b.p.x - h.x, b.p.z - h.z)); return l[0] ? { x: l[0].p.x, z: l[0].p.z } : null; });
  if (crate) await look(crate.x, crate.z);
  await sleep(150);
  await p.keyboard.press('KeyE');
  await sleep(120);
  const flying = await p.evaluate(() => window.__game.combat().props.list.some((q) => q.state === 'flying'));
  await sleep(1000);
  const after = await p.evaluate(() => window.__game.combat().props.list.length);
  results.push([`street throw (${before} props round the gang)`, before > 0 && (flying || after < before)]);
}
// 6b. Aimed at the thug with crates around: the yank pulls the thug, no crate flies, the hero stays.
{
  await fresh([[0, -192]]);
  const s = await state(), e0 = s.enemies[0], h0 = (await hero()).p;
  await look(e0.x, e0.z);
  await sleep(150);
  await p.keyboard.press('KeyE');
  await sleep(150);
  const flying = await p.evaluate(() => window.__game.combat().props.list.some((q) => q.state === 'flying'));
  await sleep(500);
  const e1 = (await state()).enemies.find((q) => q.id === e0.id) ?? e0, h1 = (await hero()).p;
  const pulled = Math.hypot(e1.x - h1.x, e1.z - h1.z) < Math.hypot(e0.x - h0.x, e0.z - h0.z) - 1;
  results.push(['yank aimed at a thug pulls him, the hero stays', pulled && !flying && Math.hypot(h1.x - h0.x, h1.y - h0.y, h1.z - h0.z) < 2]);
}
// 7. Shield vault: jump at a shield thug and land behind him.
{
  await fresh([[0, -197.6]], { arch: 'shield' });
  const s0 = await state(), e0 = s0.enemies[0], h0 = await hero();
  await look(e0.x, e0.z);
  // Wait for him to come within vaulting range (about 3 m).
  for (let t = 0; t < 60; t++) { const s = await state(), h = await hero(), e = s.enemies[0]; if (Math.hypot(e.x - h.p.x, e.z - h.p.z) < 3) break; await sleep(50); }
  const side0 = Math.sign(((await state()).enemies[0].z - (await hero()).p.z));
  // Steer at him and jump.
  await p.keyboard.down('KeyW'); await sleep(60); await p.keyboard.press('Space'); await sleep(80); await p.keyboard.up('KeyW');
  await sleep(900);
  const h1 = await hero(), e1 = (await state()).enemies[0];
  const dbg = await p.evaluate(() => { const c = window.__game.combat().heroCombat.c; return { used: c.used.vault ?? 0, tgt: c.target?.arch ?? null }; });
  if (Math.sign(e1.z - h1.p.z) === side0) console.log('  vault debug', JSON.stringify(dbg), 'd0', Math.hypot(e0.x - h0.p.x, e0.z - h0.p.z).toFixed(2), 'hero state', h1.state);
  results.push(['vault over a shield thug', Math.sign(e1.z - h1.p.z) !== side0]);
}
// 8. Finishers: three in a row on the ground take turns (kick, web fling, flip), each one ends its thug.
{
  const seen = new Set(); let ended = 0;
  for (let i = 0; i < 3; i++) {
    await fresh([[0, -198.2]]);
    await p.evaluate(() => { window.__game.combat().heroCombat.c.focus = 3; });
    const s = await state(); await look(s.enemies[0].x, s.enemies[0].z);
    await sleep(100);
    await p.keyboard.down('KeyX'); await sleep(90); await p.keyboard.up('KeyX');
    for (const k of await watch(1400)) seen.add(k);
    await sleep(400);
    const e = (await state()).enemies[0];
    if (!e || ['out', 'webbed', 'pinned', 'air', 'down'].includes(e.state) || e.hp <= 0) ended++;
    else console.log('  finisher left him', e.state, e.hp);
  }
  results.push([`ground finishers vary (${[...seen].filter((k) => /^fin/.test(k)).join(', ')}) and each ends the thug`, ['finisher', 'finWeb', 'finUpper'].every((k) => seen.has(k)) && ended === 3]);
}
await b.close();
let fail = 0;
for (const [name, ok] of results) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) fail++; }
console.log(errors.length ? errors.slice(0, 5).join('\n') : 'no console errors');
console.log(fail || errors.length ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail || errors.length ? 1 : 0);
