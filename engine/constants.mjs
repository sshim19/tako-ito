/** Dimensions, zones, time constants, lift and snap, grades, and storage keys. Y is down in wu, up in metres. */

export const VIEW_W = 844;
export const VIEW_H = 390;

export const LEFT_X0 = 0;
export const LEFT_X1 = 400;
export const LEFT_Y0 = 44;
export const LEFT_Y1 = 390;

export const RIGHT_X0 = 444;
export const RIGHT_X1 = 844;
export const RIGHT_Y0 = 44;
export const RIGHT_Y1 = 390;
/** After assignment only: play.mjs may keep the right pointer this far past the edge. */
export const RIGHT_EDGE_SLACK = 24;

export const REEL_CX = 188;
export const REEL_CY = 268;
export const REEL_VISUAL_R = 110;

export const LINE_DEAD = 16;
export const LINE_RAMP = 64;
export const LINE_PAY_MAX = 7.5;
export const LINE_REEL_MAX = 6.0;

export const STEER_CX = 648;
export const STEER_CY = 268;
export const STEER_HALF = 120;
export const STEER_GROOVE_W = 240;
export const STEER_GROOVE_H = 56;

export const LINE_LEN_MIN = 10;
export const LINE_LEN_MAX = 72;
export const LINE_LEN_START = 16;

export const KITE_START_X = 7;
export const KITE_START_Y = 15.2;
export const RELEASE_X0 = 3.0;
export const RELEASE_Y0 = 2.8;
export const STAKE_X = 0;
export const STAKE_Y = 0;
export const GROUND_Y = 0;

export const RELEASE_TIME = 1.2;
export const FLY_TIME = 75;
export const FINISH_MIN = 22;
export const FINISH_MIN_TIME = FINISH_MIN;
export const REVEAL_TIME = 1.6;
export const SNAP_REVEAL_DELAY = 0.8;
export const DAILY_WIND_TIME = 2.5;
export const FIXED_DT = 1 / 60;
export const MAX_DT = 0.05;

export const LINE_SMOOTH_TAU = 0.12;
export const LINE_DECAY_TAU = 0.16;
export const TILT_SMOOTH_TAU = 0.1;
export const TILT_DECAY_TAU = 0.16;
export const TAP_PATH = 10;

/** Tunable §3 coefficients. DESIGN table: lift 0.85, fall drag 0.45, elastic 1.6,
 *  snap 1.55 / 0.70s, warn 1.22, ring radii as published. Changes stay within ±35%. */
export const ELASTIC = 1.6;
export const LIFT_GAIN = 1.10;
/** Reeling in (negative lineRate) adds apparent airspeed, like pumping a real kite. */
export const APPARENT_REEL = 1.0;
export const FALL_DRAG = 0.45;
export const TILT_ACCEL = 14;
export const VEL_DAMP_X = 2.2;
export const GRAVITY = 9.8;
export const CRASH_Y = 1.2;
export const STRESS_WARN = 1.22;
export const STRESS_SNAP = 1.55;
export const STRESS_SNAP_TIME = 0.7;
export const LIFT_BUMP_MID = 0.52;
export const LIFT_BUMP_HALF = 0.28;

export const HOLD_TIME = 2.0;
export const SLACK_CALL = 1.2;
export const WOBBLE_SCALE = 14;
export const GUST_RAMP = 0.6;
/** DESIGN wrote profileY = 0.55 + 0.45 * bump. At the start height that floor
 *  cannot lift a kite in light or normal wind (0.85 * (0.55*3.6)^2 < g).
 *  Floor raised so a taut kite climbs slowly even on a light day; the band
 *  still peaks at 1. Reeling in adds apparent airspeed. See DESIGN.md. */
export const PROFILE_Y_FLOOR = 0.94;
export const PROFILE_Y_SPAN = 1 - PROFILE_Y_FLOOR;
/** Above the band, fade to this floor so a taut kite settles near the band instead of climbing to the 72m line cap. */
export const PROFILE_Y_CEILING = 0.50;
export const PROFILE_X_FLOOR = 0.75;
export const PROFILE_X_SPAN = 1 - PROFILE_X_FLOOR;


export const PASS_R_MIN = 5.5;
export const PASS_R_MAX = 7.0;
export const HOLD_R_MIN = 8;
export const HOLD_R_MAX = 10;
export const RING_Y_MIN = 12;
export const RING_Y_MAX = 62;
export const RING_DIST_MIN = 15;
export const RING_DIST_MAX = 70;

