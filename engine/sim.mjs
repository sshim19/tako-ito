/** tick(state, input, dt) → state. Release, fly, reveal, finish. No DOM. */

import {
  DAILY_WIND_TIME,
  FINISH_MIN,
  FIXED_DT,
  FLY_TIME,
  KITE_START_X,
  KITE_START_Y,
  LINE_LEN_MIN,
  LINE_LEN_START,
  MAX_DT,
  RELEASE_TIME,
  RELEASE_X0,
  RELEASE_Y0,
  REVEAL_TIME,
  SNAP_REVEAL_DELAY,
  lerp,
  smoothstep,
} from "./constants.mjs";
import { dailyParams } from "./daily.mjs";
import { emptyLeft, integrateLine, lineGeometry, updateLeft } from "./line.mjs";
import { hashSeed } from "./rng.mjs";
import { emptyRight, updateRight } from "./steer.mjs";
import { emptyRingProg, scoreParts, stepFlight } from "./kite.mjs";

export { scoreParts };

export function previewScore(s) {
  if (!s) return 0;
  return scoreParts(s).score;
}

function cloneState(s) {
  return {
    ...s,
    params: s.params
      ? {
          ...s.params,
          events: (s.params.events || []).map((e) => ({ ...e })),
          rings: (s.params.rings || []).map((r) => ({ ...r })),
        }
      : s.params,
    left: { ...(s.left || emptyLeft()) },
    right: { ...(s.right || emptyRight()) },
    ringProg: (s.ringProg || []).map((p) => ({ passed: !!p.passed, holdT: Number(p.holdT) || 0 })),
  };
}

function hands(input) {
  const leftOn = !!input?.left?.active;
  const rightOn = !!input?.right?.active;
  return {
    leftOn,
    rightOn,
    leftPos: leftOn ? { x: Number(input.left.x), y: Number(input.left.y) } : null,
    rightPos: rightOn ? { x: Number(input.right.x), y: Number(input.right.y) } : null,
  };
}

export function releasePose(phaseT) {
  const u = smoothstep((Number(phaseT) || 0) / RELEASE_TIME);
  const x = lerp(RELEASE_X0, KITE_START_X, u);
  const y = lerp(RELEASE_Y0, KITE_START_Y, u);
  const dist0 = Math.hypot(RELEASE_X0, RELEASE_Y0);
  const lineLen = lerp(Math.max(LINE_LEN_MIN, dist0 + 0.4), LINE_LEN_START, u);
  return { x, y, lineLen, vx: 0, vy: 0 };
}

function applyReleasePose(s, phaseT, final = false) {
  const pose = final
    ? { x: KITE_START_X, y: KITE_START_Y, lineLen: LINE_LEN_START, vx: 0, vy: 0 }
    : releasePose(phaseT);
  s.kiteX = pose.x;
  s.kiteY = pose.y;
  s.kiteVx = pose.vx;
  s.kiteVy = pose.vy;
  s.lineLen = pose.lineLen;
  const geo = lineGeometry(s.kiteX, s.kiteY, s.lineLen);
  s.dist = geo.dist;
  s.tension = geo.tension;
  s.slack = geo.slack;
  s.stress = 0;
}

function applyGeo(s) {
  const geo = lineGeometry(s.kiteX, s.kiteY, s.lineLen);
  s.dist = geo.dist;
  if (!s.snapped) {
    s.tension = geo.tension;
    s.slack = geo.slack;
  }
}

function updateBests(s) {
  if (s.score <= 0) return;
  if (s.score > s.bestScore) s.bestScore = s.score;
  if (s.score > s.todayBestScore) s.todayBestScore = s.score;
}

function refreshLive(s) {
  const parts = scoreParts(s);
  s.zoneFrac = parts.zoneFrac;
  s.wobble = parts.wobble;
  if (s.finishedAt == null) s.stability = parts.stability;
}

function lockScore(s) {
  if (s.finishedAt != null) return;
  const parts = scoreParts(s);
  s.zoneFrac = parts.zoneFrac;
  s.altFrac = parts.altFrac;
  s.slackFrac = parts.slackFrac;
  s.stressFrac = parts.stressFrac;
  s.wobble = parts.wobble;
  s.stability = parts.stability;
  s.score = parts.score;
  s.grade = parts.grade;
  s.finishedAt = s.flyT;
  s.showDailyWind = false;
  updateBests(s);
}

function goReveal(s) {
  s.phase = "reveal";
  s.phaseT = 0;
  s.showDailyWind = false;
}

export function canFinish(s) {
  if (!s || s.status !== "playing" || s.phase !== "fly") return false;
  if (s.finishedAt != null) return false;
  if ((s.zoneFrac || 0) >= 1 - 1e-12) return true;
  return s.flyT + 1e-9 >= FINISH_MIN;
}

function finalizeFinish(s) {
  lockScore(s);
  goReveal(s);
}

function applyGestures(s, input, dt, active) {
  const h = hands(input);
  const leftPos = active && h.leftOn ? h.leftPos : null;
  const rightPos = active && h.rightOn ? h.rightPos : null;
  const prevRate = s.left.lineRate;
  const prevTilt = s.right.tilt;
  s.left = updateLeft(s.left, leftPos, dt, !!(active && h.leftOn));
  s.right = updateRight(s.right, rightPos, dt, !!(active && h.rightOn));
  if (active && h.leftOn && Math.abs(s.left.lineRate) > 0.35 && Math.abs(s.left.lineRate - prevRate) > 1e-6) {
    s.hintLeft = false;
  }
  if (active && h.rightOn && Math.abs(s.right.tilt) > 0.08 && Math.abs(s.right.tilt - prevTilt) > 1e-6) {
    s.hintRight = false;
  }
}

