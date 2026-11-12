import * as THREE from 'three';

/** Diffuse-only palette lighting: no metallic reflections or bump lookups. */
export function pixelMaterial(options = {}) {
  const { roughness, metalness, bumpMap, bumpScale, flatShading, ...diffuse } = options;
  return new THREE.MeshLambertMaterial({ ...diffuse, flatShading: true });
}
