// Shrinks the mocap clip files in public/assets in place (safe to run more than once; run it again
// after scripts/mixamo-clips.mjs rebuilds a set):
// - drops the tracks the game throws away at load (scale everywhere, position on anything but the
//   pelvis; see sanitizeClip in src/hero/model.js),
// - stores rotations as normalized 16-bit (a quaternion component off by at most 1/32767),
// - merges identical data, drops anything nothing points at,
// - packs the binary with EXT_meshopt_compression, lossless (no filters): about half the bytes.
//   The game decodes it with three's MeshoptDecoder (loadCombatClips in src/hero/model.js).
// Then check nothing moved: node scripts/clip-compare.mjs <before.glb> <after.glb>
//   node scripts/optimize-assets.mjs [file ...] [--out dir]
// anims1.glb and anims2.glb (the Quaternius sets on the boot path) are left as they are: other
// tools read them raw, and they are small.
import path from 'node:path';
import { stat, rename, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const DIR = 'public/assets';
export const CLIP_FILES = ['anims_combat.glb', 'anims_social.glb'];

export async function clipIO() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
}

function dropUnusedTracks(doc) {
  let n = 0;
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      const p = ch.getTargetPath();
      if (p === 'scale' || (p === 'translation' && ch.getTargetNode()?.getName() !== 'pelvis')) {
        const s = ch.getSampler();
        ch.dispose();
        if (s && !s.listParents().some((x) => x.propertyType === 'AnimationChannel')) s.dispose();
        n++;
      }
    }
  }
  return n;
}

// Float rotations to normalized SHORT (core glTF allows normalized integer rotation outputs; three's
// GLTFLoader scales them back).
function quantizeRotations(doc) {
  const done = new Set();
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      if (ch.getTargetPath() !== 'rotation') continue;
      const out = ch.getSampler().getOutput();
      if (done.has(out) || out.getComponentType() !== 5126) continue;
      done.add(out);
      const src = out.getArray();
      const q = new Int16Array(src.length);
      for (let i = 0; i < src.length; i += 4) {
        // Unit length first, so the rounding is the only error.
        const l = Math.hypot(src[i], src[i + 1], src[i + 2], src[i + 3]) || 1;
        for (let k = 0; k < 4; k++) q[i + k] = Math.round(Math.max(-1, Math.min(1, src[i + k] / l)) * 32767);
      }
      out.setArray(q).setNormalized(true);
    }
  }
}

function dropOrphans(doc) {
  for (const a of doc.getRoot().listAccessors()) {
    if (a.listParents().every((p) => p === doc.getRoot())) a.dispose();
  }
}

export async function optimizeAnims(file, outDir = DIR) {
  const io = await clipIO();
  const src = path.join(DIR, file);
  const before = (await stat(src)).size;
  const doc = await io.read(src);
  const dropped = dropUnusedTracks(doc);
  // No resample(): on these clips it moved fast spins (a hurricane kick's pelvis) by 5 degrees, and
  // giving every track its own key times grows the JSON.
  quantizeRotations(doc);
  await doc.transform(dedup({ propertyTypes: ['Accessor'] }), prune());
  dropOrphans(doc);
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const dst = path.join(outDir, file);
  // One binary file, written whole then renamed (io.write would pick the format from the temp
  // name and split it into .gltf JSON plus a .bin).
  await writeFile(dst + '.tmp', await io.writeBinary(doc));
  await rename(dst + '.tmp', dst);
  const after = (await stat(dst)).size;
  console.log(`${file}: ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB (${dropped} unused tracks dropped)`);
}

if (process.argv[1]?.endsWith('optimize-assets.mjs')) {
  const args = process.argv.slice(2);
  const o = args.indexOf('--out');
  const outDir = o >= 0 ? args.splice(o, 2)[1] : DIR;
  for (const f of args.length ? args : CLIP_FILES) await optimizeAnims(f, outDir);
}
