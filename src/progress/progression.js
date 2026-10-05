// Progression (spec section 9): XP and levels 1 to 50, three skill trees of 15, six token types,
// 24 suits, six suit powers, twelve mods and gadget upgrades. Plain data and pure functions, so the
// economy can be tested: every unlock must be affordable with the tokens 100% completion pays out.
// No skill bends the physics rule: traversal skills raise real parameters (reel speed, web length,
// glide ratio), never add mid-air jumps.

export const MAX_LEVEL = 50;
// XP needed to go from level n to n + 1.
export const xpToNext = (n) => Math.round(500 + 140 * (n - 1) + 6 * (n - 1) ** 2);
export function levelFor(xp) {
  let lv = 1, need = xpToNext(1), rest = xp;
  while (lv < MAX_LEVEL && rest >= need) { rest -= need; lv++; need = xpToNext(lv); }
  return { level: lv, into: rest, need: lv < MAX_LEVEL ? need : 0 };
}

// XP for each kind of deed.
export const XP = {
  enemyOut: 25, gangBusted: 220, crime: 300, base: 900, challengeMedal: 250, research: 600, backpack: 150, photo: 120,
  storyStep: 400, storyMission: 1600, bossDefeated: 2500, trick: 6, perfectRelease: 15, pigeon: 120, tag: 200, bugle: 300,
};

