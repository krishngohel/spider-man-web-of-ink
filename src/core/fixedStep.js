// Fixed-step accumulator. The simulation always advances in `step` slices, whatever the frame
// rate. A frame longer than maxSteps slices drops the rest: the game slows down for a moment
// instead of running ever more steps per frame (the spiral of death).
export function createFixedStep({ step = 1 / 240, maxSteps = 8 } = {}) {
  let acc = 0;
  return {
    step,
    advance(dt) {
      acc += Math.max(0, dt);
      let steps = 0;
      while (acc >= step - 1e-9 && steps < maxSteps) { acc -= step; steps++; }
      if (steps === maxSteps && acc >= step) acc = 0;
      return { steps, alpha: Math.min(1, Math.max(0, acc / step)) };
    },
    reset() { acc = 0; },
  };
}
