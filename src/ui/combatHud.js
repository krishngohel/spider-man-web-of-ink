import * as THREE from 'three';
import { el } from './dom.js';
import { COPY } from './copy.js';
import { GADGETS } from '../combat/gadgets.js';
import { isActive } from '../combat/enemies.js';
import { TUNE } from '../combat/tuning.js';
import { bindingLabel, DEFAULT_BINDINGS } from '../core/bindings.js';

// The fight on the HUD: health and focus in a comic panel, the combo count, the spider-sense
// (squiggles over Spidey's head and a mark over every attacker's head, white while an attack winds
// up and red for the last 120 ms, the perfect-dodge window; a ring round the attacker for a heavy
// one; an arc at the screen edge only for an attacker out of view), the locked target (yellow, so
// red only ever means danger) with its health, the gadget in hand, and the gadget wheel.

export function createCombatHud(root, opts) {
  const hpFill = el('i'), hpBar = el('div', { class: 'cb-hp' }, [hpFill]);
  const pips = [0, 1, 2].map(() => el('b', { class: 'cb-pip' }, [el('i')]));
  const focus = el('div', { class: 'cb-focus' }, pips);
  // Web cartridges: six small pips (spec 1.6).
  const webPips = Array.from({ length: TUNE.webCap }, () => el('i'));
  const webs = el('div', { class: 'cb-webs' }, webPips);
  const panel = el('div', { class: 'cb-panel' }, [hpBar, focus, webs]);
  const combo = el('div', { class: 'cb-combo hidden' }, [el('b'), el('span', {}, COPY.combat.combo)]);
  const sense = el('div', { class: 'cb-sense' });
  const arcs = Array.from({ length: 4 }, () => { const a = el('div', { class: 'cb-arc' }); sense.append(a); return { el: a, t: 0 }; });
  const squig = el('div', { class: 'cb-squig' });
  const rings = Array.from({ length: 3 }, () => { const r = el('div', { class: 'cb-ring' }); return { el: r, t: 0, e: null }; });
  // The attacker's mark (fix spec D11): who is about to hit you, over his own head.
  const tells = Array.from({ length: 5 }, () => ({ el: el('div', { class: 'cb-tell' }, '!'), e: null }));
  const target = el('div', { class: 'cb-target hidden' }, [el('i'), el('div', { class: 'cb-thp' }, [el('i')])]);
  const gadget = el('div', { class: 'cb-gadget' }, [el('b'), el('span')]);
  const wheel = el('div', { class: 'cb-wheel hidden' });
  const slots = GADGETS.map((g, i) => {
    const a = (i / GADGETS.length) * Math.PI * 2 - Math.PI / 2;
    const s = el('div', { class: 'cb-slot' }, [el('b', {}, g.name), el('span')]);
    s.style.left = `${50 + Math.cos(a) * 38}%`; s.style.top = `${50 + Math.sin(a) * 38}%`;
    wheel.append(s);
    return { g, el: s, a };
  });
  const flash = el('div', { class: 'cb-flash' });
  // The dodge window: the screen edge glows red (spider-sense pass).
  const senseVig = el('div', { class: 'cb-sensevig' });
  let vigT = 0;
  // Move prompts: what you can do right now, each fading for good once used a few times.
  const prompts = el('div', { class: 'cb-prompts' });
  const box = el('div', { class: 'cb hidden' }, [panel, combo, sense, squig, ...rings.map((r) => r.el), ...tells.map((q) => q.el), target, gadget, prompts, senseVig, flash, wheel]);
  root.append(box);
  let squigT = 0, flashT = 0, shownCombo = 0, wheelOpen = false, wheelPick = null, wheelVec = { x: 0, y: 0 };
  const v = new THREE.Vector3();
  let arcNext = 0;

  return {
    // An attack is winding up: the spider-sense goes off.
    sense(e, heavy, ranged) {
      squigT = Math.max(squigT, Math.min(1.8, (e.strikeAt ?? 0.6) + 0.15));
      squig.classList.remove('red');
      if (heavy) {
        const r = rings.find((q) => q.t <= 0 || q.e === e) ?? rings[0];
        r.e = e; r.t = Math.min(2, (e.strikeAt ?? 0.9) + 0.2); r.el.classList.remove('red');
      }
      const a = arcs[arcNext]; arcNext = (arcNext + 1) % arcs.length;
      a.t = 0.9; a.e = e; a.red = false; a.ranged = !!ranged;
      a.el.classList.remove('red');
      const tl = tells.find((q) => q.e === e) ?? tells.find((q) => !q.e || q.e.state !== 'windup') ?? tells[0];
      tl.e = e; tl.el.classList.remove('red');
    },
    // The last 120 ms: dodge now.
    red(e, heavy) {
      squig.classList.add('red');
      squigT = Math.max(squigT, 0.3);
      vigT = TUNE.redWindow + 0.05;
      if (heavy) { const r = rings.find((q) => q.e === e); if (r) r.el.classList.add('red'); }
      for (const a of arcs) if (a.e === e) a.el.classList.add('red');
      for (const q of tells) if (q.e === e) q.el.classList.add('red');
    },
    hurt() { flashT = 0.35; },
    ko() {},
    get wheelOpen() { return wheelOpen; },
    openWheel() { wheelOpen = true; wheelVec = { x: 0, y: 0 }; wheelPick = null; wheel.classList.remove('hidden'); },
    steerWheel(look, move) {
      // Mouse (pointer locked) or stick picks a slice.
      wheelVec.x += look.dx * 0.02 + move.x * 0.2; wheelVec.y += look.dy * 0.02 - move.y * 0.2;
      const l = Math.hypot(wheelVec.x, wheelVec.y);
      if (l > 1) { wheelVec.x /= l; wheelVec.y /= l; }
      if (l > 0.35) {
        const a = Math.atan2(wheelVec.y, wheelVec.x);
        let best = null, bd = 9;
        for (const s of slots) { let d = Math.abs(a - s.a); d = Math.min(d, Math.PI * 2 - d); if (d < bd) { bd = d; best = s; } }
        wheelPick = best.g.id;
      }
      for (const s of slots) s.el.classList.toggle('on', s.g.id === wheelPick);
    },
    closeWheel() { wheelOpen = false; wheel.classList.add('hidden'); return wheelPick; },
    update(dt, camera) {
      const combat = opts.combat;
      if (!combat) return;
      const c = combat.heroCombat.c;
      // Only in a fight, a few seconds after one, or while hurt: never parked on screen for good.
      const fighting = combat.enemies.engaged.length > 0 || wheelOpen || c.outOfCombat < 4 || c.hp < c.maxHp * 0.98;
      box.classList.toggle('hidden', !fighting);
      hpFill.style.width = `${(c.hp / c.maxHp) * 100}%`;
      hpBar.classList.toggle('low', c.hp < c.maxHp * 0.3);
      webPips.forEach((w, i) => w.classList.toggle('on', i < (c.webAmmo ?? 6)));
      pips.forEach((p, i) => { p.firstChild.style.width = `${Math.max(0, Math.min(1, c.focus - i)) * 100}%`; p.classList.toggle('full', c.focus >= i + 1); });
      if (c.combo !== shownCombo) { shownCombo = c.combo; combo.firstChild.textContent = `x${c.combo}`; combo.classList.toggle('hidden', c.combo < 2); if (c.combo >= 2) { combo.classList.remove('pop'); void combo.offsetWidth; combo.classList.add('pop'); } }
      squigT -= dt; squig.classList.toggle('show', squigT > 0);
      vigT -= dt; senseVig.classList.toggle('on', vigT > 0 && (opts.getSettings?.()?.cameraShake ?? true));
      // Over the hero's head.
      const hero = opts.hero;
      if (squigT > 0 && hero) {
        v.set(hero.body.p.x, hero.body.p.y + 1.25, hero.body.p.z).project(camera);
        squig.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; squig.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
      }
      for (const r of rings) {
        r.t -= dt;
        const live = r.t > 0 && r.e && r.e.alive && r.e.state === 'windup';
        if (!live) { r.el.style.opacity = '0'; continue; }
        v.set(r.e.body.p.x, r.e.body.p.y + 0.2, r.e.body.p.z).project(camera);
        if (v.z > 1) { r.el.style.opacity = '0'; continue; }
        const d = Math.max(2, Math.hypot(r.e.body.p.x - camera.position.x, r.e.body.p.y - camera.position.y, r.e.body.p.z - camera.position.z));
        r.el.style.opacity = '1';
        r.el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; r.el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
        r.el.style.width = r.el.style.height = `${Math.min(260, 900 / d)}px`;
      }
      for (const q of tells) {
        const live = q.e && q.e.alive && q.e.state === 'windup';
        if (!live) { q.el.style.opacity = '0'; continue; }
        v.set(q.e.body.p.x, q.e.body.p.y + 1.35, q.e.body.p.z).project(camera);
        if (v.z > 1) { q.el.style.opacity = '0'; continue; }
        q.el.style.opacity = '1';
        q.el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; q.el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
      }
      flashT -= dt; flash.style.opacity = String(Math.max(0, flashT / 0.35) * 0.55);
      // Sense arcs: an inked wedge at the screen edge in the attacker's direction.
      for (const a of arcs) {
        a.t -= dt;
        if (a.t <= 0 || !a.e) { a.el.style.opacity = '0'; continue; }
        v.set(a.e.body.p.x, a.e.body.p.y, a.e.body.p.z).project(camera);
        // On screen his own mark shows him: the edge arc is only for attackers out of view.
        if (v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.92) { a.el.style.opacity = '0'; continue; }
        let x = v.x, y = v.y;
        if (v.z > 1) { x = -x; y = -y; }
        const ang = Math.atan2(-y, x);
        a.el.style.opacity = String(Math.min(1, a.t * 2));
        a.el.style.transform = `translate(-50%, -50%) rotate(${ang}rad) translateX(min(34vw, 34vh))`;
      }
      // Target marker over the locked enemy.
      const t = c.target;
      if (t && isActive(t)) {
        v.set(t.body.p.x, t.body.p.y + 1.25, t.body.p.z).project(camera);
        if (v.z < 1) {
          target.classList.remove('hidden');
          target.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`; target.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
          target.lastChild.firstChild.style.width = `${Math.max(0, t.hp / t.maxHp) * 100}%`;
          target.lastChild.style.opacity = t.hp < t.maxHp ? '1' : '0';
        } else target.classList.add('hidden');
      } else target.classList.add('hidden');
      // Prompts: at most two at a time, the most urgent first.
      {
        const b = opts.getSettings?.()?.bindings ?? DEFAULT_BINDINGS, key = (a) => bindingLabel(b, a);
        const used = c.used ?? {}, fresh = (k, n = 3) => (used[k] ?? 0) < n;
        const t2 = c.target, near = t2 && isActive(t2) ? Math.hypot(t2.body.p.x - opts.hero.body.p.x, t2.body.p.z - opts.hero.body.p.z) : 99;
        const onGround = opts.hero.state === 'ground';
        const list = [];
        if (c.clock < c.counterUntil && fresh('counter', 4)) list.push([key('attack'), 'COUNTER']);
        if (c.combo >= TUNE.blastCombo && fresh('blast', 4)) list.push([`${key('attack')} + ${key('web')}`, 'WEB BLAST']);
        if (c.focus >= 1 && fresh('finisher', 3)) list.push([key('finisher'), 'FINISHER']);
        if (t2 && t2.webAgo < TUNE.pullWindow && near > 2.6 && near < 12 && !t2.A?.heavy && fresh('pull')) list.push([key('attack'), 'WEB PULL']);
        if (combat.enemies.list.some((e) => e.alive && e.state === 'webbed' && Math.hypot(e.body.p.x - opts.hero.body.p.x, e.body.p.z - opts.hero.body.p.z) < TUNE.throwReach) && fresh('throw')) list.push([key('hang'), 'THROW HIM']);
        if (t2 && !t2.boss && !(t2.A?.ranged && !t2.disarmed) && combat.props?.list.some((q) => q.state === 'rest' && Math.hypot(q.p.x - opts.hero.body.p.x, q.p.z - opts.hero.body.p.z) < 9) && fresh('propThrow')) list.push([key('hang'), 'THROW IT']);
        if (onGround && t2?.arch === 'shield' && !t2.shieldBroken && near < 3.4 && fresh('vault')) list.push([key('jump'), 'VAULT OVER']);
        if (opts.hero.state === 'swing' && t2 && !t2.boss && near < 12 && fresh('swingKick')) list.push([key('attack'), 'SWING KICK']);
        if (onGround && t2 && near < 2.8 && !t2.A?.heavy && !t2.boss && fresh('launcher')) list.push([`HOLD ${key('attack')}`, 'LAUNCH']);
        if (onGround && (c.step ?? 0) >= 2 && fresh('sweep')) list.push([`${key('attack')}, PAUSE, ${key('attack')}`, 'SWEEP']);
        const want = list.slice(0, 2).map(([k, n]) => `${k}|${n}`).join(';');
        if (prompts.dataset.k !== want) {
          prompts.dataset.k = want;
          prompts.replaceChildren(...list.slice(0, 2).map(([k, n]) => el('div', { class: 'cb-prompt' }, [el('kbd', {}, k), el('span', {}, n)])));
        }
      }
      // Gadget in hand.
      const gs = combat.gadgets, g = GADGETS.find((x) => x.id === gs.selected);
      gadget.firstChild.textContent = g.name;
      gadget.lastChild.textContent = '●'.repeat(gs.state[g.id].charges) + '○'.repeat(Math.max(0, gs.maxCharges(g) - gs.state[g.id].charges));
      if (wheelOpen) for (const s of slots) s.el.lastChild.textContent = `${gs.state[s.g.id].charges}/${gs.maxCharges(s.g)}`;
    },
  };
}
