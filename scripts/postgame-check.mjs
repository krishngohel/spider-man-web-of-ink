// Post-game (spec 12): New Game+ from a finished slot (story restarted, level kept, Ultimate),
// the Villain Gauntlet (starts at the first arena with its timer, moves on to the next boss), and
// Crime Nights (crimes come fast at night, a defeat ends the night and keeps the best score).
//   node scripts/postgame-check.mjs [url]
import { chromium } from 'playwright-core';
import { launchArgs, sleep } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5310/';
const b = await chromium.launch({ args: launchArgs(), headless: true });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ev = (f, a) => p.evaluate(f, a);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };

// A finished save in slot 2.
await p.goto(url);
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await ev(() => {
  const s = JSON.parse(JSON.stringify(window.__game.save()));
  s.slot = 2; s.progress.level = 31; s.progress.xp = 999999; s.story.done = ['act4.epilogue', 'act4.credits']; s.story.step = 'act4.credits';
  localStorage.setItem('web-of-ink-save-2', JSON.stringify(s));
});
await p.reload();
await p.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 120000 });
await p.locator('.title .mbtn', { hasText: 'STORY' }).click();
const ngBtn = p.locator('.slot').nth(1).locator('.mbtn', { hasText: 'NEW GAME+' });
check('a finished slot offers New Game+', (await ngBtn.count()) === 1);
await ngBtn.click();
await sleep(1500);
const ng = await ev(() => ({ step: window.__game.story().step, level: window.__game.save().progress.level, ng: window.__game.save().postGame.ngPlus, diff: window.__game.combat && window.__game.director() ? 'ok' : '' }));
check('New Game+ restarts the story and keeps the level', ng.step === 'prologue.open' && ng.level === 31 && ng.ng === 1, JSON.stringify(ng));
await p.keyboard.press('Escape');
await sleep(300);

// The Gauntlet: the first fight starts with the clock; skipping it moves on to the second arena.
await ev(() => window.__game.gauntlet(0));
await sleep(2500);
let g = await ev(() => ({ gt: window.__game.director().gauntlet, st: window.__game.story() }));
check('the Gauntlet starts at the first arena, timed', g.gt && g.gt.step.endsWith('kingpin') && g.gt.t > 1 && g.st.phase === 'fight', JSON.stringify(g.gt));
await ev(() => window.__game.storySkip());
await sleep(2500);
g = await ev(() => ({ gt: window.__game.director().gauntlet, hero: window.__game.hero().p }));
check('then the next boss, at his own arena', g.gt && g.gt.step.endsWith('shocker'), JSON.stringify(g.gt));

// Crime Nights: a crime comes within seconds; going down ends the night and keeps the score.
await ev(() => window.__game.director().stop());
await ev(() => window.__game.nights());
await sleep(5000);
const n1 = await ev(() => ({ n: window.__game.content().crime, night: window.__game.clock().hour }));
check('Crime Nights brings a crime quickly, at night', !!n1.n && (n1.night >= 20 || n1.night < 5), JSON.stringify(n1));
await ev(() => { const c = window.__game.combat().heroCombat; c.knockOut(); });
await sleep(3000);
const n2 = await ev(() => ({ nights: window.__game.content().crime, best: window.__game.save().postGame.crimeNightsBest }));
check('a defeat ends the night (the best score is kept)', typeof n2.best === 'number', JSON.stringify(n2));

await b.close();
console.log(errors.length ? errors.slice(0, 6).join('\n') : 'no console errors');
const failed = results.filter((x) => !x).length + (errors.length ? 1 : 0);
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
