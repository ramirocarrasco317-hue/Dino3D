import { CFG, LANE_COUNT } from '../core/Config.js';

/**
 * A deliberately simple bot that plays the game. It exists for QA: long
 * unattended runs surface generation faults ("this row was unbeatable"),
 * pooling leaks and late-game performance far faster than hand testing, and it
 * keeps the review screenshots showing a live run instead of a wipeout.
 *
 * It is not shipped behaviour - nothing in the game references it.
 */
export function makeAutopilot(options = {}) {
  const react = options.react ?? 0.55;      // seconds of lead time for jump/duck
  const scan = options.scan ?? 2.2;         // seconds of lookahead for lane choice
  const state = { lastLaneSwitch: 0, t: 0, unavoidable: 0, deaths: 0 };

  return function tick(dt, game) {
    state.t += dt;
    const p = game.player;
    const speed = Math.max(1, game.speed);
    const lookZ = -speed * scan;

    // clearance[lane] = distance (m) to the next thing that blocks that lane
    const clearance = new Array(LANE_COUNT).fill(Infinity);
    /** @type {Array<{kind:string,dist:number}|null>} */
    const nearest = new Array(LANE_COUNT).fill(null);

    game.chunks.forEachObstacleNear(lookZ, -0.4, (o, wz) => {
      const col = o.userData.col;
      if (!col || o.userData.hit) return;
      const dist = -wz;
      // Map world X back to a lane index.
      let lane = 0;
      let best = Infinity;
      for (let i = 0; i < LANE_COUNT; i++) {
        const d = Math.abs(CFG.lanes.x[i] - o.position.x);
        if (d < best) { best = d; lane = i; }
      }
      if (best > 1.4) return;
      const kind = o.userData.kind;
      if (kind === 'jump' && col.y <= 0.05) {
        // Ground obstacle: blocks the lane unless jumped.
        if (dist < clearance[lane]) { clearance[lane] = dist; nearest[lane] = { kind: 'ground', dist, h: col.h }; }
      } else if (dist < clearance[lane]) {
        clearance[lane] = dist;
        nearest[lane] = { kind, dist, h: col.h };
      }
    });

    const lane = p.targetLane;
    const here = nearest[lane];
    const reactDist = speed * react;

    // 1) Vertical answers first - they are always cheaper than a lane change.
    if (here && here.dist < reactDist) {
      if (here.kind === 'duck') {
        if (p.grounded && p.state !== 'duck') game.player.requestDuck();
        return;
      }
      if (here.dist < speed * 0.42 && p.grounded) {
        game.player.requestJump();
        return;
      }
    } else if (p.state === 'duck' && p.duckTimer <= 0) {
      game.player.releaseDuck();
    }

    // 2) Drift toward the roomiest reachable lane.
    if (state.t - state.lastLaneSwitch > 0.24) {
      const options2 = [lane - 1, lane + 1].filter((l) => l >= 0 && l < LANE_COUNT);
      let bestLane = lane;
      let bestScore = scoreLane(clearance[lane], nearest[lane]) + 3; // stickiness
      for (const l of options2) {
        const sc = scoreLane(clearance[l], nearest[l]);
        if (sc > bestScore) { bestScore = sc; bestLane = l; }
      }
      if (bestLane !== lane) {
        game.player.moveLane(bestLane > lane ? 1 : -1);
        state.lastLaneSwitch = state.t;
      }
    }
  };

  function scoreLane(clear, info) {
    if (!info) return 100;
    // A duckable flyer barely costs anything; a wall costs a lot up close.
    const penalty = info.kind === 'duck' ? 6 : 22;
    return Math.min(100, clear) - penalty * Math.max(0, 1 - clear / 26);
  }
}
