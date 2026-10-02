// Boss pilots (spec 19.6): a scripted player beats each boss at Amazing without god mode, with real
// keys and mouse (aim with the camera, click to punch, C to dodge, E to yank, right click to web,
// Shift and Space to swing). Each boss is entered with ?at=<step> semantics (storyAt), and must be
// beaten with no retry. Usage: node scripts/boss-check.mjs [url] [boss ids comma separated]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5310/';
const only = process.argv[3]?.split(',') ?? null;
const b = await chromium.launch({ args: launchArgs(), headless: true });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url + '?at=swing');
await page.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await page.mouse.click(640, 360);
await sleep(300);

const ev = (f, a) => page.evaluate(f, a);
const H = () => ev(() => window.__game.hero());
const S = () => ev(() => window.__game.story());
const C = () => ev(() => window.__game.combatState());
const keys = new Set();
async function key(k, on) { if (on && !keys.has(k)) { keys.add(k); await page.keyboard.down(k); } if (!on && keys.has(k)) { keys.delete(k); await page.keyboard.up(k); } }
async function releaseAll() { for (const k of [...keys]) await key(k, false); }
const yawTo = (h, q) => Math.atan2(q.x - h.p.x, q.z - h.p.z);
async function click(button = 'left') { await page.mouse.down({ button }); await sleep(35); await page.mouse.up({ button }); }
const results = [];
function check(name, ok, detail) { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); }

let brawlHits = [], shotAt = 0;
// Melee: face the boss, close in, punch; dodge just before a blow lands; yank crates into him.
async function brawl(bossE, h, st, opts = {}) {
  // Stuck to a wall or a sign (walked into it): hop off, a crawler cannot dodge or punch.
  if (h.state === 'wall') { await key('KeyW', false); await page.keyboard.press('Space'); await sleep(200); return 'unstick'; }
  // Knocked off a roof: zip back up to him.
  if (bossE.y - h.p.y > 4 && Math.abs(bossE.vy) < 0.8 && h.state === 'ground') { await key('KeyW', false); await ev(([x, y, z]) => window.__game.aimAt(x, y + 0.5, z), [bossE.x, bossE.y, bossE.z]); await sleep(30); await page.keyboard.press('KeyQ'); await sleep(700); return 'zip'; }
  const d = Math.hypot(bossE.x - h.p.x, bossE.z - h.p.z);
  const left = bossE.at - bossE.t;
  const threat = bossE.state === 'windup' && (d < (bossE.ranged ? 40 : bossE.reach + 1.6)) && left < 0.3 && left > -0.05;
  if (threat) { await key('KeyW', false); await page.keyboard.press('KeyC'); await sleep(120); return 'dodge'; }
  // A loose crate near the line to the boss: yank it at him.
  if (opts.crates && bossE.state !== 'stun' && Math.random() < 0.35) {
    const props = await ev(() => window.__game.props());
    const near = props.filter((q) => Math.hypot(q.x - h.p.x, q.z - h.p.z) < 18);
    if (near.length) {
      await key('KeyW', false);
      await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [near[0].x, near[0].y, near[0].z]);
      await sleep(60);
      await page.keyboard.press('KeyE');
      await sleep(250);
      return 'crate';
    }
  }
  await ev(([y]) => window.__game.setLook(y, 0.15), [yawTo(h, bossE)]);
  // A careful player: walk in, two blows into his guard and wait; everything in an opening.
  const open = bossE.state === 'stun' || bossE.state === 'recover';
  const now = Date.now();
  brawlHits = brawlHits.filter((t) => now - t < 1400);
  if (d > 2.4) await key('KeyW', true); else await key('KeyW', false);
  if (d < 3 && h.state === 'ground' && bossE.state !== 'windup' && (open || brawlHits.length < 2)) { brawlHits.push(now); await click(); return 'hit'; }
  // A stunned boss across the street: web strike in (a zip kick) rather than walk the opening away.
  if (bossE.state === 'stun' && d >= 3 && d < 13 && h.state === 'ground') { await click(); await sleep(200); return 'strike'; }
  return 'move';
}

