// The colour of shadow across the city (spec G5, after Hi-Fi Rush's shadow colour volume): a small
// 3D grid over the island, sampled at each pixel's world position, giving the multiplier a surface
// takes in core shadow. Every district has its mood (teal by the harbour, magenta under Neon
// Square's signs, warm in Hell's Kitchen, cool steel in the Financial District, green in the
// park), shadows lighten and cool with height, and nothing falls below a value floor, so shadows
// are coloured, never black. Plain math (tested); the game wraps it in a Data3DTexture.

export const VOL = { nx: 16, ny: 8, nz: 16, top: 260 };
export const SHADOW_BASE = [0.56, 0.5, 0.68];
const HIGH = [0.66, 0.64, 0.78];
export const SHADOW_FLOOR = 0.35;

export const MOODS = {
  midtown: [0.56, 0.5, 0.68],
  hells: [0.66, 0.46, 0.6],
  chinatown: [0.66, 0.44, 0.56],
  harlem: [0.64, 0.5, 0.58],
  financial: [0.48, 0.54, 0.7],
  neon: [0.66, 0.42, 0.7],
  harbor: [0.42, 0.6, 0.66],
  upper: [0.52, 0.54, 0.72],
  park: [0.46, 0.62, 0.56],
  queens: [0.5, 0.6, 0.6],
};

// districts: [{ id, minX, maxX, minZ, maxZ }]. Returns { data: Uint8Array RGBA, box: [minX, minZ, sizeX, sizeZ], top }.
export function buildShadowVolume(districts) {
  const { nx, ny, nz, top } = VOL;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const d of districts) { minX = Math.min(minX, d.minX); minZ = Math.min(minZ, d.minZ); maxX = Math.max(maxX, d.maxX); maxZ = Math.max(maxZ, d.maxZ); }
  if (!districts.length) { minX = minZ = -1000; maxX = maxZ = 1000; }
  const pad = 200;
  minX -= pad; minZ -= pad; maxX += pad; maxZ += pad;
  const sx = maxX - minX, sz = maxZ - minZ;
  // Ground-level mood per column, then a 3x3 blur so district borders blend.
  const col = new Float32Array(nx * nz * 3);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = minX + ((ix + 0.5) / nx) * sx, z = minZ + ((iz + 0.5) / nz) * sz;
      const d = districts.find((q) => x >= q.minX && x < q.maxX && z >= q.minZ && z < q.maxZ);
      const m = (d && MOODS[d.id]) || SHADOW_BASE;
      col.set(m, (iz * nx + ix) * 3);
    }
  }
  const blur = new Float32Array(col.length);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const k = (jz * nx + jx) * 3;
        r += col[k]; g += col[k + 1]; b += col[k + 2]; n++;
      }
      const k = (iz * nx + ix) * 3;
      blur[k] = r / n; blur[k + 1] = g / n; blur[k + 2] = b / n;
    }
  }
  const data = new Uint8Array(nx * ny * nz * 4);
  for (let iy = 0; iy < ny; iy++) {
    const h = iy / (ny - 1);
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        // GL reads a 3D texture as x + nx * (y + ny * z), y being height.
        const k = (iz * nx + ix) * 3, o = ((iz * ny + iy) * nx + ix) * 4;
        for (let c = 0; c < 3; c++) {
          const v = Math.max(SHADOW_FLOOR, blur[k + c] + (HIGH[c] - blur[k + c]) * h * 0.8);
          data[o + c] = Math.round(Math.min(1, v) * 255);
        }
        data[o + 3] = 255;
      }
    }
  }
  return { data, box: [minX, minZ, sx, sz], top };
}
