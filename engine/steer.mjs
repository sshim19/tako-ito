/** Positions → tilt. Checkable pure functions. */

import { TILT_DECAY_TAU, TILT_SMOOTH_TAU, tiltDesired } from "./constants.mjs";

export { tiltDesired, xFromTilt } from "./constants.mjs";

export function emptyRight() {
  return { tilt: 0 };
}

/**
 * Update tilt from a right-hand sample (x only; left is negative).
 * When inactive or not landscape, tilt decays with tau 0.16.
 */
export function updateRight(right, pos, dt, active) {
  const next = { tilt: Number(right?.tilt) || 0 };
  const step = Math.max(0, Number(dt) || 0);
  if (!active || !pos) {
    next.tilt = next.tilt * Math.exp(-step / TILT_DECAY_TAU);
    return next;
  }
  const des = tiltDesired(pos.x);
  if (step > 0) {
    next.tilt += (des - next.tilt) * (1 - Math.exp(-step / TILT_SMOOTH_TAU));
  }
  return next;
}
