import * as THREE from 'three';

// A Mac's Retina screen at full density is about twice the pixels of 1080p on a fraction of the GPU,
// so Macs start at 1.25x (dynamic resolution still drops lower when frames run late).
const MAC_CAP = 1.25;
export function pixelRatioCap(quality, userAgent = '', dpr = 1) {
  const mac = /Macintosh|Mac OS X|MacIntel/.test(userAgent);
  return Math.min(dpr, quality.pixelRatioCap, mac ? MAC_CAP : Infinity);
}

export function createRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatioCap(quality, navigator.userAgent, window.devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 1);
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  // Safari draws through Metal, which only knows the first-vertex convention for flat varyings;
  // under GL's default (last vertex) it rewrites index buffers on the fly, which can turn the city's
  // flat-shaded draws from milliseconds into seconds. Our flat values are the same on every vertex
  // of a face, so the convention does not change the picture.
  const gl = renderer.getContext();
  const pv = gl.getExtension('WEBGL_provoking_vertex');
  if (pv) pv.provokingVertexWEBGL(pv.FIRST_VERTEX_CONVENTION_WEBGL);
  return renderer;
}
