/**
 * Central tuning table. Everything gameplay-facing lives here so balance passes
 * never require touching systems code.
 */
export const CFG = {
  lanes: {
    x: [-2.45, 0, 2.45],
    changeTime: 0.24,       // seconds to slide between adjacent lanes
    tiltMax: 0.22,          // radians of body roll while strafing
  },

  run: {
    startSpeed: 15.0,       // m/s
    maxSpeed: 44.0,
    accel: 0.34,            // m/s per second
    // Difficulty ramps from 0 -> 1 across this speed window.
    diffFrom: 15.0,
    diffTo: 40.0,
  },

  jump: {
    gravity: 54.0,
    velocity: 19.0,
    // Extra downward pull once the jump apex is passed -> snappier arc.
    fallMultiplier: 1.45,
    // Holding the key a touch longer floats slightly higher.
    cutMultiplier: 2.15,
    coyoteTime: 0.09,
    bufferTime: 0.12,
  },

  duck: {
    minTime: 0.34,
    // Fast-fall when ducking mid-air.
    airSlamGravityMul: 2.6,
  },

  player: {
    // Collider is a box, in metres. Kept a little smaller than the visible
    // model on every axis so near misses read as near misses.
    width: 0.78,
    standHeight: 1.72,
    duckHeight: 0.92,
    depth: 0.78,
  },

  camera: {
    fov: 56,
    // Behind, above and slightly to the side of the dino. High enough that the
    // next two obstacle rows are always readable.
    offset: [1.75, 4.85, 10.4],
    lookAt: [0, 1.45, -13.0],
    lagPos: 7.5,            // smoothing rate
    lagLook: 9.0,
    fovBoost: 9,            // extra FOV at max speed
    shakeDecay: 5.5,
  },

  world: {
    chunkLength: 30,
    activeChunks: 8,
    despawnZ: 34,           // world z behind the camera where chunks recycle
    groundWidth: 40,
    fogNear: 52,
    fogFar: 190,
    biomeLength: 620,       // metres of a single biome before crossfade
    blendLength: 130,       // metres of crossfade between biomes
  },

  spawn: {
    // Gap between obstacle rows, in seconds of travel (lerped by difficulty).
    rowGapTime: [0.98, 0.66],
    // Chance a row blocks two lanes instead of one.
    doubleChance: [0.06, 0.46],
    tripleAirChance: [0.0, 0.14],   // 2 ground + 1 flyer style rows
    flyerChance: [0.10, 0.34],
    coinRunChance: 0.62,
    powerupEvery: [230, 420],       // metres between power-up spawns
  },

  coins: {
    value: 1,
    magnetRadius: 9.5,
    magnetSpeed: 26,
  },

  powerups: {
    shield: { duration: 9.0 },
    magnet: { duration: 9.5 },
    multiplier: { duration: 10.0, factor: 2 },
  },

  score: {
    perMetre: 1.0,
    perCoin: 15,
  },

  quality: {
    shadowMapSize: 2048,
    maxPixelRatio: 2,
  },
};

export const LANE_COUNT = CFG.lanes.x.length;
