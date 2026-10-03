import * as THREE from 'three';
import { el } from './dom.js';
import { COPY } from './copy.js';
import { GADGETS } from '../combat/gadgets.js';
import { isActive } from '../combat/enemies.js';

// The fight on the HUD: health and focus in a comic panel, the combo count, the spider-sense
// (squiggles over Spidey's head, white while an attack winds up and red for the last 120 ms, the
// perfect-dodge window; a ring round the attacker for a heavy one, yellow then red; an arc at the
// screen edge pointing at an attacker out of view), the locked target with its health, the gadget
// in hand, and the gadget wheel.

export function createCombatHud(root, opts) {
  const hpFill = el('i'), hpBar = el('div', { class: 'cb-hp' }, [hpFill]);
  const pips = [0, 1, 2].map(() => el('b', { class: 'cb-pip' }, [el('i')]));
  const focus = el('div', { class: 'cb-focus' }, pips);
  // Web cartridges: six small pips (spec 1.6).
  const webPips = Array.from({ length: 6 }, () => el('i'));
  const webs = el('div', { class: 'cb-webs' }, webPips);
  const panel = el('div', { class: 'cb-panel' }, [hpBar, focus, webs]);
  const combo = el('div', { class: 'cb-combo hidden' }, [el('b'), el('span', {}, COPY.combat.combo)]);
  const sense = el('div', { class: 'cb-sense' });
  const arcs = Array.from({ length: 4 }, () => { const a = el('div', { class: 'cb-arc' }); sense.append(a); return { el: a, t: 0 }; });
  const squig = el('div', { class: 'cb-squig' });
  const rings = Array.from({ length: 3 }, () => { const r = el('div', { class: 'cb-ring' }); return { el: r, t: 0, e: null }; });
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
  const box = el('div', { class: 'cb hidden' }, [panel, combo, sense, squig, ...rings.map((r) => r.el), target, gadget, flash, wheel]);
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
    },
    // The last 120 ms: dodge now.
    red(e, heavy) {
      squig.classList.add('red');
      squigT = Math.max(squigT, 0.3);
      if (heavy) { const r = rings.find((q) => q.e === e); if (r) r.el.classList.add('red'); }
      for (const a of arcs) if (a.e === e) a.el.classList.add('red');
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
      const fighting = combat.enemies.engaged.length > 0 || c.hp < c.maxHp || wheelOpen;
      box.classList.toggle('hidden', !fighting && c.focus <= 0.01);
      hpFill.style.width = `${(c.hp / c.maxHp) * 100}%`;
      hpBar.classList.toggle('low', c.hp < c.maxHp * 0.3);
      webPips.forEach((w, i) => w.classList.toggle('on', i < (c.webAmmo ?? 6)));
      pips.forEach((p, i) => { p.firstChild.style.width = `${Math.max(0, Math.min(1, c.focus - i)) * 100}%`; p.classList.toggle('full', c.focus >= i + 1); });
      if (c.combo !== shownCombo) { shownCombo = c.combo; combo.firstChild.textContent = `x${c.combo}`; combo.classList.toggle('hidden', c.combo < 2); if (c.combo >= 2) { combo.classList.remove('pop'); void combo.offsetWidth; combo.classList.add('pop'); } }
      squigT -= dt; squig.classList.toggle('show', squigT > 0);
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
      flashT -= dt; flash.style.opacity = String(Math.max(0, flashT / 0.35) * 0.55);
      // Sense arcs: an inked wedge at the screen edge in the attacker's direction.
      for (const a of arcs) {
        a.t -= dt;
        if (a.t <= 0 || !a.e) { a.el.style.opacity = '0'; continue; }
        v.set(a.e.body.p.x, a.e.body.p.y, a.e.body.p.z).project(camera);
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
      // Gadget in hand.
      const gs = combat.gadgets, g = GADGETS.find((x) => x.id === gs.selected);
      gadget.firstChild.textContent = g.name;
      gadget.lastChild.textContent = '●'.repeat(gs.state[g.id].charges) + '○'.repeat(Math.max(0, gs.maxCharges(g) - gs.state[g.id].charges));
      if (wheelOpen) for (const s of slots) s.el.lastChild.textContent = `${gs.state[s.g.id].charges}/${gs.maxCharges(s.g)}`;
    },
  };
}