// Skills ------------------------------------------------------------------------------------------
// effect: { k, v } tunes a parameter (see applySkills); flags turn on a behaviour.
const S = (id, tree, name, desc, level, req, effect) => ({ id, tree, name, desc, level, req, effect });
export const SKILLS = [
  // Webslinger: traversal.
  S('momentum', 'webslinger', 'Swing Momentum', 'The pump through each arc pushes toward a higher speed.', 1, null, { k: 'cruiseSpeed', v: 3 }),
  S('longWebs', 'webslinger', 'Longer Webs', 'Webs reach 10 m further.', 2, 'momentum', { k: 'webMax', v: 10 }),
  S('fastReel', 'webslinger', 'Fast Reel', 'Web zips reel in faster.', 3, 'momentum', { k: 'zipSpeed', v: 6 }),
  S('perfectPlus', 'webslinger', 'Perfect Release+', 'A perfect release throws you further.', 4, 'longWebs', { k: 'perfectBoost', v: 2.5 }),
  S('airControl', 'webslinger', 'Air Control', 'Steer harder between webs.', 5, 'longWebs', { k: 'airTurn', v: 0.4 }),
  S('wingTrim', 'webslinger', 'Web Wings Trim', 'Web wings glide further for every metre dropped.', 6, 'fastReel', { k: 'glideRatio', v: 1 }),
  S('wallSprint', 'webslinger', 'Wall Sprint', 'Run along walls faster.', 7, 'fastReel', { k: 'wallRunSpeed', v: 3 }),
  S('pointLaunch', 'webslinger', 'Point Launch+', 'Launch off perches and edges harder.', 8, 'perfectPlus', { k: 'launchSpeed', v: 4 }),
  S('swingJump', 'webslinger', 'Quick Zip', 'Hold jump through a zip to a perch: you launch straight off it without stopping.', 10, 'perfectPlus', { flag: 'quickZip' }),
  // Move skills (Insomniac's tree unlocks moves, not only numbers). The ids are older skills'
  // (Quick Climber, Swing-Jump+, Corner Whip+) so a save that learned those gets the move.
  S('climber', 'webslinger', 'Zip Boost+', 'One more air dash (zip with nothing to zip to) every time you leave the ground.', 11, 'airControl', { k: 'zipBoosts', v: 1 }),
  S('trickster', 'webslinger', 'Trickster', 'Air tricks earn XP and a little focus.', 12, 'airControl', { flag: 'trickXp' }),
  S('diver', 'webslinger', 'Dive Bomber', 'Dives reach a higher top speed.', 14, 'wingTrim', { k: 'diveTerminal', v: 10 }),
  S('corners', 'webslinger', 'Wall Dash', 'On a wall, press dive to dash along it the way you steer.', 16, 'wallSprint', { flag: 'wallDash' }),
  S('releaseBoost', 'webslinger', 'Release Boost', 'Every release on the rise throws you further.', 18, 'pointLaunch', { k: 'releaseBoost', v: 1 }),
  S('master', 'webslinger', 'Web Master', 'The pump pushes toward an even higher speed.', 24, 'releaseBoost', { k: 'cruiseSpeed', v: 3 }),
  // Defender: combat.
  S('power1', 'defender', 'Heavy Hands', 'Hits do 10% more damage.', 1, null, { c: 'dmgMul', v: 0.1 }),
  S('health1', 'defender', 'Tough', 'Twenty more health.', 2, 'power1', { c: 'maxHp', v: 20 }),
  S('combo', 'defender', 'Combo Fighter', 'Combos build damage faster.', 3, 'power1', { c: 'comboBonus', v: 0.6 }),
  S('focus1', 'defender', 'Focused', 'Hits fill focus faster.', 4, 'health1', { c: 'focusPerHit', v: 0.03 }),
  S('dodge', 'defender', 'Spider Reflexes', 'A longer window for a perfect dodge.', 5, 'health1', { c: 'perfectWindow', v: 0.08 }),
  S('heal', 'defender', 'First Aid', 'Heals restore more health.', 6, 'combo', { c: 'healAmount', v: 15 }),
  S('launcher', 'defender', 'Big Launcher', 'Launchers throw enemies higher.', 7, 'combo', { c: 'uppercutLift', v: 2 }),
  S('slam', 'defender', 'Ground Pound', 'Ground slams hit a wider ring.', 8, 'focus1', { c: 'slamRadius', v: 1.5 }),
  S('power2', 'defender', 'Heavier Hands', 'Hits do another 10% more damage.', 10, 'focus1', { c: 'dmgMul', v: 0.1 }),
  S('health2', 'defender', 'Tougher', 'Twenty more health.', 11, 'dodge', { c: 'maxHp', v: 20 }),
  S('juggle', 'defender', 'Air Juggler', 'Air kicks keep enemies up longer.', 12, 'launcher', { c: 'airLift', v: 1.2 }),
  S('strike', 'defender', 'Web Strike+', 'Web strikes hit harder.', 14, 'slam', { c: 'strikeMul', v: 0.4 }),
  S('regen', 'defender', 'Recovery', 'Health comes back faster out of a fight.', 16, 'health2', { c: 'regenRate', v: 8 }),
  S('slowmo', 'defender', 'Bullet Time', 'Perfect dodges slow the world for longer.', 18, 'juggle', { c: 'slowmo', v: 0.3 }),
  S('power3', 'defender', 'Spectacular Strength', 'Hits do 15% more damage.', 24, 'power2', { c: 'dmgMul', v: 0.15 }),
  // Innovator: gadgets and stealth.
  S('webShot', 'innovator', 'Sticky Webs', 'Web shots web enemies up faster.', 1, null, { c: 'webShot', v: 0.12 }),
  S('refill', 'innovator', 'Quick Refill', 'Gadgets refill 15% faster.', 2, 'webShot', { g: 'refillMul', v: -0.15 }),
  S('ammo', 'innovator', 'Ammo Pouch', 'One more charge for every gadget.', 3, 'webShot', { g: 'extraCharge', v: 1 }),
  S('mines', 'innovator', 'Wide Mines', 'Trip mines catch from further away.', 4, 'refill', { g: 'mineRadius', v: 1.2 }),
  S('chain', 'innovator', 'Chain Shock', 'Electric webs jump to two more enemies.', 5, 'refill', { g: 'chainExtra', v: 2 }),
  S('drones', 'innovator', 'Drone Time', 'Spider-drones fight three seconds longer.', 6, 'ammo', { g: 'droneTime', v: 3 }),
  S('blast', 'innovator', 'Bigger Blast', 'Concussive blasts reach further.', 7, 'ammo', { g: 'blastRange', v: 3 }),
  S('quiet', 'innovator', 'Light Feet', 'Enemies take longer to notice you.', 8, 'mines', { s: 'notice', v: 0.35 }),
  S('perchTd', 'innovator', 'Perch Takedown+', 'Perch takedowns are silent.', 10, 'mines', { s: 'silentPerch', v: 1 }),
  S('webTd', 'innovator', 'Web Strike Takedown', 'Web strike a lone, unaware enemy to take him down.', 11, 'chain', { s: 'strikeTakedown', v: 1 }),
  S('senseRange', 'innovator', 'Wider Sense', 'Spider-sense reaches further.', 12, 'chain', { c: 'senseRange', v: 8 }),
  S('refill2', 'innovator', 'Quicker Refill', 'Gadgets refill another 15% faster.', 14, 'drones', { g: 'refillMul', v: -0.15 }),
  S('ammo2', 'innovator', 'Bandolier', 'Another charge for every gadget.', 16, 'blast', { g: 'extraCharge', v: 1 }),
  S('ghost', 'innovator', 'Ghost', 'Stealth takedowns refill a little focus.', 18, 'quiet', { s: 'focusOnTakedown', v: 0.35 }),
  S('genius', 'innovator', 'Genius', 'Gadget hits fill focus.', 24, 'refill2', { g: 'focusOnGadget', v: 0.1 }),
];
export const TREES = ['webslinger', 'defender', 'innovator'];