// Swinging toward a point with real keys (the skilled-player web pick, let go on the rise).
const swing = { holding: false, sinceRel: 999, last: Date.now() };
async function swingToward(h, q) {
  const now = Date.now(); swing.sinceRel += now - swing.last; swing.last = now;
  const dx = q.x - h.p.x, dz = q.z - h.p.z, l = Math.hypot(dx, dz) || 1;
  await ev(([y]) => window.__game.setLook(y, -0.05), [Math.atan2(dx, dz)]);
  await key('KeyW', true);
  if (h.state === 'ground') { await key('ShiftLeft', false); swing.holding = false; await page.keyboard.press('Space'); await sleep(140); }
  if (h.state === 'wall') { await key('ShiftLeft', false); swing.holding = false; await page.keyboard.press('Space'); return; }
  if (swing.holding && h.state === 'swing' && h.swing.angle > 22 && h.v.y > 0) { await key('ShiftLeft', false); swing.holding = false; swing.sinceRel = 0; }
  else if (!swing.holding && (h.state === 'air') && swing.sinceRel > 160 && (h.v.y < 3 || h.p.y < 25)) {
    const t = await ev(([x, z]) => window.__game.suggest(x, z), [dx / l, dz / l]);
    if (t) { await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [t.x, t.y, t.z]); await key('ShiftLeft', true); swing.holding = true; }
  }
}

async function run(stepId, label, pilot, limit = 150000) {
  if (only && !only.some((o) => stepId.includes(o))) return;
  await releaseAll();
  await ev((id) => window.__game.storyAt(id), stepId);
  await page.mouse.click(640, 360);
  await sleep(500);
  if ((await S()).step !== stepId) { console.log(`SKIP  ${label}  (no step ${stepId} in this build)`); return; }
  const t0 = Date.now();
  let minHp = 100, out = 'timeout';
  while (Date.now() - t0 < limit) {
    const st = await S();
    if (st.step !== stepId) { out = 'won'; break; }
    if (st.retries > 0) { out = 'retry'; break; }
    const c = await C();
    minHp = Math.min(minHp, c.hp);
    const h = await H();
    const bossE = c.enemies.find((e) => e.boss);
    if (process.env.DEBUG && Date.now() - (run.lastLog ?? 0) > Number(process.env.DEBUG)) { run.lastLog = Date.now(); console.log(JSON.stringify({ t: ((Date.now() - t0) / 1000).toFixed(1), hp: Math.round(c.hp), hero: [h.p.x.toFixed(1), h.p.y.toFixed(1), h.p.z.toFixed(1), h.state], boss: bossE && [bossE.x.toFixed(1), bossE.y.toFixed(1), bossE.z.toFixed(1), bossE.state, Math.round(bossE.hp)], st: st.boss, cs: c.state, phase: st.phase, wave: st.wave, foes: c.enemies.filter((e) => !['out', 'webbed', 'pinned'].includes(e.state)).length, all: c.enemies.length })); }
    await pilot({ st, c, h, bossE });
    await sleep(25);
  }
  await releaseAll();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  check(`${label}`, out === 'won', `${out} in ${secs} s, lowest health ${Math.round(minHp)}`);
}

// Kingpin: brawl; crates in phase 2; on the ladder, yank him down.
await run('prologue.kingpin', 'pilot beats the Kingpin on Fisk Tower', async ({ st, h, bossE }) => {
  if (!bossE) return;
  const k = st.boss ?? {};
  if (k.climbing) {
    await key('KeyW', Math.hypot(bossE.x - h.p.x, bossE.z - h.p.z) > 6);
    await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [bossE.x, bossE.y, bossE.z]);
    await page.keyboard.press('KeyE');
    await sleep(280);
    return;
  }
  await brawl(bossE, h, st, { crates: k.phase >= 2 });
});

// Shocker: close the gap between blasts, crates from phase 2.
await run('act1.shocker', 'pilot beats the Shocker on Exchange Street', async ({ st, h, bossE }) => {
  if (!bossE) return;
  await brawl(bossE, h, st, { crates: (st.boss?.phase ?? 1) >= 2 });
});

