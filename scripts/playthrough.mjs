// Title to credits (spec 19.3), on a frozen build: Story, a new game in slot 3, then every step in
// order. Comic pages are read with Space, radio and cards play out, travel steps are reached (the
// hero is moved to the marker; swinging is covered by swing-check), and fights, bosses, chases and
// stealth are skipped here because boss-check plays every one of them with real inputs.
// Checks: every step is visited in order, the save advances by step id, the credits roll, the
// roster and the Anti-Venom suit unlock, no page errors.
//   node scripts/playthrough.mjs [url]        (ENGINE=firefox runs it in Firefox, as webkit-check does)
import { chromium, firefox } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';
import { STEPS } from '../src/story/steps.js';

const url = process.argv[2] ?? 'http://localhost:5312/';
// Firefox has no mute flag: its volume scale is 0, and the game's master volume is 0 below.
const engine = process.env.ENGINE ?? 'chromium';
const b = engine === 'firefox'
  ? await firefox.launch({ headless: true, firefoxUserPrefs: { 'webgl.force-enabled': true, 'media.volume_scale': '0.0' } })
  : await chromium.launch({ args: launchArgs(), headless: true });
console.log(`engine ${engine}`);
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
if (engine === 'firefox') {
  await p.addInitScript(() => {
    try {
      const k = 'web-of-ink-settings-v1';
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.volume = { ...(s.volume || {}), master: 0 };
      localStorage.setItem(k, JSON.stringify(s));
    } catch { /* storage blocked */ }
  });
}
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p.goto(url + '?nocine=1'); // story cinematics off, as the comics are read through with Space
await p.evaluate(() => localStorage.removeItem('web-of-ink-save-3'));
await p.reload();
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
const ev = (f, a) => p.evaluate(f, a);
await p.locator('.title .mbtn', { hasText: 'STORY' }).click();
await p.locator('.slot').nth(2).locator('.mbtn', { hasText: 'NEW GAME' }).click();
const t0 = Date.now();
const seen = [];
let stuck = 0, last = null;
while (Date.now() - t0 < 30 * 60 * 1000) {
  const st = await ev(() => window.__game.story());
  if (!st.step) break;
  if (st.step !== last) { seen.push(st.step); last = st.step; stuck = 0; process.stdout.write(`${st.step} `); }
  else stuck++;
  if (stuck > 400) { console.log(`\nSTUCK at ${st.step} (${st.type}, ${st.phase})`); break; }
  switch (st.type) {
    case 'panels': case 'credits': await p.keyboard.press('Space'); await sleep(140); break;
    case 'radio': case 'broadcast': case 'title': await sleep(250); break;
    case 'start': case 'reach': {
      // Travel there (the hero is placed beside the marker; reaching it is the check).
      if (st.site) await ev(([x, y, z]) => window.__game.teleport(x, y + 0.2, z + 2, 0, 0, 0, 'air'), [st.site.x, st.site.y, st.site.z]);
      await sleep(400);
      break;
    }
    default: await ev(() => window.__game.storySkip()); await sleep(300); break;
  }
}
const end = await ev(() => ({ story: window.__game.story(), save: JSON.parse(localStorage.getItem('web-of-ink-save-3') ?? '{}'), roster: window.__game.roster().length }));
await b.close();
console.log('');
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };
check('every story step was visited, in order', seen.length === STEPS.length && seen.every((id, i) => id === STEPS[i].id), `${seen.length} of ${STEPS.length}`);
check('the story finished with the credits', end.story.finished === true);
check('the save holds every step id as done', STEPS.every((s) => end.save.story?.done?.includes(s.id)));
check('the epilogue unlocks the roster (and the Anti-Venom suit)', end.save.story?.done?.includes('act4.epilogue'));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const minutes = ((Date.now() - t0) / 60000).toFixed(1);
console.log(`${minutes} min`);
process.exit(results.every(Boolean) ? 0 : 1);