export function canLearn(save, id) {
  const s = SKILLS.find((x) => x.id === id);
  const p = save.progress;
  if (!s || p.skills.includes(id)) return false;
  if (p.skillPoints < 1 || p.level < s.level) return false;
  if (s.req && !p.skills.includes(s.req)) return false;
  return true;
}
export function learn(save, id) {
  if (!canLearn(save, id)) return false;
  save.progress.skills.push(id);
  save.progress.skillPoints--;
  return true;
}

// Sums every learned skill's effect into { tune, combat, gadgets, stealth, flags }.
export function skillEffects(skills) {
  const out = { tune: {}, combat: {}, gadgets: {}, stealth: {}, flags: {} };
  for (const id of skills) {
    const s = SKILLS.find((x) => x.id === id);
    if (!s) continue;
    const e = s.effect;
    if (e.flag) out.flags[e.flag] = true;
    else if (e.k) out.tune[e.k] = (out.tune[e.k] ?? 0) + e.v;
    else if (e.c) out.combat[e.c] = (out.combat[e.c] ?? 0) + e.v;
    else if (e.g) out.gadgets[e.g] = (out.gadgets[e.g] ?? 0) + e.v;
    else if (e.s) out.stealth[e.s] = (out.stealth[e.s] ?? 0) + e.v;
  }
  return out;
}