// Vulture chase: swing after him, web him when in range.
if (!process.env.SKIP_CHASE) await run('act1.vultureChase', 'pilot catches the Vulture in a swing chase', async ({ h, bossE }) => {
  if (!bossE) return;
  const d = Math.hypot(bossE.x - h.p.x, bossE.y - h.p.y, bossE.z - h.p.z);
  if (d < 45 && h.state !== 'swing' && Date.now() - (shotAt ?? 0) > 400) {
    // Lead him: aim where he will be when the web gets there (75 m/s).
    shotAt = Date.now();
    const k = d / 75;
    await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [bossE.x + bossE.vx * k, bossE.y + bossE.vy * k, bossE.z + bossE.vz * k]);
    await click('right');
    await sleep(60);
  }
  await swingToward(h, { x: bossE.x + bossE.vx * 1.5, z: bossE.z + bossE.vz * 1.5 });
}, 180000);

// Vulture on the Bugle roof: yank him out of his dives, then beat him on the ground.
await run('act1.vulture', 'pilot beats the Vulture on the Bugle roof', async ({ st, h, bossE }) => {
  if (!bossE) return;
  const m = st.boss?.mode;
  const d = Math.hypot(bossE.x - h.p.x, bossE.y - h.p.y, bossE.z - h.p.z);
  // Fell off the roof: zip back up to it.
  if (st.site && h.p.y < st.site.y - 5 && h.state === 'ground') { await key('KeyW', false); await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [st.site.x, st.site.y - 1.5, st.site.z]); await sleep(30); await page.keyboard.press('KeyQ'); await sleep(900); return; }
  if ((m === 'dive' || m === 'diveWind') && d < 13) {
    await key('KeyW', false);
    await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [bossE.x, bossE.y, bossE.z]);
    await page.keyboard.press('KeyE');
    await sleep(150);
    return;
  }
  if (m === 'grounded' || m === 'falling') { await brawl(bossE, h, st); return; }
  // Circling: stand in the middle of the roof and wait; dodge the darts.
  await key('KeyW', false);
  if (bossE.state === 'windup' && bossE.at - bossE.t < 0.3) { await page.keyboard.press('KeyC'); await sleep(150); }
}, 180000);

// Rhino: back up to a wall, sidestep the charge so he hits it, punch while he is dazed; run to the
// rail yard in phase 2.
let spot = null;
await run('act1.rhino', 'pilot beats the Rhino (street, run to the yard, yard)', async ({ st, h, bossE }) => {
  if (!bossE) return;
  const r = st.boss ?? {};
  if (r.phase === 2) { spot = null; await swingToward(h, { x: -1380, z: 0 }); return; }
  if (keys.has('ShiftLeft') && h.state !== 'swing') { await key('ShiftLeft', false); }
  // Stuck to the wall (walked into it): hop off, a crawler cannot dodge.
  if (h.state === 'wall') { await key('KeyW', false); await page.keyboard.press('Space'); await sleep(250); return; }
  const d = Math.hypot(bossE.x - h.p.x, bossE.z - h.p.z);
  if (bossE.state === 'stun') { spot = null; await brawl(bossE, h, st); return; }
  if (r.charging && d < 9) {
    // Sidestep across the charge line.
    const yaw = yawTo(h, bossE);
    await ev(([y]) => window.__game.setLook(y, 0.1), [yaw]);
    await key('KeyW', false);
    await key('KeyD', true); await page.keyboard.press('KeyC'); await sleep(200); await key('KeyD', false);
    spot = null;
    return;
  }
  if (!spot) spot = await ev(([x, z]) => window.__game.wallSpot(x, z, 30, 3.2), [h.p.x, h.p.z]);
  if (spot && Math.hypot(spot.x - h.p.x, spot.z - h.p.z) > 1.4 && d > 7) {
    await ev(([y]) => window.__game.setLook(y, 0.1), [Math.atan2(spot.x - h.p.x, spot.z - h.p.z)]);
    await key('KeyW', true);
    return;
  }
  await key('KeyW', false);
  await ev(([y]) => window.__game.setLook(y, 0.1), [yawTo(h, bossE)]);
  if (bossE.state === 'windup' && !r.charging && d < 4.5 && bossE.at - bossE.t < 0.3) { await page.keyboard.press('KeyC'); await sleep(150); }
}, 300000);

