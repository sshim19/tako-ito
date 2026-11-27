/** Positions → lineRate, lineLen, dist, tension, slack. Checkable pure functions. */

import {
  ELASTIC,
  LINE_DECAY_TAU,
  LINE_LEN_MAX,
  LINE_LEN_MIN,
  LINE_SMOOTH_TAU,
  clamp,
  lineDesired,
} from "./constants.mjs";

export { lineDesired, yFromLineRate } from "./constants.mjs";

export function emptyLeft() {
  return { lineRate: 0 };
}

/**
 * Geometric line quantities. dist is metres from the stake at the origin.
 * tension is 0 at slack or taut-even, 1 at excess ≥ ELASTIC.
 */
export function lineGeometry(kiteX, kiteY, lineLen) {
  const dist = Math.hypot(Number(kiteX) || 0, Number(kiteY) || 0);
  const len = Number(lineLen) || 0;
  const excess = dist - len;
  const tension = clamp(excess / ELASTIC, 0, 1);
  const slack = Math.max(0, -excess);
  return { dist, excess, tension, slack };
}

export function integrateLine(lineLen, lineRate, dt) {
  const step = Math.max(0, Number(dt) || 0);
  return clamp((Number(lineLen) || 0) + (Number(lineRate) || 0) * step, LINE_LEN_MIN, LINE_LEN_MAX);
}

/**
 * Update signed lineRate from a left-hand sample (up pays out, down reels in).
 * When inactive or not landscape, lineRate decays with tau 0.16.
 */
export function updateLeft(left, pos, dt, active) {
  const next = { lineRate: Number(left?.lineRate) || 0 };
  const step = Math.max(0, Number(dt) || 0);
  if (!active || !pos) {
    next.lineRate = next.lineRate * Math.exp(-step / LINE_DECAY_TAU);
    return next;
  }
  const des = lineDesired(pos.y);
  if (step > 0) {
    next.lineRate += (des - next.lineRate) * (1 - Math.exp(-step / LINE_SMOOTH_TAU));
  }
  return next;
}
