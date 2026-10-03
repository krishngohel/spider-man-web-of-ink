// A sine-free hash for shaders (Dave Hoskins, "Hash without Sine"). fract(sin(x) * 43758.5) loses
// precision on large inputs and differs from one GPU to the next (Apple and mobile GPUs band it);
// this stays stable for world-scale coordinates. Returns 0 to 1.
export const HASH = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;