// Act 2 ---------------------------------------------------------------------------------------------

// A crowd fight (the gate, Miles at the shelter): the nearest one standing, punch, dodge the tells.
async function crowd({ c, h }) {
  const live = c.enemies.filter((e) => !e.boss && !['out', 'webbed', 'pinned'].includes(e.state));
  if (!live.length) { await key('KeyW', false); return; }
  const near = live.reduce((x, e) => (Math.hypot(e.x - h.p.x, e.z - h.p.z) < Math.hypot(x.x - h.p.x, x.z - h.p.z) ? e : x));
  const threat = live.some((e) => e.state === 'windup' && Math.hypot(e.x - h.p.x, e.z - h.p.z) < (e.ranged ? 30 : 3.6) && e.at - e.t < 0.3);
  if (threat) { await key('KeyW', false); await page.keyboard.press('KeyC'); await sleep(120); return; }
  await ev(([y]) => window.__game.setLook(y, 0.12), [yawTo(h, near)]);
  const d = Math.hypot(near.x - h.p.x, near.z - h.p.z);
  await key('KeyW', d > 2.4);
  // Miles: the venom blast when three or more are close.
  const close = live.filter((e) => Math.hypot(e.x - h.p.x, e.z - h.p.z) < 5).length;
  if (close >= 3 && Math.random() < 0.3) { await click('right'); await sleep(80); return; }
  if (d < 13) await click();
}
await run('act2.gate', 'pilot clears the Oscorp gate', crowd);
await run('act2.milesDefend', 'pilot (Miles) defends the shelter generator', crowd, 240000);

// Electro: short a relay while he is charged, beat him while he is drained.
await run('act2.electro', 'pilot beats Electro on the power station', async ({ st, h, bossE }) => {
  if (!bossE) return;
  const s = st.boss ?? {};
  if (s.charged && s.relays?.length) {
    const r = s.relays.reduce((x, q) => (Math.hypot(q.x - h.p.x, q.z - h.p.z) < Math.hypot(x.x - h.p.x, x.z - h.p.z) ? q : x));
    const d = Math.hypot(r.x - h.p.x, r.z - h.p.z);
    if (d > 20) { await ev(([y]) => window.__game.setLook(y, 0.1), [Math.atan2(r.x - h.p.x, r.z - h.p.z)]); await key('KeyW', true); }
    else { await key('KeyW', false); await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [r.x, r.y, r.z]); await sleep(40); await page.keyboard.press('KeyE'); await sleep(200); }
    // Keep moving under the bolts.
    if (s.perched) { await key('KeyD', Math.random() < 0.5); }
    const left = bossE.at - bossE.t;
    if (bossE.state === 'windup' && left < 0.3 && left > -0.05) { await page.keyboard.press('KeyC'); await sleep(120); }
    return;
  }
  await key('KeyD', false);
  await brawl(bossE, h, st);
}, 240000);

// Scorpion: catch him on the bridge, then fight against the poison clock.
await run('act2.scorpionChase', 'pilot catches the Scorpion on the bridge', async ({ h, bossE }) => {
  if (!bossE) return;
  const d = Math.hypot(bossE.x - h.p.x, bossE.y - h.p.y, bossE.z - h.p.z);
  if (d < 28 && Date.now() - shotAt > 350) {
    shotAt = Date.now();
    const k = d / 75;
    await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [bossE.x + bossE.vx * k, bossE.y + bossE.vy * k, bossE.z + bossE.vz * k]);
    await click('right');
    await sleep(50);
  }
  await ev(([y]) => window.__game.setLook(y, 0.05), [yawTo(h, bossE)]);
  await key('KeyW', true);
  await key('ShiftLeft', true); // parkour run along the deck
}, 180000);
await run('act2.scorpion', 'pilot beats the Scorpion before the poison', async ({ st, h, bossE }) => {
  if (!bossE) return;
  await brawl(bossE, h, st);
}, 200000);

