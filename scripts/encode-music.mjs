// Re-encodes the soundtrack from its raw CC0 sources (assets-src/music, not in the repo) into
// public/assets/music as stereo MP3 at a bitrate that still sounds clean through speakers and
// headphones (default 112 kbps; the game streams each track through an <audio> element).
//   node scripts/encode-music.mjs [--kbps 112] [--src assets-src/music] [--probe]
// --probe only prints what is in public/assets/music now. ffmpeg comes from PATH or, on Windows,
// the WinGet Gyan.FFmpeg package.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, renameSync } from 'node:fs';
import path from 'node:path';

// Game name -> source file (credits: src/ui/copy.js, src/audio/music.js).
export const MUSIC = {
  mission: 'battleThemeA.mp3', // Battle Theme A, cynicmusic
  day: 'urban_theme_bpm115.mp3', // Urban Theme, MintoDog
  night: 'Night_Escape_0.mp3', // Night Escape, Agecaf
  peter: 'ChillLofiR_0.mp3', // Chill lofi inspired, omfgdude
  fight: 'fight_in_the_city.wav', // Fight in the City, Umplix
  boss: 'Juhani_Junkala_-_Epic_Boss_Battle_Seamlessly_Looping.wav', // Epic Boss Battle, Juhani Junkala
};
const OUT = 'public/assets/music';

function findTool(name) {
  const onPath = spawnSync(name, ['-version'], { encoding: 'utf8' });
  if (onPath.status === 0) return name;
  const root = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages');
  if (existsSync(root)) {
    for (const pkg of readdirSync(root).filter((d) => d.startsWith('Gyan.FFmpeg'))) {
      for (const build of readdirSync(path.join(root, pkg))) {
        const exe = path.join(root, pkg, build, 'bin', `${name}.exe`);
        if (existsSync(exe)) return exe;
      }
    }
  }
  throw new Error(`${name} not found (install ffmpeg)`);
}
export function probe(file, ffprobe = findTool('ffprobe')) {
  const r = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=sample_rate,channels', '-of', 'json', file], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout);
  const s = j.streams?.[0] ?? {};
  return { duration: Number(j.format.duration), kbps: Math.round(Number(j.format.bit_rate) / 1000), rate: Number(s.sample_rate), channels: s.channels, bytes: statSync(file).size };
}

if (process.argv[1]?.endsWith('encode-music.mjs')) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const kbps = Number(opt('--kbps', 112)), src = opt('--src', 'assets-src/music');
  const ffprobe = findTool('ffprobe');
  if (args.includes('--probe')) {
    for (const name of Object.keys(MUSIC)) console.log(name, probe(path.join(OUT, `${name}.mp3`), ffprobe));
    process.exit(0);
  }
  const ffmpeg = findTool('ffmpeg');
  let before = 0, after = 0;
  for (const [name, file] of Object.entries(MUSIC)) {
    const from = path.join(src, file), to = path.join(OUT, `${name}.mp3`);
    if (!existsSync(from)) { console.error(`missing source ${from}`); process.exit(1); }
    before += existsSync(to) ? statSync(to).size : 0;
    const tmp = to + '.tmp.mp3';
    // Joint stereo MP3 at a fixed average rate, 44.1 kHz, no cover art or tags.
    const r = spawnSync(ffmpeg, ['-y', '-v', 'error', '-i', from, '-map', '0:a:0', '-map_metadata', '-1', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-joint_stereo', '1', tmp], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
    renameSync(tmp, to);
    after += statSync(to).size;
    const p = probe(to, ffprobe);
    console.log(`${name}: ${p.duration.toFixed(1)} s, ${p.kbps} kbps, ${(p.bytes / 1e6).toFixed(2)} MB`);
  }
  console.log(`music: ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB`);
}
