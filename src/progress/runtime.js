import { DEFAULTS, tune } from '../physics/constants.js';
import { COMBAT, COMBAT_BASE } from '../combat/heroCombat.js';
import { TUNE } from '../combat/tuning.js';
import { GADGETS } from '../combat/gadgets.js';
import { skillEffects, suitById, grantXp, XP, levelFor, POWERS } from './progression.js';
import { STEALTH } from '../combat/stealth.js';
const STEALTH_BASE = { ...STEALTH };
import { setSuit } from '../hero/model.js';
import { applyDv } from '../physics/ledger.js';

// Progression at run time: turns the save's skills, suit, mods and gadget levels into the live
// parameters, pays out XP and tokens for deeds, and runs the suit powers.

export function createProgressRuntime({ save: firstSave, heroModel, combat, hero, hud, sfx, ink, onLevelUp = () => {} }) {
  let save = firstSave;
  const R = { powerT: 0, powerCd: 0, battleFocusT: 0, electricT: 0, rocketN: 0, model: heroModel, charId: 'peter', afterApply: null };

  function apply() {
    const p = save.progress;
    const fx = skillEffects(p.skills);
    // Physics parameters: defaults plus the traversal skills (every key reset each time).
    for (const k of Object.keys(DEFAULTS)) tune[k] = DEFAULTS[k] + (fx.tune[k] ?? 0);
    // Combat numbers.
    for (const k of Object.keys(COMBAT_BASE)) COMBAT[k] = COMBAT_BASE[k] + (fx.combat[k] ?? 0);
    const c = combat.heroCombat.c;
    const mods = new Set(p.mods);
    c.maxHp = COMBAT_BASE.hp + (fx.combat.maxHp ?? 0);
    c.hp = Math.min(c.hp, c.maxHp);
    c.dmgMul = 1 + (fx.combat.dmgMul ?? 0);
    c.strikeMul = 1 + (fx.combat.strikeMul ?? 0);
    c.comboKeep = TUNE.comboReset * (mods.has('momentum') ? 1.4 : 1);
    c.keepComboOnHit = mods.has('concentration');
    c.armor = mods.has('armored') ? 0.2 : 0;
    c.resilient = mods.has('resilient');
    if (mods.has('quickRecovery')) COMBAT.regenRate *= 2;
    if (mods.has('reflexes')) COMBAT.slowmo += 0.3;
    // Gadgets: levels from the save, modifiers from skills and mods.
    const gm = combat.gadgets.mods;
    gm.refillMul = Math.max(0.4, 1 + (fx.gadgets.refillMul ?? 0));
    gm.extraCharge = (fx.gadgets.extraCharge ?? 0) + (mods.has('ammoPack') ? 1 : 0);
    gm.mineRadius = fx.gadgets.mineRadius ?? 0;
    gm.chainExtra = fx.gadgets.chainExtra ?? 0;
    gm.droneTime = fx.gadgets.droneTime ?? 0;
    gm.blastRange = fx.gadgets.blastRange ?? 0;
    combat.gadgets.setLevels(Object.fromEntries(GADGETS.map((g) => [g.id, p.gadgets[g.id] ?? (g.id === 'webBomb' ? 1 : 0)])));
    gm.focusOnGadget = fx.gadgets.focusOnGadget ?? 0;
    // Mods and the stealth skills.
    c.webMul = mods.has('webBlaster') ? 2 : 1;
    c.webRangeBonus = mods.has('steadyAim') ? 12 : 0;
    c.heavyMul = mods.has('heavyHitter') ? 2 : 1;
    c.senseEarly = mods.has('senseFirst');
    c.stealthFx = fx.stealth;
    STEALTH.rise = STEALTH_BASE.rise * (1 - (fx.stealth.notice ?? 0)); // Light Feet
    hero.cornerPlus = !!fx.flags.cornerPlus;
    R.flags = fx.flags;
    R.mods = mods;
    // The suit (and the Noir suit's black-and-white world): Peter's suits only.
    const suit = suitById(R.suitOverride ?? p.suit);
    if (R.charId === 'peter' && R.model.suitMat) { setSuit(R.model, suit); ink.setFilter(suit.id === 'noir' ? 'noir' : 'none'); }
    else ink.setFilter(R.charId === 'noir' ? 'noir' : 'none');
    R.afterApply?.();
  }

  // XP (and tokens) for a deed.
  function reward(kind, { tokens = null, xp = null, at = null } = {}) {
    const amount = xp ?? XP[kind] ?? 0;
    if (amount > 0) {
      const levels = grantXp(save, amount);
      hud.xp(amount, levelFor(save.progress.xp));
      if (levels > 0) { hud.caption(`LEVEL ${save.progress.level}! +${levels} SKILL POINT${levels > 1 ? 'S' : ''}`, 3); sfx.event({ type: 'perfect' }); onLevelUp(save.progress.level); }
    }
    if (tokens) for (const [k, v] of Object.entries(tokens)) save.progress.tokens[k] = (save.progress.tokens[k] ?? 0) + v;
    void at;
  }

  // Suit power (one per suit, any power once unlocked): a long cooldown.
  function usePower() {
    const id = save.progress.power ?? suitById(save.progress.suit).power ?? 'webBlossom';
    if (R.powerCd > 0) { hud.caption(`SUIT POWER READY IN ${Math.ceil(R.powerCd)} S`, 1.2); return false; }
    R.powerCd = 60;
    const p = hero.body.p;
    const enemies = combat.enemies;
    switch (id) {
      case 'webBlossom':
        for (const e of enemies.active) if (Math.hypot(e.body.p.x - p.x, e.body.p.z - p.z) < 9) enemies.hit(e, { kind: 'web', dmg: 1 });
        break;
      case 'battleFocus': R.battleFocusT = 15; combat.heroCombat.c.focusMul = 2; break;
      case 'electricPunch': R.electricT = 10; break;
      case 'spiderDrones': for (let i = 0; i < 3; i++) combat.gadgets.makeDrone(14, (i / 3) * Math.PI * 2); break;
      case 'soundPulse':
        for (const e of enemies.active) {
          const dx = e.body.p.x - p.x, dz = e.body.p.z - p.z, d = Math.hypot(dx, dz) || 1;
          if (d < 12) { e.disarmed = true; enemies.hit(e, { dmg: 6, dir: { x: dx / d, z: dz / d }, push: 10, lift: 2, kind: 'slam', from: p }); }
        }
        break;
      case 'rocketRush': R.rocketN = 3; break;
      default: break;
    }
    const name = POWERS.find((x) => x.id === id)?.name ?? id;
    hud.caption(name.toUpperCase() + '!', 1.6);
    sfx.event({ type: 'gadget' });
    return true;
  }

  function step(dt) {
    R.powerCd = Math.max(0, R.powerCd - dt);
    if (R.battleFocusT > 0) { R.battleFocusT -= dt; if (R.battleFocusT <= 0) combat.heroCombat.c.focusMul = 1; }
    if (R.electricT > 0) R.electricT -= dt;
  }

  // Hooks into combat events (electric punch, rocket rush, trick XP).
  function onCombatEvent(e) {
    if (e.type === 'heroHit' && R.electricT > 0 && e.e) {
      for (const o of combat.enemies.active) if (o !== e.e && Math.hypot(o.body.p.x - e.e.body.p.x, o.body.p.z - e.e.body.p.z) < 5) combat.enemies.hit(o, { dmg: 4, push: 1, from: e.e.body.p });
    }
    if (e.type === 'webStrike' && R.rocketN > 0) {
      R.rocketN--;
      const v = hero.body.v;
      applyDv(hero.body, 'rope', v.x * 0.4, 0, v.z * 0.4);
    }
    if (e.type === 'enemyOut') reward('enemyOut');
    if (e.type === 'encounterDone') reward('gangBusted', { tokens: { crime: 1 } });
  }
  function onHeroEvent(e) {
    if ((e.type === 'trick' || e.type === 'airTrick') && R.flags?.trickXp) { reward('trick'); combat.heroCombat.c.focus = Math.min(3, combat.heroCombat.c.focus + 0.05); }
    if ((e.type === 'trick' || e.type === 'airTrick') && R.mods?.has('trickMaster')) combat.heroCombat.c.focus = Math.min(3, combat.heroCombat.c.focus + 0.08);
    if (e.type === 'perfect') reward('perfectRelease');
  }

  return {
    apply, reward, usePower, step, onCombatEvent, onHeroEvent,
    get powerCooldown() { return R.powerCd; },
    // A different character: its model, and what to layer on top of the skills after each apply.
    useSave(s) { save = s; apply(); },
    // The story can dress Peter for a while (the Black Suit in Act 3); null puts his own back.
    setSuitOverride(id) { if ((R.suitOverride ?? null) === (id ?? null)) return; R.suitOverride = id ?? null; apply(); },
    get suitOverride() { return R.suitOverride ?? null; },
    setCharacter(model, id, afterApply) { R.model = model; R.charId = id; R.afterApply = afterApply; apply(); },
  };
}