// Mysterio: scan for the real one, beat him; then the drones; then him again.
await run('act2.mysterio', 'pilot beats Mysterio in Neon Square', async ({ st, h, bossE }) => {
  const s = st.boss ?? {};
  if (s.phase === 2 && s.drones?.length) {
    const dr = s.drones.reduce((x, q) => (Math.hypot(q.x - h.p.x, q.z - h.p.z) < Math.hypot(x.x - h.p.x, x.z - h.p.z) ? q : x));
    const d = Math.hypot(dr.x - h.p.x, dr.z - h.p.z);
    if (d > 7) { await ev(([y]) => window.__game.setLook(y, 0.1), [Math.atan2(dr.x - h.p.x, dr.z - h.p.z)]); await key('KeyW', true); }
    else { await key('KeyW', false); await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [dr.x, dr.y, dr.z]); await sleep(40); await page.keyboard.press('KeyE'); await sleep(250); }
    return;
  }
  if (s.phase === 1 && !s.marked) { await page.keyboard.press('KeyV'); await sleep(60); }
  const real = s.real ? { ...bossE, x: s.real.x, y: s.real.y, z: s.real.z, state: s.state } : bossE;
  if (!real) return;
  await brawl(real, h, st);
}, 240000);

// The Lizard: run him down across the park, then the zoo; webs while he slumps at the end.
await run('act2.lizardChase', 'pilot catches the Lizard in the park', async ({ h, bossE }) => {
  if (!bossE) return;
  const d = Math.hypot(bossE.x - h.p.x, bossE.y - h.p.y, bossE.z - h.p.z);
  if (d < 28 && Date.now() - shotAt > 350) {
    shotAt = Date.now();
    const k = d / 75;
    await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [bossE.x + bossE.vx * k, bossE.y + bossE.vy * k, bossE.z + bossE.vz * k]);
    await click('right');
    await sleep(50);
  }
  await ev(([y]) => window.__game.setLook(y, 0.05), [yawTo(h, { x: bossE.x + bossE.vx, z: bossE.z + bossE.vz })]);
  await key('KeyW', true);
  await key('ShiftLeft', true);
  if (d > 25 && h.state === 'ground' && Math.random() < 0.1) await page.keyboard.press('KeyQ');
}, 180000);
await run('act2.lizard', 'pilot beats the Lizard and cures Connors', async ({ st, h, bossE }) => {
  if (!bossE) return;
  const s = st.boss ?? {};
  if (s.phase === 3 && bossE.state === 'stun') {
    await key('KeyW', false);
    await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [bossE.x, bossE.y, bossE.z]);
    await click('right');
    await sleep(160);
    return;
  }
  // Minions first if they crowd in.
  if (s.minions > 0 && Math.random() < 0.5) { await crowd({ c: await C(), h }); return; }
  await brawl(bossE, h, st);
}, 240000);


// Act 3 ---------------------------------------------------------------------------------------------

