/** windAt(x, y, flyT, params) and gustValue. Checkable pure functions. */

import { GUST_RAMP, PROFILE_X_FLOOR, PROFILE_X_SPAN, PROFILE_Y_CEILING, PROFILE_Y_FLOOR, PROFILE_Y_SPAN, bump } from "./constants.mjs";

export { bump };

/**
 * Smooth trapezoid envelope of a single event. Rise and fall are GUST_RAMP (0.60s).
 * 0 outside [t0, t0+dur). If dur is shorter than 2*ramp, the peak is reduced.
 */
export function eventEnvelope(t, t0, dur, ramp = GUST_RAMP) {
  const time = Number(t);
  const start = Number(t0);
  const length = Number(dur);
  if (!Number.isFinite(time) || !Number.isFinite(start) || !(length > 0)) return 0;
  if (time < start || time >= start + length) return 0;
  const u = time - start;
  const r = Math.max(1e-6, Number(ramp) || GUST_RAMP);
  const rise = Math.min(r, length / 2);
  if (u < rise) return u / rise;
  if (u > length - rise) return (start + length - time) / rise;
  return 1;
}

/** Sum of non-overlapping event envelopes times amplitude. 0 outside all events. */
export function gustValue(flyT, events) {
  if (!events || !events.length) return 0;
  let g = 0;
  for (const e of events) {
    g += (Number(e.amp) || 0) * eventEnvelope(flyT, e.t0, e.dur);
  }
  return g;
}

/**
 * Wind magnitude at (x, y) metres and flight time flyT, given daily params.
 * profileY / profileX peak in the day's band; gust is a signed factor on the product.
 */
export function windAt(x, y, flyT, params) {
  const bandY = Number(params?.bandY) || 0;
  const bandW = Number(params?.bandW) || 0;
  const bandX = Number(params?.bandX) || 0;
  const bandXw = Number(params?.bandXw) || 0;
  const windBase = Number(params?.windBase) || 0;
  const yBump = bump(y, bandY, bandW * 0.65);
  const bandHi = bandY + bandW / 2;
  const profileY = (Number(y) || 0) > bandHi
    ? PROFILE_Y_CEILING + (1 - PROFILE_Y_CEILING) * yBump
    : PROFILE_Y_FLOOR + PROFILE_Y_SPAN * yBump;
  const profileX = PROFILE_X_FLOOR + PROFILE_X_SPAN * bump(x, bandX, bandXw);
  const gust = gustValue(flyT, params?.events);
  const windMag = windBase * profileY * profileX * (1 + gust);
  return { windMag, profileY, profileX, gust };
}
