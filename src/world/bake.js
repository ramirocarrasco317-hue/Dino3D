import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collapses a small hierarchy of coloured meshes into a single vertex-coloured
 * mesh. Scenery props are built from a dozen primitives each; baking them cuts
 * the draw-call count by roughly an order of magnitude with no visual change -
 * flat-shaded parts keep their facets because the normals are baked in.
 */

const bakedMaterials = new Map();

function bakedMaterial(opts) {
  const key = JSON.stringify(opts);
  let m = bakedMaterials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      depthWrite: opts.depthWrite ?? true,
      side: opts.side ?? THREE.FrontSide,
    });
    bakedMaterials.set(key, m);
  }
  return m;
}

const _color = new THREE.Color();

/**
 * @param {THREE.Object3D} root      hierarchy to flatten (not modified)
 * @param {object}         [options] { castShadow, receiveShadow }
 * @returns {THREE.Mesh|THREE.Group} one mesh per material "bucket"
 */
export function bakeGroup(root, options = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  /** @type {Map<string, {opts:object, geos:THREE.BufferGeometry[]}>} */
  const buckets = new Map();

  root.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    const mat = node.material;
    // Emissive / transparent parts need their own bucket to keep their look.
    const opts = {
      roughness: mat.roughness ?? 0.85,
      metalness: mat.metalness ?? 0,
      transparent: !!mat.transparent,
      opacity: mat.opacity ?? 1,
      emissive: mat.emissive ? mat.emissive.getHex() : 0,
      emissiveIntensity: mat.emissiveIntensity ?? 1,
      side: mat.side ?? THREE.FrontSide,
    };
    const key = JSON.stringify(opts);

    let geo = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    if (mat.flatShading) geo.computeVertexNormals();

    const m = new THREE.Matrix4().multiplyMatrices(inv, node.matrixWorld);
    geo.applyMatrix4(m);

    // Drop anything the merge does not need; mismatched attribute sets abort it.
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    }
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((geo.attributes.position.count) * 2), 2));
    }

    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    _color.copy(mat.color);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = _color.r;
      colors[i * 3 + 1] = _color.g;
      colors[i * 3 + 2] = _color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    if (!buckets.has(key)) buckets.set(key, { opts, geos: [] });
    buckets.get(key).geos.push(geo);
  });

  const meshes = [];
  for (const { opts, geos } of buckets.values()) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, bakedMaterial(opts));
    mesh.castShadow = options.castShadow !== false && !opts.transparent;
    mesh.receiveShadow = options.receiveShadow !== false && !opts.transparent;
    meshes.push(mesh);
  }

  if (meshes.length === 1) return meshes[0];
  const g = new THREE.Group();
  for (const m of meshes) g.add(m);
  return g;
}

/** Bake in place: replaces `root`'s children with the flattened result. */
export function bakeInPlace(root, options) {
  const baked = bakeGroup(root, options);
  root.clear();
  root.add(baked);
  return root;
}