// Stealth: creep up behind the nearest unaware guard (out of his cone) and take him down; if the
// alarm goes, fight it out.
async function sneak({ st, c, h }) {
  const guards = (st.guards ?? []).filter((g) => !['out', 'webbed', 'pinned'].includes(g.state));
  if (st.alarm || guards.some((g) => g.alerted)) { await crowd({ c, h }); return; }
  if (!guards.length) return;
  const g = guards.reduce((x, q) => (Math.hypot(q.x - h.p.x, q.z - h.p.z) < Math.hypot(x.x - h.p.x, x.z - h.p.z) ? q : x));
  const fx = Math.sin(g.facing), fz = Math.cos(g.facing);
  const behind = { x: g.x - fx * 1.4, z: g.z - fz * 1.4 };
  const d = Math.hypot(behind.x - h.p.x, behind.z - h.p.z);
  if (d < 1.2 || Math.hypot(g.x - h.p.x, g.z - h.p.z) < 2) { await key('KeyW', false); await click(); await sleep(150); return; }
  // Come round behind him: aim at a point beside and behind, wide of his view.
  const side = { x: g.x - fx * 4 + fz * 3, z: g.z - fz * 4 - fx * 3 };
  const goal = Math.hypot(side.x - h.p.x, side.z - h.p.z) > 3 && Math.hypot(g.x - h.p.x, g.z - h.p.z) > 5 ? side : behind;
  await ev(([y]) => window.__game.setLook(y, 0.1), [Math.atan2(goal.x - h.p.x, goal.z - h.p.z)]);
  await key('KeyW', true);
}
await run('act3.hunters', 'pilot clears Kraven\'s hunters (stealth)', sneak, 240000);
await run('act3.milesStealth', 'pilot (Miles) clears the hunters\' yard (stealth)', sneak, 240000);

// Kraven: spot him, yank him out of the tree, beat him while he is down; then the duel.
await run('act3.kraven', 'pilot beats Kraven in the park', async ({ st, h, bossE }) => {
  if (!bossE) return;
  const s = st.boss ?? {};
  if (s.phase === 1 && bossE.state !== 'stun') {
    const d = Math.hypot(bossE.x - h.p.x, bossE.z - h.p.z);
    if (!s.marked) { await page.keyboard.press('KeyV'); await sleep(60); }
    if (d > 16) { await ev(([y]) => window.__game.setLook(y, 0.1), [yawTo(h, bossE)]); await key('KeyW', true); return; }
    await key('KeyW', false);
    if (s.marked && s.perched) { await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [bossE.x, bossE.y, bossE.z]); await sleep(40); await page.keyboard.press('KeyE'); await sleep(250); }
    else if (bossE.state === 'windup' && bossE.at - bossE.t < 0.35) { await page.keyboard.press('KeyC'); await sleep(150); }
    return;
  }
  await brawl(bossE, h, st);
}, 240000);

// Sandman: stand by a hydrant, burst it when he comes close, beat him while he is mud; tip a tank
// onto the giant.
await run('act3.sandman', 'pilot beats Sandman at the shipyard', async ({ st, h, bossE }) => {
  if (!bossE) return;
  const s = st.boss ?? {};
  const near = (list, q) => (list ?? []).reduce((x, y) => (!x || Math.hypot(y.x - q.x, y.z - q.z) < Math.hypot(x.x - q.x, x.z - q.z) ? y : x), null);
  if (s.giant) {
    const tk = near(s.tanks, bossE);
    if (tk) {
      const dh = Math.hypot(tk.x - h.p.x, tk.z - h.p.z);
      if (dh > 22) { await ev(([y]) => window.__game.setLook(y, 0.1), [Math.atan2(tk.x - h.p.x, tk.z - h.p.z)]); await key('KeyW', true); return; }
      await key('KeyW', false);
      if (Math.hypot(tk.x - bossE.x, tk.z - bossE.z) < 28) { await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [tk.x, tk.y, tk.z]); await sleep(40); await page.keyboard.press('KeyE'); await sleep(300); }
      else if (bossE.state === 'windup' && bossE.at - bossE.t < 0.35) { await page.keyboard.press('KeyC'); await sleep(150); }
      return;
    }
  }
  if (!s.soaked && bossE.state !== 'stun') {
    const hy = near(s.hydrants, bossE);
    if (hy) {
      const dHero = Math.hypot(hy.x - h.p.x, hy.z - h.p.z), dBoss = Math.hypot(hy.x - bossE.x, hy.z - bossE.z);
      if (dHero > 4) { await ev(([y]) => window.__game.setLook(y, 0.1), [Math.atan2(hy.x - h.p.x, hy.z - h.p.z)]); await key('KeyW', true); return; }
      await key('KeyW', false);
      if (dBoss < 4) { await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [hy.x, hy.y, hy.z]); await sleep(40); await page.keyboard.press('KeyE'); await sleep(250); return; }
      if (bossE.state === 'windup' && bossE.at - bossE.t < 0.35) { await page.keyboard.press('KeyC'); await sleep(150); }
      return;
    }
  }
  await brawl(bossE, h, st);
}, 300000);

