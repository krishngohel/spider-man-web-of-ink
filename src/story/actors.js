import { characterById } from '../roster/characters.js';
import { CAST } from './cast.js';
import { makePuppet, setPuppet } from './puppet.js';
import { CROWD } from './cast.js';
import { propMesh } from './stroll.js';

// Figures placed in the city for comic panels: the cast, villains (the roster models) and the
// hero (in the suit he is wearing). Each is posed standing (the idle clip settled for a moment),
// facing where the shot says. Models are kept between shots and hidden when not in use.

export function createActors({ scene, assets, buildCharacter, createPoser, heroDef }) {
  const pool = new Map();
  const props = [];
  const ZERO = { x: 0, y: 0, z: 0 };

  function get(who, suit = null) {
    const hd = who === 'hero' ? (suit ? { ...heroDef(), suit: undefined, suitId: suit } : heroDef()) : null;
    const key = who === 'hero' ? `hero:${JSON.stringify(hd)}` : who;
    let a = pool.get(key);
    if (!a) {
      const def = who === 'hero' ? hd : CAST[who] ?? CROWD[who] ?? characterById(who);
      const model = buildCharacter(assets, def);
      a = { model, poser: createPoser(model), puppet: makePuppet() };
      scene.add(model.root);
      pool.set(key, a);
    }
    return a;
  }

  return {
    // Stands a figure at p (feet on y), facing yawDeg (0 = +z).
    // pose 'perch': the rooftop crouch (the poser's own idle on a high ledge); any mocap clip name
    // ('Sit_Laugh', 'Phone', 'Pointing'...) holds that clip's frame at t (0 to 1 of the clip).
    // prop: a seat or desk to go with it ('bench', 'chair', 'stool', 'desk', 'table').
    place(who, p, yawDeg = 0, pose = 'stand', suit = null, t = 0.5, prop = null) {
      const a = get(who, suit);
      a.model.root.visible = true;
      const at = { x: p.x, y: p.y + 0.9, z: p.z };
      const yaw = (yawDeg * Math.PI) / 180;
      // One moving frame resets the poser's idle clock (a long idle on a roof becomes a crouch).
      setPuppet(a.puppet, at, { x: Math.sin(yaw) * 0.6, y: 0, z: Math.cos(yaw) * 0.6 }, yaw, 'ground');
      a.poser.update(a.puppet, 1 / 60, [], at);
      setPuppet(a.puppet, at, ZERO, yaw, 'ground');
      const frames = pose === 'perch' ? 200 : 110;
      for (let i = 0; i < frames; i++) a.poser.update(a.puppet, 1 / 60, [], at);
      if (pose !== 'stand' && pose !== 'perch' && a.model.animator.has(pose)) {
        const act = a.model.animator.play(pose, { fade: 0, once: true });
        act.time = a.model.animator.duration(pose) * Math.max(0, Math.min(0.999, t));
        a.model.animator.update(0);
      }
      if (prop) {
        const pm = propMesh(prop);
        const front = prop === 'desk' || prop === 'table' ? 0.55 : -0.05;
        pm.position.set(p.x + Math.sin(yaw) * front, p.y, p.z + Math.cos(yaw) * front);
        pm.rotation.y = yaw;
        scene.add(pm); props.push(pm);
      }
      a.model.updateGear?.(1 / 60, a.puppet);
      a.model.root.updateMatrixWorld(true);
      return a;
    },
    hideAll() { for (const a of pool.values()) a.model.root.visible = false; for (const pm of props) scene.remove(pm); props.length = 0; },
  };
}
