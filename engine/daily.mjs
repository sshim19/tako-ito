/** dailyParams(rngState) → { params, rngState }. Idempotent daily wind and rings. */

import {
  BAND_W_MAX,
  BAND_W_MIN,
  BAND_XW_MAX,
  BAND_XW_MIN,
  BAND_X_MAX,
  BAND_X_MIN,
  BAND_Y_MAX,
  BAND_Y_MIN,
  EVENT_COUNT_MAX,
  EVENT_COUNT_MIN,
  EVENT_DUR_MAX,
  EVENT_DUR_MIN,
  EVENT_FIRST,
  EVENT_GAP_MIN,
  EVENT_LAST,
  HOLD_R_MAX,
  HOLD_R_MIN,
  KITE_START_X,
  KITE_START_Y,
  PASS_R_MAX,
  PASS_R_MIN,
  RING_DIST_MAX,
  RING_DIST_MIN,
  RING_Y_MAX,
  RING_Y_MIN,
  WIND_BASE_JITTER,
  WIND_TABLE,
  clamp,
} from "./constants.mjs";
import { rngRange, rngStep } from "./rng.mjs";

function pickRow(a, table) {
  const step = rngStep(a);
  const i = Math.min(table.length - 1, Math.floor(step.value * table.length));
  return { row: table[i], a: step.a };
}

function clampPoint(x, y, dMin, dMax, yMin, yMax) {
  let px = Number(x);
  let py = clamp(y, yMin, yMax);
  let d = Math.hypot(px, py);
  if (d < 1e-6) {
    px = dMin;
    py = 0;
    d = dMin;
  }
  if (d < dMin) {
    const k = dMin / d;
    px *= k;
    py *= k;
  } else if (d > dMax) {
    const k = dMax / d;
    px *= k;
    py *= k;
  }
  py = clamp(py, yMin, yMax);
  d = Math.hypot(px, py);
  if (d < dMin || d > dMax) {
    const t = clamp(d, dMin, dMax);
    const ang = Math.atan2(py, px);
    px = t * Math.cos(ang);
    py = clamp(t * Math.sin(ang), yMin, yMax);
    const d2 = Math.hypot(px, py);
    if (d2 < dMin) {
      const ang2 = Math.atan2(py, px || 1);
      px = dMin * Math.cos(ang2);
      py = clamp(dMin * Math.sin(ang2), yMin, yMax);
    } else if (d2 > dMax) {
      const ang2 = Math.atan2(py, px || 1);
      px = dMax * Math.cos(ang2);
      py = clamp(dMax * Math.sin(ang2), yMin, yMax);
    }
  }
  return { x: px, y: py };
}

function ringDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** True if two rings' discs overlap (centers closer than the sum of radii). */
export function ringsOverlap(rings) {
  const list = rings || [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (ringDist(list[i], list[j]) < list[i].r + list[j].r - 1e-9) return true;
    }
  }
  return false;
}

function separateRings(rings, dMin, dMax, yMin, yMax) {
  const out = rings.map((r) => ({ ...r }));
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const need = out[i].r + out[j].r + 1.2;
        const d = ringDist(out[i], out[j]);
        if (d >= need) continue;
        const nx = out[j].x - out[i].x;
        const ny = out[j].y - out[i].y;
        const len = Math.hypot(nx, ny) || 1;
        const push = (need - d) / 2;
        out[i].x -= (nx / len) * push;
        out[i].y -= (ny / len) * push;
        out[j].x += (nx / len) * push;
        out[j].y += (ny / len) * push;
        moved = true;
      }
    }
    for (const r of out) {
      const p = clampPoint(r.x, r.y, dMin, dMax, yMin, yMax);
      r.x = p.x;
      r.y = p.y;
    }
    if (!moved) break;
  }
  return out;
}