// Venom: the rooftop chase, then the bell tower.
await run('act3.venomChase', 'pilot chases Venom across the roofs', async ({ h, bossE }) => {
  if (!bossE) return;
  const d = Math.hypot(bossE.x - h.p.x, bossE.y - h.p.y, bossE.z - h.p.z);
  if (d < 30 && Date.now() - shotAt > 350) {
    shotAt = Date.now();
    const k = d / 75;
    await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [bossE.x + bossE.vx * k, bossE.y + bossE.vy * k, bossE.z + bossE.vz * k]);
    await click('right');
    await sleep(50);
  }
  await swingToward(h, bossE);
}, 200000);
await run('act3.venom', 'pilot beats Venom at the bell tower', async ({ st, h, bossE }) => {
  if (!bossE) return;
  const s = st.boss ?? {};
  if (s.bellReady && s.bell && bossE.state !== 'stun' && Math.hypot(bossE.x - s.bell.x, bossE.z - s.bell.z) < 30 && Math.hypot(s.bell.x - h.p.x, s.bell.z - h.p.z) < 24) {
    await key('KeyW', false);
    await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [s.bell.x, s.bell.y, s.bell.z]);
    await sleep(40); await page.keyboard.press('KeyE'); await sleep(250);
    return;
  }
  await brawl(bossE, h, st);
}, 240000);
await run('act3.blackSuit', 'pilot clears the crew in the Black Suit', crowd);


