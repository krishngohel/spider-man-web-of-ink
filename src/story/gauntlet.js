// The Villain Gauntlet (spec 12): every boss again, back to back, each in his own arena, timed.
// A post-game mode, not a story beat: between fights the screen fades and you start the next one
// at its arena. Medals for the total time (seconds, lower is better).

export const GAUNTLET = [
  { boss: 'kingpin', site: 'fiskRoof' },
  { boss: 'shocker', site: 'exchangeFront' },
  { boss: 'vulture', site: 'bugleRoof' },
  { boss: 'rhino', site: 'hellsStreet', variant: 'duo' },
  { boss: 'electro', site: 'powerRoof' },
  { boss: 'scorpion', site: 'bridgeDeck' },
  { boss: 'mysterio', site: 'neonPlaza', variant: 'rematch' },
  { boss: 'lizard', site: 'zooPlaza' },
  { boss: 'kraven', site: 'parkLawn' },
  { boss: 'sandman', site: 'shipyard' },
  { boss: 'venom', site: 'churchRoof' },
  { boss: 'ock', site: 'oscorpFront' },
  { boss: 'goblin', site: 'bridgeDeck' },
].map((g, i) => ({ id: `gauntlet.${String(i + 1).padStart(2, '0')}.${g.boss}`, act: 'gauntlet', type: 'boss', text: `Gauntlet ${i + 1} of 13`, ...g }));

// Total seconds for each medal (bronze is any finish).
export const GAUNTLET_MEDALS = { silver: 1500, gold: 1100, ultimate: 850 };
export const gauntletMedal = (t) => (t <= GAUNTLET_MEDALS.ultimate ? 4 : t <= GAUNTLET_MEDALS.gold ? 3 : t <= GAUNTLET_MEDALS.silver ? 2 : 1);

// New Game+ (spec 12): the story from the start on Ultimate, keeping everything you earned.
export function newGamePlus(old, slot, fresh) {
  const s = fresh;
  s.slot = slot;
  s.progress = JSON.parse(JSON.stringify(old.progress));
  s.collect = JSON.parse(JSON.stringify(old.collect));
  s.activities = JSON.parse(JSON.stringify(old.activities));
  s.world.stations = [...old.world.stations];
  s.world.districts = [...old.world.districts];
  s.postGame = { ...old.postGame, ngPlus: (old.postGame?.ngPlus ?? 0) + 1 };
  // The roster and the Anti-Venom suit stay open (they were earned at the epilogue).
  s.story.choices = { ...old.story.choices, completedOnce: true };
  return s;
}