function stepFly(s, input, dt) {
  if (s.finishedAt == null) {
    s.lineLen = integrateLine(s.lineLen, s.left.lineRate, dt);
  }
  stepFlight(s, dt);
  refreshLive(s);

  if (s.finishedAt != null) {
    s.flyT += dt;
    s.phaseT += dt;
    s.showDailyWind = false;
    s.endWait = (Number(s.endWait) || 0) + dt;
    if (s.endWait + 1e-9 >= SNAP_REVEAL_DELAY) goReveal(s);
    return;
  }

  s.flyT += dt;
  s.phaseT += dt;
  s.showDailyWind = s.flyT < DAILY_WIND_TIME;

  if (s.snapped || s.crashed) {
    lockScore(s);
    s.endWait = 0;
    return;
  }
  if ((s.zoneFrac || 0) >= 1 - 1e-12) {
    s.flyT = Math.min(s.flyT, FLY_TIME);
    finalizeFinish(s);
  } else if (s.flyT + 1e-9 >= FLY_TIME) {
    s.flyT = FLY_TIME;
    finalizeFinish(s);
  } else if (input?.finish && canFinish(s)) {
    finalizeFinish(s);
  }
}

function stepPhase(s, input, dt) {
  if (s.status !== "playing") return;
  if (s.phase === "release") {
    s.phaseT += dt;
    if (s.phaseT + 1e-9 >= RELEASE_TIME) {
      const overflow = Math.max(0, s.phaseT - RELEASE_TIME);
      applyReleasePose(s, RELEASE_TIME, true);
      s.phase = "fly";
      s.phaseT = 0;
      s.flyT = 0;
      s.showDailyWind = true;
      if (overflow > 0) stepFly(s, input, overflow);
    } else {
      applyReleasePose(s, s.phaseT, false);
    }
    return;
  }
  if (s.phase === "fly") {
    stepFly(s, input, dt);
    return;
  }
  if (s.phase === "reveal") {
    s.phaseT += dt;
    if (s.phaseT + 1e-9 >= REVEAL_TIME) s.status = "over";
  }
}

/**
 * Near-pure: same state+input+dt → same result. Does not mutate state or input.
 * Clamps dt to 50ms and steps flight / phases at 1/60 + remainder.
 * Gestures are applied once per call with the frame dt (positions are samples, not per-substep).
 * When landscape is false, fly / finish are ignored and time does not advance; lineRate and tilt decay.
 */
export function tick(state, input, dt) {
  if (state.status !== "playing") return cloneState(state);
  const s = cloneState(state);
  const rawDt = Math.min(Math.max(Number(dt) || 0, 0), MAX_DT);
  if (!input?.landscape) {
    applyGestures(s, input, rawDt, false);
    return s;
  }
  applyGestures(s, input, rawDt, true);
  let left = rawDt;
  while (left > 0 && s.status === "playing") {
    const stepDt = Math.min(FIXED_DT, left);
    stepPhase(s, input, stepDt);
    left -= stepDt;
  }
  return s;
}

/**
 * Shared by 「しまう」, the time limit, and a completed set of rings.
 * No-op before 22s unless zoneFrac is 1, and during release / reveal / when not playing.
 * Landscape is enforced by tick; a direct call assumes the caller already checked orientation.
 */
export function finishNow(state) {
  const s = cloneState(state);
  if (canFinish(s)) finalizeFinish(s);
  return s;
}

/** Fresh playing state. bestScore / todayBestScore are in-memory; persist elsewhere. */
export function createInitialState({ seed, dateJst, bestScore = 0, todayBestScore = 0 } = {}) {
  const rng0 = hashSeed(seed);
  const built = dailyParams(rng0);
  const params = built.params;
  const pose = releasePose(0);
  const geo = lineGeometry(pose.x, pose.y, pose.lineLen);
  return {
    status: "playing",
    phase: "release",
    seed,
    dateJst: dateJst ?? null,
    phaseT: 0,
    flyT: 0,
    rngState: built.rngState,
    params,
    left: emptyLeft(),
    right: emptyRight(),
    lineLen: pose.lineLen,
    kiteX: pose.x,
    kiteY: pose.y,
    kiteVx: pose.vx,
    kiteVy: pose.vy,
    dist: geo.dist,
    tension: geo.tension,
    slack: geo.slack,
    stress: 0,
    snapped: false,
    crashed: false,
    ringProg: emptyRingProg(params.rings),
    zoneFrac: 0,
    altFrac: 0,
    slackFrac: 0,
    stressFrac: 0,
    wobble: 0,
    nAlt: 0,
    meanAlt: 0,
    m2Alt: 0,
    stability: 1,
    score: 0,
    grade: null,
    finishedAt: null,
    bestScore: bestScore || 0,
    todayBestScore: todayBestScore || 0,
    hintLeft: true,
    hintRight: true,
    showDailyWind: false,
    stressHighT: 0,
    endWait: 0,
  };
}