// Act 4 ---------------------------------------------------------------------------------------------
const nearestBoss = (c, h) => {
  const live = c.enemies.filter((e) => e.boss && !['out', 'away'].includes(e.state));
  return live.length ? live.reduce((x, e) => (Math.hypot(e.x - h.p.x, e.z - h.p.z) < Math.hypot(x.x - h.p.x, x.z - h.p.z) ? e : x)) : null;
};
await run('act4.electroVulture', 'pilot beats Electro and the Vulture together', async ({ st, c, h }) => {
  const s = st.boss ?? {}, el = s.electro ?? {}, vu = s.vulture ?? {};
  const vEnt = c.enemies.find((e) => e.boss && e.y > h.p.y + 3 && (vu.mode === 'dive' || vu.mode === 'diveWind'));
  if (vEnt && Math.hypot(vEnt.x - h.p.x, vEnt.y - h.p.y, vEnt.z - h.p.z) < 13) { await key('KeyW', false); await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [vEnt.x, vEnt.y, vEnt.z]); await page.keyboard.press('KeyE'); await sleep(150); return; }
  if (el.charged && el.state !== 'out' && el.relays?.length) {
    const r = el.relays.reduce((x, q) => (Math.hypot(q.x - h.p.x, q.z - h.p.z) < Math.hypot(x.x - h.p.x, x.z - h.p.z) ? q : x));
    if (Math.hypot(r.x - h.p.x, r.z - h.p.z) > 20) { await ev(([y]) => window.__game.setLook(y, 0.1), [Math.atan2(r.x - h.p.x, r.z - h.p.z)]); await key('KeyW', true); return; }
    await key('KeyW', false); await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [r.x, r.y, r.z]); await sleep(40); await page.keyboard.press('KeyE'); await sleep(200); return;
  }
  const b = nearestBoss(c, h);
  if (b) await brawl(b, h, st); else await key('KeyW', false);
}, 300000);
await run('act4.rhinoScorpion', 'pilot beats Rhino and Scorpion together', async ({ st, c, h }) => {
  const b = nearestBoss(c, h);
  if (b) await brawl(b, h, st); else await key('KeyW', false);
}, 300000);
await run('act4.mysterio', 'pilot beats Mysterio again (rematch)', async ({ st, h, bossE }) => {
  const s = st.boss ?? {};
  if (s.phase === 1 && !s.marked) { await page.keyboard.press('KeyV'); await sleep(60); }
  const real = s.real ? { ...bossE, x: s.real.x, y: s.real.y, z: s.real.z, state: s.state } : bossE;
  if (real) await brawl(real, h, st);
}, 200000);
await run('act4.milesStealth', 'pilot (Miles) clears the Sable checkpoint', sneak, 240000);
await run('act4.milesDefend', 'pilot (Miles) holds the shelter against Sable', crowd, 240000);
await run('act4.ock', 'pilot beats Doctor Octopus up Oscorp Tower', async ({ st, h, bossE }) => {
  if (!bossE) return;
  const s = st.boss ?? {};
  if (s.phase === 2 && s.top) {
    // Up the tower: zip at the platform edge, run up walls.
    const tgt = h.p.y < s.top.y - 30 ? { x: s.ock.x, y: Math.min(s.top.y, h.p.y + 50), z: s.ock.z + 2 } : { x: s.top.x, y: s.top.y + 1, z: s.top.z + 3 };
    await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [tgt.x, tgt.y, tgt.z]);
    await key('KeyW', true);
    if (Date.now() - shotAt > 900) { shotAt = Date.now(); await page.keyboard.press('KeyQ'); }
    return;
  }
  if (s.planted && bossE.state !== 'stun' && Math.hypot(bossE.x - h.p.x, bossE.z - h.p.z) < 12) { await key('KeyW', false); await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [bossE.x, bossE.y, bossE.z]); await page.keyboard.press('KeyE'); await sleep(200); return; }
  await brawl(bossE, h, st);
}, 360000);
await run('act4.goblinChase', 'pilot chases the Green Goblin', async ({ h, bossE }) => {
  if (!bossE) return;
  const d = Math.hypot(bossE.x - h.p.x, bossE.y - h.p.y, bossE.z - h.p.z);
  if (d < 32 && Date.now() - shotAt > 350) { shotAt = Date.now(); const k = d / 75; await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [bossE.x + bossE.vx * k, bossE.y + bossE.vy * k, bossE.z + bossE.vz * k]); await click('right'); await sleep(50); }
  await swingToward(h, { x: bossE.x + bossE.vx * 1.5, z: bossE.z + bossE.vz * 1.5 });
}, 240000);
await run('act4.goblin', 'pilot beats the Green Goblin on the bridge', async ({ st, h, bossE }) => {
  if (!bossE) return;
  const m = st.boss?.mode, d = Math.hypot(bossE.x - h.p.x, bossE.y - h.p.y, bossE.z - h.p.z);
  if (st.site && h.p.y < st.site.y - 5 && h.state === 'ground') { await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [st.site.x, st.site.y - 1.5, st.site.z]); await page.keyboard.press('KeyQ'); await sleep(900); return; }
  if ((m === 'ram' || m === 'ramWind') && d < 13) { await key('KeyW', false); await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [bossE.x, bossE.y, bossE.z]); await page.keyboard.press('KeyE'); await sleep(150); return; }
  if (m === 'down' || m === 'falling') { await brawl(bossE, h, st); return; }
  await key('KeyW', false);
  if (bossE.state === 'windup' && bossE.at - bossE.t < 0.3) { await page.keyboard.press('KeyC'); await sleep(150); }
}, 240000);
await run('act4.catchMJ', 'pilot catches MJ', async ({ st, h }) => {
  const mj = st.boss?.mj;
  if (!mj || st.boss.caught) return;
  const d = Math.hypot(mj.x - h.p.x, mj.y - h.p.y, mj.z - h.p.z);
  await ev(([x, y, z]) => window.__game.aimAt(x, y, z), [mj.x, mj.y - 1.5, mj.z]);
  if (d < 31) { await click('right'); await sleep(120); }
}, 60000);

await b.close();
console.log(errors.length ? errors.slice(0, 6).join('\n') : 'no console errors');
const failed = results.filter((x) => !x).length + (errors.length ? 1 : 0);
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
