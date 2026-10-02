import { characterById } from '../roster/characters.js';
import { CAST } from './cast.js';
import { makePuppet, setPuppet } from './puppet.js';

// Figures placed in the city for comic panels: the cast, villains (the roster models) and the
// hero (in the suit he is wearing). Each is posed standing (the idle clip settled for a moment),
// facing where the shot says. Models are kept between shots and hidden when not in use.

export function createActors({ scene, assets, buildCharacter, createPoser, heroDef }) {
  const pool = new Map();
  const ZERO = { x: 0, y: 0, z: 0 };

  function get(who) {
    const key = who === 'hero' ? `hero:${JSON.stringify(heroDef())}` : who;
    let a = pool.get(key);
    if (!a) {
      const def = who === 'hero' ? heroDef() : CAST[who] ?? characterById(who);
      const model = buildCharacter(assets, def);
      a = { model, poser: createPoser(model), puppet: makePuppet() };
      scene.add(model.root);
      pool.set(key, a);
    }
    return a;
  }

  return {
    // Stands a figure at p (feet on y), facing yawDeg (0 = +z).
    // pose 'perch': the rooftop crouch (the poser's own idle on a high ledge).
    place(who, p, yawDeg = 0, pose = 'stand') {
      const a = get(who);
      a.model.root.visible = true;
      const at = { x: p.x, y: p.y + 0.9, z: p.z };
      const yaw = (yawDeg * Math.PI) / 180;
      // One moving frame resets the poser's idle clock (a long idle on a roof becomes a crouch).
      setPuppet(a.puppet, at, { x: Math.sin(yaw) * 0.6, y: 0, z: Math.cos(yaw) * 0.6 }, yaw, 'ground');
      a.poser.update(a.puppet, 1 / 60, [], at);
      setPuppet(a.puppet, at, ZERO, yaw, 'ground');
      const frames = pose === 'perch' ? 200 : 110;
      for (let i = 0; i < frames; i++) a.poser.update(a.puppet, 1 / 60, [], at);
      a.model.updateGear?.(1 / 60, a.puppet);
      a.model.root.updateMatrixWorld(true);
      return a;
    },
    hideAll() { for (const a of pool.values()) a.model.root.visible = false; },
  };
}