function placeRings(a, wind, band) {
  const yMax = wind === "light" ? Math.min(RING_Y_MAX, band.bandY + band.bandW * 0.5) : RING_Y_MAX;
  const yMin = RING_Y_MIN;
  const dMax = wind === "strong" ? 58 : Math.min(RING_DIST_MAX, 66);
  const dMin = RING_DIST_MIN;
  const bandLo = band.bandY - band.bandW / 2;
  const bandHi = band.bandY + band.bandW / 2;

  let r = rngRange(a, HOLD_R_MIN, HOLD_R_MAX);
  a = r.a;
  const holdR = r.value;
  r = rngRange(a, bandLo + 0.4, bandHi - 0.4);
  a = r.a;
  let holdY = r.value;
  r = rngRange(a, band.bandX - band.bandXw * 0.35, band.bandX + band.bandXw * 0.35);
  a = r.a;
  let holdX = r.value;
  const holdP = clampPoint(holdX, holdY, dMin, dMax, Math.max(yMin, bandLo - 0.2), Math.min(yMax, bandHi + 0.2));
  const hold = { x: holdP.x, y: holdP.y, r: holdR, kind: "hold" };

  const sx = KITE_START_X;
  const sy = KITE_START_Y;
  const vx = hold.x - sx;
  const vy = hold.y - sy;

  function along(frac, side, radius, yFloor) {
    const bx = sx + vx * frac;
    const by = sy + vy * frac;
    const len = Math.hypot(vx, vy) || 1;
    // Keep side offsets mostly horizontal so rings do not drop below the climb.
    const px = (-vy / len) * side * 0.35 + (vx / len) * 0;
    const py = (vx / len) * side * 0.35;
    const p = clampPoint(bx + px, Math.max(by + py, yFloor), dMin, dMax, Math.max(yMin, yFloor), yMax);
    return { x: p.x, y: p.y, r: radius, kind: "pass" };
  }

  r = rngRange(a, PASS_R_MIN, PASS_R_MAX);
  a = r.a;
  const r1 = r.value;
  r = rngRange(a, 0.22, 0.36);
  a = r.a;
  const f1 = r.value;
  r = rngRange(a, 4, 8);
  a = r.a;
  let signStep = rngStep(a);
  a = signStep.a;
  const s1 = r.value * (signStep.value < 0.5 ? -1 : 1);

  r = rngRange(a, PASS_R_MIN, PASS_R_MAX);
  a = r.a;
  const r2 = r.value;
  r = rngRange(a, 0.52, 0.72);
  a = r.a;
  const f2 = r.value;
  r = rngRange(a, 3.5, 8);
  a = r.a;
  const s2 = -Math.sign(s1) * r.value;

  r = rngRange(a, PASS_R_MIN, PASS_R_MAX);
  a = r.a;
  const r3 = r.value;
  r = rngRange(a, 1.40, 1.72);
  a = r.a;
  const f3 = r.value;
  r = rngRange(a, 5, 11);
  a = r.a;
  const s3 = r.value * (s1 >= 0 ? 1 : -1);

  const pass1 = along(f1, s1, r1, 18);
  const pass2 = along(f2, s2, r2, Math.max(22, pass1.y - 1));
  // Last pass sits past the hold, far enough that a careful tour takes time,
  // but close enough that a skilled player can come back for the hold.
  const holdAng = Math.atan2(hold.y, hold.x || 1);
  const sideSign = s1 >= 0 ? 1 : -1;
  const swing = 0.35 + 0.25 * Math.min(1, Math.abs(s3) / 11);
  const dist3 = Math.min(dMax, Math.max(dMin + 8, Math.hypot(hold.x, hold.y) + 30));
  const raw3 = {
    x: dist3 * Math.cos(holdAng + sideSign * swing),
    y: dist3 * Math.sin(holdAng + sideSign * swing),
  };
  const p3 = clampPoint(raw3.x, Math.max(raw3.y, bandLo), dMin, dMax, Math.max(yMin, bandLo - 1), Math.min(yMax, bandHi + 8));
  let pass3 = { x: p3.x, y: p3.y, r: r3, kind: "pass" };
  void f3;
  let rings = [pass1, pass2, hold, pass3];
  rings = separateRings(rings, dMin, dMax, yMin, yMax);

  // Keep the hold ring in (or on the edge of) the band after separation.
  const h = rings.find((x) => x.kind === "hold");
  if (h) {
    h.y = clamp(h.y, bandLo - 0.15, bandHi + 0.15);
    const p = clampPoint(h.x, h.y, dMin, dMax, yMin, yMax);
    h.x = p.x;
    h.y = clamp(p.y, bandLo - 0.15, Math.min(yMax, bandHi + 0.15));
  }
  rings = separateRings(rings, dMin, dMax, yMin, yMax);
  const hold2 = rings.find((x) => x.kind === "hold");
  if (hold2) {
    hold2.y = clamp(hold2.y, bandLo - 0.2, Math.min(yMax, bandHi + 0.2));
  }
  return { rings, a };
}

