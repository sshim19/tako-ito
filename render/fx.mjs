/**
 * 重ねの開示、吹き出し、たるみの見え、切れと落下。
 * エンジンは触らず、state の差分から演出を進める。
 */

import * as constants from "../engine/constants.mjs";
import { dailyCondition, formatScore, gradeCallout } from "./share.mjs";

export const JUDGE_BALLOON_OFFSET = constants.JUDGE_BALLOON_OFFSET ?? 70;
export const STRESS_WARN = constants.STRESS_WARN ?? 1.22;
export const SLACK_WARN = constants.SLACK_CALL ?? constants.SLACK_WARN ?? 1.2;
export const HOLD_TIME = constants.HOLD_TIME ?? 2;
export const TRAIL_CAP = 220;
export const BITS_CAP = 16;

const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, Number(n) || 0));
}

function clamp01(n) {
  return clamp(n, 0, 1);
}

function rgba(hex, a) {
  const n = parseInt(String(hex || "#f3eee4").replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(243, 238, 228, ${a})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function inBand(state) {
  const y = Number(state?.kiteY);
  const bandY = Number(state?.params?.bandY);
  const bandW = Number(state?.params?.bandW);
  if (!Number.isFinite(y) || !Number.isFinite(bandY) || !Number.isFinite(bandW) || bandW <= 0) {
    return false;
  }
  return y >= bandY - bandW / 2 && y <= bandY + bandW / 2;
}

/**
 * 飛行中の状態文。切れが最優先、次に落下、次に張りすぎ、次に緩み。
 * @param {object} [state]
 * @returns {string}
 */
export function statusFrom(state) {
  if (state?.status !== "playing") return "";
  if (state?.phase !== "fly") return "";
  if (state?.snapped) return "糸が切れた";
  if (state?.crashed) return "落ちた";
  const stress = Number(state?.stress) || 0;
  if (stress >= STRESS_WARN) return "糸が張りすぎ";
  const slack = Number(state?.slack) || 0;
  if (slack > SLACK_WARN) return "糸が緩んでいる";
  const tension = Number(state?.tension) || 0;
  if (!state?.snapped && !state?.crashed && inBand(state) && tension >= 0.24 && tension <= 0.8) {
    return "風に乗っている";
  }
  const flyT = Number(state?.flyT) || 0;
  if (flyT < 7.5) return "巻くと揚がる";
  return "";
}

export function createFx() {
  return {
    clock: 0,
    trail: [],
    bits: [],
    floats: [],
    reelAngle: 0,
    revealZoom: 1,
    dailyAlpha: 0,
    statusAlpha: 0,
    statusText: "",
    camX: 7,
    camY: 7.2,
    camScale: 7.2,
    overlayX: 422,
    overlayY: 175,
    prev: null,
  };
}

export function resetFx(fx) {
  if (!fx) return;
  fx.clock = 0;
  fx.trail.length = 0;
  fx.bits.length = 0;
  fx.floats.length = 0;
  fx.reelAngle = 0;
  fx.revealZoom = 1;
  fx.dailyAlpha = 0;
  fx.statusAlpha = 0;
  fx.statusText = "";
  fx.camX = 7;
  fx.camY = 7.2;
  fx.camScale = 7.2;
  fx.overlayX = 422;
  fx.overlayY = 175;
  fx.prev = null;
}

function spawnBalloons(fx, state) {
  const grade = state?.grade || "early";
  const score = Math.max(0, Math.floor(Number(state?.score) || 0));
  fx.floats.length = 0;
  fx.floats.push({
    kind: "grade",
    text: gradeCallout(grade),
    age: 0,
    color: "#1c2430",
  });
  fx.floats.push({
    kind: "score",
    text: `${formatScore(score)}点`,
    age: 0,
    color: "#1c2430",
  });
}

function addBits(fx, state, kind, reduced) {
  if (reduced) return;
  const cap = BITS_CAP;
  const n = kind === "snap" ? 8 : 10;
  const x = Number(state?.kiteX) || 0;
  const y = Number(state?.kiteY) || 0;
  for (let i = 0; i < n && fx.bits.length < cap; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = (kind === "snap" ? 6 : 4) + Math.random() * 8;
    fx.bits.push({
      kind,
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd * 0.7 + (kind === "crash" ? 2 : 1),
      r: 0.8 + Math.random() * 1.4,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 6,
      life: 0.45 + Math.random() * 0.4,
      max: 0.85,
      color: kind === "snap" ? "#2c2a26" : Math.random() < 0.5 ? "#c43c2c" : "#f4efe6",
    });
  }
}

function pushTrail(fx, state) {
  const x = Number(state?.kiteX);
  const y = Number(state?.kiteY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const last = fx.trail[fx.trail.length - 1];
  if (last && Math.hypot(x - last.x, y - last.y) < 0.45 && fx.clock - last.at < 0.08) return;
  fx.trail.push({ x, y, at: fx.clock });
  if (fx.trail.length > TRAIL_CAP) fx.trail.splice(0, fx.trail.length - TRAIL_CAP);
}

/**
 * @param {object} fx
 * @param {object} state
 * @param {number} dt
 * @param {{ reducedMotion?: boolean, right?: object, left?: object }} [opts]
 */
export function syncFx(fx, state, dt, opts = {}) {
  if (!fx) return;
  const reduced = !!opts.reducedMotion;
  const t = Math.max(0, Number(dt) || 0);
  fx.clock += t;

  const playing = state?.status === "playing";
  const phase = state?.phase;

  const rate = Number(state?.left?.lineRate) || 0;
  fx.reelAngle += rate * t * 0.22;

  const wantDaily = !!(playing && state?.showDailyWind);
  fx.dailyAlpha += ((wantDaily ? 1 : 0) - fx.dailyAlpha) * (1 - Math.exp(-t / 0.2));

  const nextStatus = statusFrom(state);
  if (nextStatus) fx.statusText = nextStatus;
  const wantStatus = nextStatus ? 1 : 0;
  if (!playing || phase === "reveal") {
    fx.statusAlpha = 0;
    if (!nextStatus) fx.statusText = "";
  } else {
    fx.statusAlpha += (wantStatus - fx.statusAlpha) * (1 - Math.exp(-t / 0.16));
    if (fx.statusAlpha < 0.02 && !nextStatus) fx.statusText = "";
  }

  const zoomTarget = playing && phase === "reveal" ? (reduced ? 1 : 1) : 1;
  fx.revealZoom += (zoomTarget - fx.revealZoom) * (1 - Math.exp(-t / 0.25));

  const prevPhase = fx.prev?.phase;
  const prevStatus = fx.prev?.status;
  if (
    (prevPhase !== "reveal" && phase === "reveal") ||
    (prevStatus !== "over" && state?.status === "over" && fx.floats.length === 0)
  ) {
    spawnBalloons(fx, state);
  }

  if (!fx.prev?.snapped && state?.snapped) addBits(fx, state, "snap", reduced);
  if (!fx.prev?.crashed && state?.crashed) addBits(fx, state, "crash", reduced);

  if (playing && (phase === "release" || phase === "fly" || phase === "reveal")) {
    pushTrail(fx, state);
  }

  for (let i = fx.bits.length - 1; i >= 0; i--) {
    const p = fx.bits[i];
    p.life -= t;
    p.x += p.vx * t;
    p.y += p.vy * t;
    p.vy -= 6 * t;
    p.vx *= Math.exp(-t / 0.55);
    p.rot += p.spin * t;
    if (p.life <= 0) fx.bits.splice(i, 1);
  }
  if (reduced) fx.bits.length = 0;
  if (fx.bits.length > BITS_CAP) fx.bits.splice(0, fx.bits.length - BITS_CAP);

  for (const f of fx.floats) {
    f.age = (Number(f.age) || 0) + t;
  }

  fx.prev = {
    status: state?.status,
    phase: state?.phase,
    grade: state?.grade,
    score: state?.score,
    snapped: !!state?.snapped,
    crashed: !!state?.crashed,
  };
}

export function revealZoom(fx, reduced) {
  if (!fx) return 1;
  const z = Number(fx.revealZoom) || 1;
  if (reduced) return Math.min(z, 1.02);
  return z;
}

export function overlayCenter(fx) {
  return {
    x: Number(fx?.overlayX) || 422,
    y: Number(fx?.overlayY) || 175,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} fx
 * @param {{ sx: Function, sy: Function, px: Function, worldToView?: Function, reducedMotion?: boolean }} view
 * @param {object} [state]
 */
export function drawFx(ctx, fx, view, state) {
  if (!fx) return;
  const reduced = !!view.reducedMotion;
  const sx = (x) => view.sx(x);
  const sy = (y) => view.sy(y);
  const px = (w) => view.px(w);
  const toView = (wx, wy) =>
    typeof view.worldToView === "function" ? view.worldToView(wx, wy) : { x: wx, y: wy };

  for (const p of fx.bits) {
    const u = Math.max(0, Math.min(1, p.life / (p.max || 1)));
    const pnt = toView(p.x, p.y);
    ctx.save();
    ctx.translate(sx(pnt.x), sy(pnt.y));
    ctx.rotate(p.rot || 0);
    ctx.globalAlpha = 0.25 + 0.55 * u;
    ctx.fillStyle = p.color || "#c43c2c";
    if (p.kind === "snap") {
      ctx.fillRect(-px(p.r * 2.2), -px(0.4), px(p.r * 4.4), px(0.8));
    } else {
      ctx.fillRect(-px(p.r * 1.4), -px(p.r * 1.8), px(p.r * 2.8), px(p.r * 3.2));
    }
    ctx.restore();
  }

  if (fx.dailyAlpha > 0.04 && state?.showDailyWind !== false) {
    const text = dailyCondition(state?.params);
    const x = sx(422);
    const y = sy(68);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, fx.dailyAlpha));
    ctx.font = `700 ${Math.max(11, px(12))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = rgba("#f3eee4", 0.9);
    const padX = 8;
    const padY = 4;
    const h = Math.max(16, px(14));
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x - tw / 2 - padX, y - h / 2 - padY, tw + padX * 2, h + padY * 2, 6);
    } else {
      ctx.rect(x - tw / 2 - padX, y - h / 2 - padY, tw + padX * 2, h + padY * 2);
    }
    ctx.fill();
    ctx.fillStyle = "#1c2430";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  if (fx.statusAlpha > 0.05 && fx.statusText) {
    const kite = toView(Number(state?.kiteX) || 0, Number(state?.kiteY) || 0);
    const text = fx.statusText;
    const x = sx(kite.x);
    const y = sy(kite.y - 42);
    const pulse =
      reduced || text !== "風に乗っている"
        ? 1
        : 1 + 0.03 * Math.sin((Number(fx.clock) || 0) * Math.PI * 2 * 2.0);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = Math.max(0, Math.min(1, fx.statusAlpha));
    ctx.font = `700 ${Math.max(13, px(14))}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(text).width;
    const padX = 9;
    const padY = 5;
    const h = Math.max(18, px(16));
    ctx.fillStyle = rgba("#f3eee4", 0.96);
    ctx.strokeStyle = rgba("#1c2430", 0.16);
    ctx.lineWidth = Math.max(1, px(1));
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-tw / 2 - padX, -h / 2 - padY, tw + padX * 2, h + padY * 2, 6);
    } else {
      ctx.rect(-tw / 2 - padX, -h / 2 - padY, tw + padX * 2, h + padY * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1c2430";
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  const over = overlayCenter(fx);
  const cx = clamp(over.x, 260, 620);
  const cy = clamp(over.y - JUDGE_BALLOON_OFFSET, 48, 210);
  const showBalloons = state?.status === "playing" && state?.phase === "reveal";
  for (let i = 0; showBalloons && i < fx.floats.length; i++) {
    const f = fx.floats[i];
    const age = Number(f.age) || 0;
    let pop = 1;
    if (!reduced) {
      if (age < 0.12) pop = 0.7 + 0.55 * (age / 0.12);
      else if (age < 0.22) pop = 1.25 - 0.25 * ((age - 0.12) / 0.1);
      else pop = 1;
    }
    const fade = Math.min(1, age / 0.08);
    const lift = reduced ? 0 : Math.min(8, age * 10);
    const row = f.kind === "grade" ? 0 : 22;
    const x = sx(cx);
    const y = sy(cy + row) - px(lift);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.globalAlpha = fade;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const size = f.kind === "grade" ? Math.max(16, px(20)) : Math.max(13, px(15));
    ctx.font = `700 ${size}px ${FONT}`;
    const tw = ctx.measureText(f.text).width;
    ctx.fillStyle = rgba("#f3eee4", 0.92);
    const padX = 8;
    const padY = 4;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(-tw / 2 - padX, -size / 2 - padY, tw + padX * 2, size + padY * 2, 6);
    } else {
      ctx.rect(-tw / 2 - padX, -size / 2 - padY, tw + padX * 2, size + padY * 2);
    }
    ctx.fill();
    ctx.fillStyle = f.color || "#1c2430";
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
}