// Suits -------------------------------------------------------------------------------------------
// style: 0 classic web, 1 symbiote, 2 iron, 3 noir, 4 2099, 5 stealth glow, 6 negative.
// story: a story step that must be done first (the Black Suit comes from the symbiote, not a shop).
// pattern: the layout within style 0 (0 Amazing 2, 1 Amazing 2012, 2 hoodie, 3 homemade, 4 wrestler, 5 punk).
const PATTERN = { amazing: 1, scarlet: 2, homemade: 3, wrestler: 4, punk: 5 };
// model: a fitted film suit mesh worn instead of the painted body (hero_m.glb SuitModel).
const MODEL = { classic: 'tasm' };
// Colourways of the film suit (its texture recoloured): until a suit has a model of its own.
const RECOLOR = new Set(['amazing', 'crimson', 'arctic', 'gold', 'rocket', 'sunset', 'negative', 'future', 'symbiote', 'last']);
const SU = (id, name, style, red, blue, black, lens, level, cost, power = null, story = null) => ({ id, name, style, pattern: PATTERN[id] ?? 0, model: MODEL[id] ?? (RECOLOR.has(id) ? 'tasm' : null), recolor: RECOLOR.has(id), red, blue, black, lens, level, cost, power, story });
export const SUITS = [
  SU('classic', 'Classic', 0, 0xbb121e, 0x192e7e, 0x0e0d16, 0xf4f6fb, 1, {}, 'webBlossom'),
  SU('amazing', 'Amazing', 0, 0xa3141e, 0x14235e, 0x14141c, 0xf2b33d, 2, { crime: 2 }),
  SU('scarlet', 'Scarlet Hoodie', 0, 0xb81e2a, 0x9aa0a8, 0x0e0d16, 0xf4f6fb, 4, { crime: 3, backpack: 2 }),
  SU('blackSuit', 'Black Suit', 1, 0x0e0d16, 0x0e0d16, 0xf4f6fb, 0xf4f6fb, 1, {}, 'battleFocus', 'act3.blackSuit'),
  SU('iron', 'Iron Spider', 2, 0xb8202a, 0xd8a83a, 0x2a1a10, 0xf4f6fb, 12, { research: 4, challenge: 4 }, 'spiderDrones'),
  SU('noir', 'Noir', 3, 0x2a2a2e, 0x1a1a1e, 0x0a0a0c, 0x9aa4ae, 10, { landmark: 4, crime: 4 }),
  SU('2099', '2099', 4, 0xc8202a, 0x16306a, 0x0a0a14, 0xf4f6fb, 15, { challenge: 6, base: 2 }),
  SU('stealth', 'Stealth Big Time', 5, 0x16161c, 0x0e0e12, 0x3ad08a, 0x3ad08a, 9, { base: 4, research: 2 }),
  SU('negative', 'Negative', 6, 0xf4f4f6, 0x0e0d16, 0xf4f4f6, 0x0e0d16, 14, { base: 3, crime: 3 }, 'soundPulse'),
  SU('arctic', 'Arctic', 0, 0xe8eef4, 0x2f6fb0, 0x16304a, 0x9ad8ff, 6, { landmark: 3 }),
  SU('gold', 'Black and Gold', 0, 0x1a1a20, 0x1a1a20, 0xd8a83a, 0xf8e8b0, 8, { crime: 3, challenge: 2 }),
  SU('crimson', 'Crimson', 0, 0x8a1018, 0x2a0a10, 0x0e0d16, 0xffe0a0, 5, { backpack: 4 }),
  SU('future', 'Future Foundation', 6, 0xf4f4f6, 0x22252e, 0x22252e, 0x3fb4e8, 18, { research: 4, challenge: 4 }),
  SU('electric', 'Volt', 5, 0x16182a, 0x101222, 0x4ab8ff, 0xf8f0a0, 16, { research: 3, base: 3 }, 'electricPunch'),
  SU('rocket', 'Rocket Red', 0, 0xe0402a, 0x2a2a30, 0x0e0d16, 0xf8d048, 20, { challenge: 6, crime: 4 }, 'rocketRush'),
  SU('punk', 'Punk', 0, 0x2a5fb0, 0xd8392b, 0x0e0d16, 0xf4f6fb, 11, { landmark: 3, backpack: 3 }),
  SU('wrestler', 'Wrestler', 0, 0xd3232e, 0x2a2a30, 0x0e0d16, 0xf4f6fb, 3, { backpack: 3 }),
  SU('homemade', 'Homemade', 0, 0xd8392b, 0x2a5fb0, 0x1a1a1a, 0xe8e8e0, 2, {}),
  SU('armor', 'Armour Mk II', 2, 0x8a929c, 0x3a4048, 0x1a1c20, 0x3fb4e8, 22, { base: 5, research: 4 }),
  SU('ghost', 'Ghost Spider', 4, 0xf4f4f6, 0xe050a0, 0x0e0d16, 0x3fd0e0, 13, { landmark: 4, challenge: 3 }),
  SU('symbiote', 'Anti-Venom', 1, 0xf4f4f6, 0xf4f4f6, 0x0e0d16, 0x0e0d16, 30, { base: 6, challenge: 8, crime: 6 }, null, 'act4.epilogue'),
  SU('shadow', 'Shadow', 5, 0x0e0d16, 0x0e0d16, 0xb02030, 0xff4040, 26, { research: 5, base: 4 }),
  SU('sunset', 'Golden Hour', 0, 0xf08a2a, 0x3a2a5a, 0x1a1020, 0xfff0c0, 7, { landmark: 4 }),
  SU('last', 'Last Stand', 0, 0x8a3a30, 0x2a3040, 0x0e0d16, 0xd8d8d0, 35, { crime: 6, base: 6, challenge: 8, research: 4, landmark: 4, backpack: 6 }),
];

