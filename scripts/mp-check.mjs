// Multiplayer end to end (spec 14.5): five muted headless clients against the local relay
// (`npm run dev` in server/), joining one world by code. Checks: everyone sees everyone, a sixth is
// refused, movement shows up on the other screens, a race and a brawl start everywhere, the host
// leaving hands the world to someone else, and a client on a laggy link still sees smooth movement.
//   node scripts/mp-check.mjs [game url] [relay ws url]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5310/';
const relay = process.argv[3] ?? 'ws://localhost:8790';
const browser = await chromium.launch({ args: launchArgs(), headless: true });
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };
const errors = [];

async function client(name) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await page.goto(url + '?at=swing');
  await page.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.__game.setSetting('crimes', false));
  return { name, ctx, page, ev: (f, a) => page.evaluate(f, a) };
}

// Make sure no world is left over from a previous run.
const host = await client('A');
await host.ev(([r]) => window.__game.mp().create({ name: 'A', char: 'peter', relay: r }), [relay]);
await host.page.waitForFunction(() => window.__game.mp().active, null, { timeout: 15000 });
const code = await host.ev(() => window.__game.mp().me.code);
check('the host creates a world and gets a six-character code', /^[A-Z0-9]{6}$/.test(code), code);

const others = [];
for (const [n, ch] of [['B', 'miles'], ['C', 'vulture'], ['D', 'rhino'], ['E', 'gwen']]) {
  const c = await client(n);
  await c.ev(([cd, r, nm, chr]) => window.__game.mp().join({ code: cd, name: nm, char: chr, relay: r }), [code, relay, n, ch]);
  await c.page.waitForFunction(() => window.__game.mp().active, null, { timeout: 15000 });
  others.push(c);
}
await sleep(1500);
const counts = await Promise.all([host, ...others].map((c) => c.ev(() => window.__game.mp().players.size)));
check('five players all see the other four', counts.every((n) => n === 4), counts.join(','));

const sixth = await client('F');
await sixth.ev(([cd, r]) => window.__game.mp().join({ code: cd, name: 'F', char: 'peter', relay: r }), [code, relay]);
await sleep(1500);
const sixthStatus = await sixth.ev(() => window.__game.mp().status);
check('a sixth player is told the world is full', sixthStatus === 'World full.', sixthStatus);
await sixth.ctx.close();

// Movement: the host moves; B sees the host's body there (drawn 100 ms behind).
await host.ev(() => window.__game.teleport(120, 60, -200, 0, 0, 0, 'air', 0));
await sleep(700);
const seen = await others[0].ev(() => { const p = [...window.__game.mp().players.values()].find((q) => q.name === 'A'); return p ? p.puppet.body.p : null; });
check('the host\'s movement shows on another screen', seen && Math.hypot(seen.x - 120, seen.z + 200) < 8, seen ? `${seen.x.toFixed(1)}, ${seen.z.toFixed(1)}` : 'not seen');

// A race round starts for everyone.
await host.ev(() => window.__game.modes().start('race', {}));
await sleep(1200);
const raceKinds = await Promise.all(others.map((c) => c.ev(() => window.__game.modes().state?.kind ?? null)));
check('a race starts on every screen', raceKinds.every((k) => k === 'race'), raceKinds.join(','));
await host.ev(() => window.__game.modes().stop());

// A brawl: friendly fire puts the other players in each client's target list.
await host.ev(() => window.__game.modes().start('brawl', {}));
await sleep(6500); // the countdown
const targets = await others[1].ev(() => window.__game.combat().enemies.list.filter((e) => e.isPlayer).length);
check('in a brawl the other players are targets', targets === 4, `${targets} targets`);
await host.ev(() => window.__game.modes().stop());

// Lag on C: 150 ms each way. C should still see B moving, not frozen.
const cdp = await others[1].ctx.newCDPSession(others[1].page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: -1, uploadThroughput: -1 });
const track = [];
for (let i = 0; i < 6; i++) {
  await others[0].ev(([k]) => window.__game.teleport(-100 + k * 4, 50, -100, 40, 0, 0, 'air', 0), [i]);
  await sleep(250);
  track.push(await others[1].ev(() => { const p = [...window.__game.mp().players.values()].find((q) => q.name === 'B'); return p ? p.puppet.body.p.x : null; }));
}
const moved = track.filter((x) => x !== null);
check('a laggy client still sees others move', moved.length >= 5 && moved[moved.length - 1] > moved[0] + 6, moved.map((x) => x.toFixed(1)).join(' '));

// The host leaves: the longest-connected player (B) takes over.
await host.ctx.close();
await sleep(2500);
const hosts = await Promise.all(others.map((c) => c.ev(() => window.__game.mp().isHost)));
check('when the host leaves, B becomes the host', hosts[0] === true && hosts.slice(1).every((h) => !h), hosts.join(','));
const left = await others[1].ev(() => window.__game.mp().players.size);
check('the others still see each other after the host left', left >= 3, `${left}`);

// Clean up: the new host ends the world.
await others[0].ev(() => window.__game.mp().end());
await sleep(500);
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((x) => !x).length;
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
