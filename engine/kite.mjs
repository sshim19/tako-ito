/** Motion, snap and crash, ring tests, zoneFrac / altFrac / stability. */

import {
  CRASH_Y,
  ELASTIC,
  FALL_DRAG,
  GRAVITY,
  GROUND_Y,
  HOLD_TIME,
  LIFT_BUMP_HALF,
  LIFT_BUMP_MID,
  APPARENT_REEL,
  LIFT_GAIN,
  SLACK_CALL,
  STRESS_SNAP,
  STRESS_SNAP_TIME,
  STRESS_WARN,
  TILT_ACCEL,
  VEL_DAMP_X,
  WOBBLE_SCALE,
  bump,
  clamp,
  gradeForScore,
} from "./constants.mjs";
import { lineGeometry } from "./line.mjs";
import { windAt } from "./wind.mjs";

export { lineGeometry } from "./line.mjs";
export { windAt } from "./wind.mjs";

export function liftGainOf(tension) {
  const t = Number(tension) || 0;
  const lo = LIFT_BUMP_MID - LIFT_BUMP_HALF;
  const hi = LIFT_BUMP_MID + LIFT_BUMP_HALF;
  if (t >= lo && t <= hi) return 1;
  if (t < lo) return clamp(t / Math.max(lo, 1e-9), 0, 1);
  return bump(t, LIFT_BUMP_MID, LIFT_BUMP_HALF);
}

/** Instant altitude quality: 1 in the band, 0 at y=4, 0.70 well above the band. */
export function altInst(y, params) {
  const bandY = Number(params?.bandY) || 0;
  const bandW = Number(params?.bandW) || 0;
  const lo = bandY - bandW / 2;
  const hi = bandY + bandW / 2;
  const yy = Number(y) || 0;
  if (yy >= lo && yy <= hi) return 1;
  if (yy < lo) {
    if (yy <= 4) return 0;
    const span = lo - 4;
    if (!(span > 0)) return 0;
    return clamp((yy - 4) / span, 0, 1);
  }
  if (!(bandW > 0)) return 0.7;
  const t = (yy - hi) / bandW;
  if (t >= 1) return 0.7;
  return 1 - 0.3 * clamp(t, 0, 1);
}

export function zoneFracOf(rings, prog) {
  const list = rings || [];
  if (!list.length) return 0;
  let sum = 0;
  for (let i = 0; i < list.length; i++) {
    const p = prog && prog[i] ? prog[i] : { passed: false, holdT: 0 };
    if (list[i].kind === "pass") sum += p.passed ? 1 : 0;
    else sum += clamp((Number(p.holdT) || 0) / HOLD_TIME, 0, 1);
  }
  return sum / list.length;
}

export function wobbleOf(nAlt, m2Alt) {
  const n = Number(nAlt) || 0;
  if (n < 2) return 0;
  const v = Math.max(0, (Number(m2Alt) || 0) / (n - 1));
  return clamp(Math.sqrt(v) / WOBBLE_SCALE, 0, 1);
}

export function stabilityOf({ slackFrac, stressFrac, wobble, snapped, crashed }) {
  const penalty =
    0.28 * (Number(slackFrac) || 0) +
    0.22 * (Number(stressFrac) || 0) +
    0.2 * (Number(wobble) || 0) +
    0.3 * (snapped || crashed ? 1 : 0);
  return 1 - clamp(penalty, 0, 1);
}

export function scoreParts(s) {
  const zoneFrac = zoneFracOf(s?.params?.rings, s?.ringProg);
  const altFrac = Number(s?.altFrac) || 0;
  const slackFrac = Number(s?.slackFrac) || 0;
  const stressFrac = Number(s?.stressFrac) || 0;
  const wobble = wobbleOf(s?.nAlt, s?.m2Alt);
  const stability = stabilityOf({
    slackFrac,
    stressFrac,
    wobble,
    snapped: !!s?.snapped,
    crashed: !!s?.crashed,
  });
  const score = Math.round(100 * (0.38 * zoneFrac + 0.32 * altFrac + 0.3 * stability));
  return {
    zoneFrac,
    altFrac,
    slackFrac,
    stressFrac,
    wobble,
    stability,
    score,
    grade: gradeForScore(score),
  };
}