export const POWERS = [
  { id: 'webBlossom', name: 'Web Blossom', desc: 'A burst of webs that webs up everyone around you.' },
  { id: 'battleFocus', name: 'Battle Focus', desc: 'Focus fills twice as fast for fifteen seconds.' },
  { id: 'electricPunch', name: 'Electric Punch', desc: 'Every hit shocks the enemies around the target for ten seconds.' },
  { id: 'spiderDrones', name: 'Spider-Drones', desc: 'Three drones fight beside you.' },
  { id: 'soundPulse', name: 'Sound Pulse', desc: 'A ring of sound that knocks everyone down and disarms them.' },
  { id: 'rocketRush', name: 'Rocket Rush', desc: 'Your next three strikes fly you through the target.' },
];

export const MODS = [
  { id: 'webBlaster', name: 'Web Blaster', desc: 'Web shots web up twice as fast.', cost: { research: 2 } },
  { id: 'quickRecovery', name: 'Quick Recovery', desc: 'Health comes back twice as fast out of a fight.', cost: { crime: 2 } },
  { id: 'concentration', name: 'Concentration', desc: 'Getting hit no longer resets your combo.', cost: { challenge: 3 } },
  { id: 'trickMaster', name: 'Trick Master', desc: 'Air tricks fill focus.', cost: { landmark: 2 } },
  { id: 'reflexes', name: 'Perfect Reflexes', desc: 'Perfect dodge slow motion lasts longer.', cost: { challenge: 2, crime: 1 } },
  { id: 'heavyHitter', name: 'Heavy Hitter', desc: 'Brutes take double damage from your hits.', cost: { base: 2 } },
  { id: 'momentum', name: 'Combo Momentum', desc: 'Combos last twice as long between hits.', cost: { crime: 2, backpack: 1 } },
  { id: 'ammoPack', name: 'Ammo Pack', desc: 'One more charge for every gadget.', cost: { research: 3 } },
  { id: 'steadyAim', name: 'Steady Aim', desc: 'Web shots reach further.', cost: { backpack: 2 } },
  { id: 'senseFirst', name: 'Spider-Sense+', desc: 'The spider-sense warns earlier.', cost: { challenge: 2 } },
  { id: 'armored', name: 'Armoured Lining', desc: 'Take 20% less damage.', cost: { base: 3, research: 1 } },
  { id: 'resilient', name: 'Resilient', desc: 'Defeat leaves you on your feet once per fight.', cost: { challenge: 3, base: 2 } },
];
export const MAX_MODS = 3;

// Gadget upgrades: level 2 and 3 cost tokens.
export const GADGET_COST = { 2: { research: 1, crime: 1 }, 3: { research: 2, challenge: 2 } };

// What 100% completion pays out (the content plans must match these: a test checks the economy).
// Crimes 60 (district milestones), bases 9 x 5, challenges 12 medals up to 8 each, research 8
// stations x 8, landmark photos 30, backpacks 55.
export const CONTENT_TOKENS = { crime: 60, base: 45, challenge: 96, research: 64, landmark: 30, backpack: 55 };

export function affordable(save, cost) {
  for (const [k, v] of Object.entries(cost)) if ((save.progress.tokens[k] ?? 0) < v) return false;
  return true;
}
export function pay(save, cost) {
  if (!affordable(save, cost)) return false;
  for (const [k, v] of Object.entries(cost)) save.progress.tokens[k] -= v;
  return true;
}

// Grants XP; returns the number of levels gained (each gives a skill point).
export function grantXp(save, amount) {
  const p = save.progress;
  const before = levelFor(p.xp).level;
  p.xp += Math.max(0, Math.round(amount));
  const after = levelFor(p.xp).level;
  if (after > before) { p.skillPoints += after - before; p.level = after; }
  return after - before;
}

// A profile at a given level with its points spent (tree by tree, in order): the dev and test entry
// into the middle of the story plays at the strength a player would have reached there.
export function autoBuild(save, level, order = ['defender', 'webslinger', 'innovator']) {
  let xp = 0;
  for (let l = 1; l < level; l++) xp += xpToNext(l);
  grantXp(save, xp - save.progress.xp);
  for (let pass = 0; pass < 5; pass++) for (const t of order) for (const s of SKILLS.filter((q) => q.tree === t)) if (save.progress.skillPoints > 0) learn(save, s.id);
  return save;
}

export function suitById(id) { return SUITS.find((s) => s.id === id) ?? SUITS[0]; }
