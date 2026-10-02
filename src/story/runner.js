// Walks the story steps against the save (pure, unit tested). The save keeps the current step id
// and every id done. The current step is the saved one while it exists and is not done; otherwise
// the step after the last one done (so steps added in later updates slot in), or, for a save whose
// step id no longer exists and nothing done yet, the start of that id's act.

export function currentIndex(steps, story) {
  const i = steps.findIndex((s) => s.id === story.step);
  if (i >= 0 && !story.done.includes(story.step)) return i;
  let last = -1;
  steps.forEach((s, k) => { if (story.done.includes(s.id)) last = k; });
  if (i < 0 && last < 0 && typeof story.step === 'string') {
    const act = story.step.split('.')[0];
    const k = steps.findIndex((s) => s.act === act);
    return k >= 0 ? k : 0;
  }
  return last + 1;
}

export function createStoryRunner(steps, story) {
  let index = currentIndex(steps, story);
  const sync = () => { if (steps[index]) story.step = steps[index].id; };
  sync();
  return {
    get index() { return index; },
    get step() { return steps[index] ?? null; },
    get finished() { return index >= steps.length; },
    get progress() { return Math.min(1, index / steps.length); },
    // Marks the current step done (only the current one: events for an old step are ignored).
    complete(id) {
      const s = steps[index];
      if (!s || s.id !== id) return false;
      if (!story.done.includes(id)) story.done.push(id);
      index++;
      sync();
      return true;
    },
    // Chapter select and the ?at= dev entry: every step before this one counts as done.
    jump(id) {
      const k = steps.findIndex((s) => s.id === id);
      if (k < 0) return false;
      story.done = steps.slice(0, k).map((s) => s.id);
      index = k;
      sync();
      return true;
    },
    isDone: (id) => story.done.includes(id),
  };
}
