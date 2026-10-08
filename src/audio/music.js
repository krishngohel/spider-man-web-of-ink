// The soundtrack: six looping tracks (CC0, credited in the end credits), crossfaded by what is
// happening: the title and the missions, the city by day and by night, Peter's quiet scenes, a
// street fight, a boss. Streamed by <audio> elements (no decoding of whole files up front), each
// with its own fade; nothing plays before the first user gesture (browsers require it).
const TRACKS = {
  mission: 'assets/music/mission.mp3', // Battle Theme A, cynicmusic
  day: 'assets/music/day.mp3',         // Urban Theme, MintoDog
  night: 'assets/music/night.mp3',     // Night Escape, Agecaf
  peter: 'assets/music/peter.mp3',     // Chill lofi inspired, omfgdude
  fight: 'assets/music/fight.mp3',     // Fight in the City, Umplix
  boss: 'assets/music/boss.mp3',       // Epic Boss Battle, Juhani Junkala
};
// How loud each track sits against the others (they were mastered differently).
const LEVEL = { mission: 0.7, day: 0.75, night: 0.8, peter: 0.85, fight: 0.62, boss: 0.62 };
// Seconds to fade in and out; a fight cuts in faster than it lets go.
const FADE_IN = { fight: 1.2, boss: 1.0 }, FADE_OUT = 2.5;

export function createMusic(getVolume, base = './') {
  const els = new Map();
  let want = null, unlocked = false, duck = 1;
  const el = (name) => {
    if (!els.has(name)) {
      const a = new Audio(base + TRACKS[name]);
      a.loop = true; a.preload = 'auto'; a.volume = 0;
      els.set(name, { a, k: 0 });
    }
    return els.get(name);
  };
  const unlock = () => { unlocked = true; if (want) el(want).a.play().catch(() => {}); };
  addEventListener('pointerdown', unlock, { once: true });
  addEventListener('keydown', unlock, { once: true });
  return {
    // Which track should play (a TRACKS key or null for silence).
    set(name) {
      if (name === want) return;
      want = name;
      if (name && unlocked) { const t = el(name); if (t.a.paused) { if (t.k <= 0.01) t.a.currentTime = 0; t.a.play().catch(() => {}); } }
    },
    // Lowered under dialogue and comics (0..1).
    duck(k) { duck = k; },
    update(dt) {
      const v = getVolume();
      const vol = (v.master ?? 1) * (v.music ?? 0.6);
      for (const [name, t] of els) {
        const on = name === want;
        t.k = Math.max(0, Math.min(1, t.k + (on ? dt / (FADE_IN[name] ?? 2) : -dt / FADE_OUT)));
        t.a.volume = Math.min(1, t.k * t.k * vol * LEVEL[name] * duck);
        if (!on && t.k <= 0 && !t.a.paused) t.a.pause();
      }
    },
    get current() { return want; },
  };
}