export const BAND_Y_MIN = 28;
export const BAND_Y_MAX = 55;
export const BAND_W_MIN = 10;
export const BAND_W_MAX = 18;
export const BAND_X_MIN = -12;
export const BAND_X_MAX = 12;
export const BAND_XW_MIN = 14;
export const BAND_XW_MAX = 22;

export const EVENT_COUNT_MIN = 3;
export const EVENT_COUNT_MAX = 5;
export const EVENT_FIRST = 4;
export const EVENT_LAST = 70;
export const EVENT_DUR_MIN = 2.5;
export const EVENT_DUR_MAX = 6;
export const EVENT_GAP_MIN = 0.5;

/** Slight windBase jitter after the type is chosen. Keeps types distinct. */
export const WIND_BASE_JITTER = 0.12;

export const WIND_TABLE = [
  { wind: "light", windBase: 3.6, gust: [0.32, 0.48], lull: [0.28, 0.42] },
  { wind: "normal", windBase: 5.0, gust: [0.4, 0.62], lull: [0.32, 0.5] },
  { wind: "strong", windBase: 6.4, gust: [0.5, 0.78], lull: [0.22, 0.4] },
];

export const SCORE_LOFTY = 88;
export const SCORE_GOOD = 72;
export const SCORE_CLOSE = 55;
export const SCORE_OFF = 32;

export const JUDGE_BALLOON_OFFSET = 70;

export const STORAGE_BEST = "tako-ito:bestScore";
export const STORAGE_DAILY_PREFIX = "tako-ito:daily:";
export const STORAGE_MUTED = "tako-ito:muted";
export const SEED_PREFIX = "tako-ito:";

export const WIND_LABELS = { light: "弱め", normal: "ふつう", strong: "強め" };

export const GRADE_LABELS = {
  lofty: "よく揚がった",
  good: "よい高さ",
  close: "おしい",
  off: "ふらついた",
  early: "まだ早い",
};

export const GRADE_BALLOONS = {
  lofty: "よく揚がった！",
  good: "よい高さ",
  close: "おしい",
  off: "ふらついた",
  early: "まだ早い",
};

export const GRADE_SHARE = {
  lofty: "よく揚がった",
  good: "よい高さ",
  close: "おしい",
  off: "ふらついた",
  early: "まだ早い",
};

export const GRADE_RESULT = {
  lofty: "よく揚がった凧",
  good: "よい高さ",
  close: "おしい",
  off: "ふらついた",
  early: "まだ早い",
};

export function seedString(dateJst) {
  return SEED_PREFIX + dateJst;
}

export function dailyKey(dateJst) {
  return STORAGE_DAILY_PREFIX + dateJst;
}

export function gradeForScore(score) {
  const s = Number(score) || 0;
  if (s >= SCORE_LOFTY) return "lofty";
  if (s >= SCORE_GOOD) return "good";
  if (s >= SCORE_CLOSE) return "close";
  if (s >= SCORE_OFF) return "off";
  return "early";
}

export function clamp(x, lo, hi) {
  const n = Number(x);
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(t) {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

/**
 * 1 when |x-mid| ≤ half, then linear to 0 at mid ± 2*half (floor 0).
 * liftGain = bump(tension, 0.52, 0.28) is 1 on 0.24–0.80 and ≈0.29 at full tension.
 */
export function bump(x, mid, half) {
  const h = Number(half) || 0;
  if (!(h > 0)) return 0;
  const d = Math.abs((Number(x) || 0) - mid);
  if (d <= h) return 1;
  if (d >= 2 * h) return 0;
  return 1 - (d - h) / h;
}

export function lineDesired(y) {
  const fy = REEL_CY - Number(y);
  if (fy > 0) return LINE_PAY_MAX * clamp((fy - LINE_DEAD) / LINE_RAMP, 0, 1);
  if (fy < 0) return -LINE_REEL_MAX * clamp((-fy - LINE_DEAD) / LINE_RAMP, 0, 1);
  return 0;
}

/** Invert lineDesired for bots: the reel Y that asks for this signed rate. */
export function yFromLineRate(rate) {
  const f = Number(rate) || 0;
  if (f > 0) {
    const t = clamp(f / LINE_PAY_MAX, 0, 1);
    return REEL_CY - (LINE_DEAD + LINE_RAMP * t);
  }
  if (f < 0) {
    const t = clamp(-f / LINE_REEL_MAX, 0, 1);
    return REEL_CY + (LINE_DEAD + LINE_RAMP * t);
  }
  return REEL_CY;
}

export function tiltDesired(x) {
  return clamp((Number(x) - STEER_CX) / STEER_HALF, -1, 1);
}

export function xFromTilt(tilt) {
  return STEER_CX + clamp(tilt, -1, 1) * STEER_HALF;
}