function welfordPush(n, mean, m2, x) {
  const n1 = n + 1;
  const d = x - mean;
  const mean1 = mean + d / n1;
  return { nAlt: n1, meanAlt: mean1, m2Alt: m2 + d * (x - mean1) };
}

export function emptyRingProg(rings) {
  return (rings || []).map(() => ({ passed: false, holdT: 0 }));
}

export function updateRings(rings, prog, kiteX, kiteY, dt) {
  const next = (prog || emptyRingProg(rings)).map((p) => ({
    passed: !!p.passed,
    holdT: Number(p.holdT) || 0,
  }));
  const step = Math.max(0, Number(dt) || 0);
  for (let i = 0; i < (rings || []).length; i++) {
    const ring = rings[i];
    const inside = Math.hypot(kiteX - ring.x, kiteY - ring.y) <= ring.r + 1e-12;
    if (ring.kind === "pass") {
      if (inside) next[i].passed = true;
    } else if (inside) {
      next[i].holdT = Math.min(HOLD_TIME, next[i].holdT + step);
    }
  }
  return next;
}

function applyConstraint(x, y, vx, vy, lineLen) {
  const maxDist = lineLen + ELASTIC;
  const dist = Math.hypot(x, y);
  if (!(dist > maxDist) || dist < 1e-9) return { x, y, vx, vy };
  const k = maxDist / dist;
  const nx = x * k;
  const ny = y * k;
  const d2 = Math.hypot(nx, ny) || 1;
  const rx = nx / d2;
  const ry = ny / d2;
  let nvx = vx;
  let nvy = vy;
  const radial = nvx * rx + nvy * ry;
  if (radial > 0) {
    nvx -= radial * rx;
    nvy -= radial * ry;
  }
  return { x: nx, y: ny, vx: nvx, vy: nvy };
}

/**
 * One flight physics step. Overrides (windMag, tension, liftGain) are for checks.
 * Does not award rings or scores; the caller does that.
 */
export function integrateFlight(body, dt, opts = {}) {
  const step = Math.max(0, Number(dt) || 0);
  let x = Number(body.kiteX) || 0;
  let y = Number(body.kiteY) || 0;
  let vx = Number(body.kiteVx) || 0;
  let vy = Number(body.kiteVy) || 0;
  const lineLen = Number(body.lineLen) || 0;
  const lineRate = Number(body.lineRate) || 0;
  const tilt = clamp(body.tilt, -1, 1);
  const snapped = !!body.snapped;
  const params = opts.params || body.params;
  const flyT = opts.flyT != null ? opts.flyT : body.flyT;

  const geo0 = lineGeometry(x, y, lineLen);
  const wind = opts.windMag != null ? { windMag: opts.windMag } : windAt(x, y, flyT, params);
  const windMag = Number(wind.windMag) || 0;
  const tension = opts.tension != null ? opts.tension : snapped ? 0 : geo0.tension;
  const gain = opts.liftGain != null ? opts.liftGain : liftGainOf(tension);
  const apparent = Math.max(0, windMag + APPARENT_REEL * Math.max(0, -lineRate));
  const lift = LIFT_GAIN * apparent * apparent * gain;
  const ay = lift - GRAVITY - FALL_DRAG * vy * Math.abs(vy);
  const ax = TILT_ACCEL * tilt * gain * (apparent / 5) - VEL_DAMP_X * vx;

  vx += ax * step;
  vy += ay * step;
  x += vx * step;
  y += vy * step;

  if (!snapped) {
    const c = applyConstraint(x, y, vx, vy, lineLen);
    x = c.x;
    y = c.y;
    vx = c.vx;
    vy = c.vy;
  }

  if (y < GROUND_Y) {
    y = GROUND_Y;
    if (vy < 0) vy = 0;
  }

  const geo = lineGeometry(x, y, lineLen);
  const tensionNow = snapped ? 0 : geo.tension;
  const slackNow = snapped ? Math.max(geo.slack, 0) : geo.slack;
  const windBase = Math.max(Number(params?.windBase) || 0, 0.1);
  const wind1 = opts.windMag != null ? windMag : windAt(x, y, flyT, params).windMag;
  const stress = snapped ? 0 : tensionNow * (wind1 / windBase);
  const crashed = y <= CRASH_Y && vy <= 0;

  return {
    kiteX: x,
    kiteY: y,
    kiteVx: vx,
    kiteVy: vy,
    dist: geo.dist,
    tension: tensionNow,
    slack: slackNow,
    stress,
    liftGain: gain,
    windMag: wind1,
    crashed,
  };
}

