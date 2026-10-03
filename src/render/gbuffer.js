import * as THREE from 'three';

// The second colour attachment (spec G1): every material writes, besides its colour, an aux
// texel in the same pass: the view-space normal (octahedral, RG), an object id (B) and flags (A:
// 0 plain, 0.5 a surface that draws its own world-space pattern, 1 a character). The ink pass
// reads it for creases and object edges, so the scene is drawn once per frame, not twice.
// installGbufferChunks() patches three's shared shader chunks, so built-in materials (and every
// material built on them with onBeforeCompile) write it with no other change. Custom
// ShaderMaterials that draw into the colour target add AUX_DECL and AUX_WRITE_* themselves.
// Writes on a target with one attachment (the canvas, shadow maps) are simply dropped.
// Transparent materials write zero: blending then leaves the opaque surface's texel underneath.
// (A transparent object that still writes depth, a fading trail, keeps the surface's normal and id
// under its own depth: edges and fog there follow its depth with the background's aux. Harmless.)

export const AUX_DECL = /* glsl */ `
layout(location = 1) out highp vec4 gAux;
vec2 auxOct(vec3 n) {
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 p = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  return p * 0.5 + 0.5;
}`;
// For custom shaders: an opaque surface with no useful normal, or a see-through one.
export const AUX_WRITE_FLAT = 'gAux = vec4(0.5, 0.5, 0.0, 0.0);';
export const AUX_WRITE_NONE = 'gAux = vec4(0.0);';

let installed = false;
export function installGbufferChunks() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk;
  // Shared by both stages; the output only in the fragment stage (three defines gl_FragColor
  // there), with the defaults a material may override before the write.
  C.common += /* glsl */ `
varying vec3 vAuxWPos;
varying float vAuxId;
varying float vAuxFlag;   // 1 on characters (skinned; three defines USE_SKINNING in the vertex stage only)
#ifdef gl_FragColor
#define AUX_COMMON
${AUX_DECL}
float gAuxId = -1.0;
float gAuxFlags = 0.0;
#endif
`;
  // World position (instances included) and an id hashed from where the object sits.
  C.project_vertex += /* glsl */ `
#ifdef USE_INSTANCING
  vAuxWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  vec3 auxT = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
  vAuxWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vec3 auxT = modelMatrix[3].xyz;
#endif
  {
    vec3 p3 = fract(floor(auxT * 4.0) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    vAuxId = fract((p3.x + p3.y) * p3.z);
  }
#ifdef USE_SKINNING
  vAuxFlag = 1.0;
#else
  vAuxFlag = 0.0;
#endif
`;
  C.normal_fragment_begin += `
#ifndef AUX_NORMAL
#define AUX_NORMAL
#endif
`;
  // Only where common declared the output (custom shaders that include this chunk on its own,
  // the sky and the ink composite, write theirs by hand or not at all).
  C.colorspace_fragment += /* glsl */ `
#ifdef AUX_COMMON
{
  float auxId = gAuxId >= 0.0 ? gAuxId : vAuxId;
  // Characters: 1.0 when they wear a drawn outline (AUX_HULLED, set by addHullOutline: the ink pass
  // draws no creases on them), 0.92 otherwise (street enemies keep their crease lines).
  float auxFlags = gAuxFlags;
  if (vAuxFlag > 0.5) {
    auxFlags = 0.92;
    #ifdef AUX_HULLED
    auxFlags = 1.0;
    #endif
  }
  #ifdef OPAQUE
    #ifdef AUX_NORMAL
    gAux = vec4(auxOct(normalize(normal)), auxId, auxFlags);
    #else
    gAux = vec4(0.5, 0.5, auxId, auxFlags);
    #endif
  #else
  gAux = vec4(0.0);
  #endif
}
#endif
`;
}