function placeEvents(a, windRow) {
  let r = rngStep(a);
  a = r.a;
  const n = EVENT_COUNT_MIN + Math.min(EVENT_COUNT_MAX - EVENT_COUNT_MIN, Math.floor(r.value * (EVENT_COUNT_MAX - EVENT_COUNT_MIN + 1)));

  const durs = [];
  for (let i = 0; i < n; i++) {
    r = rngRange(a, EVENT_DUR_MIN, EVENT_DUR_MAX);
    a = r.a;
    durs.push(r.value);
  }

  const span = EVENT_LAST - EVENT_FIRST;
  let totalDur = durs.reduce((s, d) => s + d, 0);
  const minGaps = EVENT_GAP_MIN * (n + 1);
  if (totalDur + minGaps > span) {
    const scale = (span - minGaps) / totalDur;
    for (let i = 0; i < n; i++) durs[i] = Math.max(EVENT_DUR_MIN, durs[i] * scale);
    totalDur = durs.reduce((s, d) => s + d, 0);
  }
  let slack = Math.max(0, span - totalDur);
  const gaps = [];
  let leftover = slack;
  for (let i = 0; i < n + 1; i++) {
    const remain = n - i;
    if (remain === 0) {
      gaps.push(leftover);
      break;
    }
    r = rngStep(a);
    a = r.a;
    const floor = EVENT_GAP_MIN;
    const room = leftover - floor * (remain + 1);
    const take = floor + Math.max(0, room) * r.value * (2 / (remain + 2));
    const g = Math.min(leftover - floor * remain, take);
    gaps.push(g);
    leftover -= g;
  }

  const events = [];
  let t = EVENT_FIRST + gaps[0];
  for (let i = 0; i < n; i++) {
    r = rngStep(a);
    a = r.a;
    const isGust = r.value < 0.55;
    let ampR;
    if (isGust) ampR = rngRange(a, windRow.gust[0], windRow.gust[1]);
    else ampR = rngRange(a, windRow.lull[0], windRow.lull[1]);
    a = ampR.a;
    const amp = isGust ? ampR.value : -ampR.value;
    const dur = durs[i];
    let t0 = t;
    const end = t0 + dur;
    if (end > EVENT_LAST - 1e-9) t0 = Math.max(EVENT_FIRST, EVENT_LAST - dur);
    events.push({ t0, dur, amp });
    t = t0 + dur + (gaps[i + 1] || EVENT_GAP_MIN);
  }

  // Guarantee at least one gust and one lull when n >= 2.
  if (n >= 2) {
    const hasGust = events.some((e) => e.amp > 0);
    const hasLull = events.some((e) => e.amp < 0);
    if (!hasGust || !hasLull) {
      const evStep = rngStep(a);
      a = evStep.a;
      if (!hasGust) {
        const e = events[0];
        const mag = Math.abs(e.amp);
        e.amp = clamp(mag, windRow.gust[0], windRow.gust[1]);
      }
      if (!hasLull) {
        const e = events[events.length - 1];
        const mag = Math.abs(e.amp);
        e.amp = -clamp(mag, windRow.lull[0], windRow.lull[1]);
      }
    }
  }
  return { events, a };
}

/**
 * Stream order: wind → windBase jitter → bandX, bandY, bandXw, bandW → events → rings.
 */
export function dailyParams(rngState) {
  let a = rngState >>> 0;
  const picked = pickRow(a, WIND_TABLE);
  a = picked.a;
  const windRow = picked.row;

  let r = rngRange(a, -WIND_BASE_JITTER, WIND_BASE_JITTER);
  a = r.a;
  const windBase = windRow.windBase + r.value;

  r = rngRange(a, BAND_X_MIN, BAND_X_MAX);
  a = r.a;
  const bandX = r.value;
  r = rngRange(a, BAND_Y_MIN, BAND_Y_MAX);
  a = r.a;
  const bandY = r.value;
  r = rngRange(a, BAND_XW_MIN, BAND_XW_MAX);
  a = r.a;
  const bandXw = r.value;
  r = rngRange(a, BAND_W_MIN, BAND_W_MAX);
  a = r.a;
  const bandW = r.value;

  const ev = placeEvents(a, windRow);
  a = ev.a;
  const placed = placeRings(a, windRow.wind, { bandX, bandY, bandXw, bandW });
  a = placed.a;

  return {
    params: {
      wind: windRow.wind,
      windBase,
      bandX,
      bandY,
      bandXw,
      bandW,
      events: ev.events,
      rings: placed.rings,
    },
    rngState: a,
  };
}
