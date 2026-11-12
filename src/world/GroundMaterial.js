import * as THREE from 'three';

/**
 * Patches a MeshLambertMaterial so its colour cross-fades between two biome
 * colours along world Z. One shared material draws the whole track, and the
 * biome boundary sweeps smoothly toward the player instead of popping per
 * chunk.
 */
export function makeBiomeMaterial(opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    ...opts.extra,
  });

  const uniforms = {
    uColA: { value: new THREE.Color(0xffffff) },
    uColB: { value: new THREE.Color(0xffffff) },
    uZFar: { value: -200 },
    uZNear: { value: -100 },
  };
  mat.userData.biome = uniforms;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uColA = uniforms.uColA;
    shader.uniforms.uColB = uniforms.uColB;
    shader.uniforms.uZFar = uniforms.uZFar;
    shader.uniforms.uZNear = uniforms.uZNear;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vBiomeZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvBiomeZ = (modelMatrix * vec4(transformed, 1.0)).z;',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vBiomeZ;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uZFar;
uniform float uZNear;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float bt = 1.0 - smoothstep(uZFar, uZNear, vBiomeZ);
  diffuseColor.rgb *= mix(uColA, uColB, bt);
}`,
      );
  };

  return mat;
}

export function setBiomeColors(mat, colorA, colorB, zFar, zNear) {
  const u = mat.userData.biome;
  if (!u) return;
  u.uColA.value.copy(colorA);
  u.uColB.value.copy(colorB);
  u.uZFar.value = zFar;
  u.uZNear.value = zNear;
}