/**
 * Advance a flying kite: physics, snap timer, rings, and running averages.
 * Averages and rings freeze once snapped, crashed, or already scored.
 */
export function stepFlight(s, dt) {
  const step = Math.max(0, Number(dt) || 0);
  const locked = s.finishedAt != null && (s.snapped || s.crashed);
  const out = integrateFlight(
    {
      kiteX: s.kiteX,
      kiteY: s.kiteY,
      kiteVx: s.kiteVx,
      kiteVy: s.kiteVy,
      lineLen: s.lineLen,
      lineRate: s.left?.lineRate || 0,
      tilt: s.right?.tilt || 0,
      snapped: s.snapped,
      flyT: s.flyT,
      params: s.params,
    },
    step,
    { params: s.params, flyT: s.flyT },
  );

  s.kiteX = out.kiteX;
  s.kiteY = out.kiteY;
  s.kiteVx = out.kiteVx;
  s.kiteVy = out.kiteVy;
  s.dist = out.dist;
  s.tension = out.tension;
  s.slack = out.slack;
  s.stress = out.stress;

  if (s.snapped || s.crashed || s.finishedAt != null) {
    if (!s.crashed && out.crashed) s.crashed = true;
    return s;
  }

  if (!locked) {
    s.ringProg = updateRings(s.params.rings, s.ringProg, s.kiteX, s.kiteY, step);
    const t = Number(s.flyT) || 0;
    const t1 = t + step;
    const inst = altInst(s.kiteY, s.params);
    if (t1 > 1e-12) {
      s.altFrac = ((Number(s.altFrac) || 0) * t + inst * step) / t1;
      s.slackFrac = ((Number(s.slackFrac) || 0) * t + (s.slack > SLACK_CALL ? 1 : 0) * step) / t1;
      s.stressFrac = ((Number(s.stressFrac) || 0) * t + (s.stress >= STRESS_WARN ? 1 : 0) * step) / t1;
    }
    const w = welfordPush(Number(s.nAlt) || 0, Number(s.meanAlt) || 0, Number(s.m2Alt) || 0, s.kiteY);
    s.nAlt = w.nAlt;
    s.meanAlt = w.meanAlt;
    s.m2Alt = w.m2Alt;
    s.wobble = wobbleOf(s.nAlt, s.m2Alt);
    s.zoneFrac = zoneFracOf(s.params.rings, s.ringProg);
    s.stability = stabilityOf({
      slackFrac: s.slackFrac,
      stressFrac: s.stressFrac,
      wobble: s.wobble,
      snapped: false,
      crashed: false,
    });

    if (s.stress >= STRESS_SNAP) s.stressHighT = (Number(s.stressHighT) || 0) + step;
    else s.stressHighT = 0;
    if (s.stressHighT + 1e-12 >= STRESS_SNAP_TIME) s.snapped = true;
    if (out.crashed) s.crashed = true;
  }
  return s;
}
