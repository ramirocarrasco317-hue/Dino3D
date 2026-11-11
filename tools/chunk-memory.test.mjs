import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ChunkManager } from '../src/world/ChunkManager.js';
import { BIOMES, spawnProp } from '../src/world/Biomes.js';
import { Rng } from '../src/core/Random.js';

function setup() {
  const manager = Object.assign(Object.create(ChunkManager.prototype), {
    pools: new Map(), coinPool: [], powerPool: new Map(), propPool: new Map(),
  });
  return { manager, chunk: { group: new THREE.Group(), obstacles: [], coins: [], powerups: [], props: [] } };
}

function track(prop) {
  const geometries = new Map();
  const materials = new Map();
  prop.traverse((node) => {
    if (node.geometry && !geometries.has(node.geometry)) {
      geometries.set(node.geometry, 0);
      node.geometry.addEventListener('dispose', () => geometries.set(node.geometry, geometries.get(node.geometry) + 1));
    }
    if (node.material && !materials.has(node.material)) {
      materials.set(node.material, 0);
      node.material.addEventListener('dispose', () => materials.set(node.material, materials.get(node.material) + 1));
    }
  });
  return { geometries, materials };
}

test('discarded scenery releases its geometries in every biome', () => {
  const { manager, chunk } = setup();
  const rng = new Rng(0x3d2026);
  for (const biome of BIOMES) {
    manager.propPool.set(biome.id, Array.from({ length: 20 }, () => new THREE.Group()));
    for (let i = 0; i < 12; i++) {
      const prop = spawnProp(biome, rng);
      prop.userData.propKey = biome.id;
      const { geometries, materials } = track(prop);
      assert.ok(geometries.size > 0);
      chunk.group.add(prop);
      chunk.props.push(prop);
      manager._clearChunk(chunk);
      assert.equal(prop.parent, null);
      assert.equal(chunk.props.length, 0);
      assert.equal(manager.propPool.get(biome.id).length, 20);
      for (const count of geometries.values()) assert.equal(count, 1);
      // Baked materials are shared with scenery that is still alive.
      for (const count of materials.values()) assert.equal(count, 0);
    }
  }
});

test('scenery retained for reuse keeps its geometry and shared materials alive', () => {
  const { manager, chunk } = setup();
  const prop = spawnProp(BIOMES[0], new Rng(7));
  prop.userData.propKey = BIOMES[0].id;
  const { geometries, materials } = track(prop);
  chunk.group.add(prop);
  chunk.props.push(prop);
  manager._clearChunk(chunk);
  assert.equal(manager.propPool.get(BIOMES[0].id).pop(), prop);
  chunk.group.add(prop);
  assert.equal(prop.parent, chunk.group);
  for (const count of geometries.values()) assert.equal(count, 0);
  for (const count of materials.values()) assert.equal(count, 0);
});

test('recycling a chunk twice does not dispose scenery twice', () => {
  const { manager, chunk } = setup();
  const prop = spawnProp(BIOMES[3], new Rng(11));
  prop.userData.propKey = BIOMES[3].id;
  manager.propPool.set(BIOMES[3].id, Array.from({ length: 20 }, () => new THREE.Group()));
  const { geometries } = track(prop);
  chunk.group.add(prop);
  chunk.props.push(prop);
  manager._clearChunk(chunk);
  manager._clearChunk(chunk);
  for (const count of geometries.values()) assert.equal(count, 1);
});
