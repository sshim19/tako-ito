/**
 * 空・丘・杭・吹き流し・糸・凧・輪・帯の霞・左右の域・縮小図。844×390 論理座標。Y は下向き。
 * 世界座標はメートル、Y は上向き。カメラは描画側だけが持つ。画像アセットは使わない。
 */

import * as constants from "../engine/constants.mjs";
import { windAt } from "../engine/wind.mjs";
import { drawFx } from "./fx.mjs";
import { drawMotionGuides } from "./hand-guides.mjs";

export const VIEW_W = constants.VIEW_W ?? 844;
export const VIEW_H = constants.VIEW_H ?? 390;

export const LEFT_X0 = constants.LEFT_X0 ?? 0;
export const LEFT_X1 = constants.LEFT_X1 ?? 400;
export const LEFT_Y0 = constants.LEFT_Y0 ?? 44;
export const LEFT_Y1 = constants.LEFT_Y1 ?? 390;

export const RIGHT_X0 = constants.RIGHT_X0 ?? 444;
export const RIGHT_X1 = constants.RIGHT_X1 ?? 844;
export const RIGHT_Y0 = constants.RIGHT_Y0 ?? 44;
export const RIGHT_Y1 = constants.RIGHT_Y1 ?? 390;
export const RIGHT_EDGE_SLACK = constants.RIGHT_EDGE_SLACK ?? 24;

export const REEL_CX = constants.REEL_CX ?? constants.LINE_CX ?? 188;
export const REEL_CY = constants.REEL_CY ?? constants.LINE_CY ?? 268;
export const REEL_R = constants.REEL_VISUAL_R ?? constants.REEL_R ?? 110;
export const STEER_CX = constants.STEER_CX ?? constants.TILT_CX ?? 648;
export const STEER_CY = constants.STEER_CY ?? constants.TILT_CY ?? 268;
export const STEER_HALF_W = constants.STEER_HALF ?? constants.STEER_HALF_W ?? 120;
export const STEER_HALF_H = (constants.STEER_GROOVE_H ?? 56) / 2;

export const WORLD_SCALE = constants.WORLD_SCALE ?? 7.2;
export const STRESS_WARN = constants.STRESS_WARN ?? 1.22;
export const SLACK_WARN = constants.SLACK_CALL ?? constants.SLACK_WARN ?? 1.2;
export const HOLD_TIME = constants.HOLD_TIME ?? 2;
export const THUMB_GUIDE_R = 22; // 直径 44wu

const SKY_A = "#7eb7d9";
const SKY_B = "#c5e0ef";
const MTN_A = "#6a8a6e";
const MTN_B = "#8aa484";
const GRASS_A = "#c4b48a";
const GRASS_B = "#d4c49a";
const LINE = "#2c2a26";
const LINE_WARN = "#c43c2c";
const KITE_RED = "#c43c2c";
const KITE_WHITE = "#f4efe6";
const BONE = "#3a3530";
const RING = "#f4e4a4";
const INK = "#1c2430";
const HUD_BG = "#f3eee4";
const FONT = `"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, Number(n) || 0));
}

function clamp01(n) {
  return clamp(n, 0, 1);
}

function rgba(hex, a) {
  const n = parseInt(String(hex || "#ffffff").replace("#", ""), 16);
  if (!Number.isFinite(n)) return `rgba(255, 255, 255, ${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function lerpHex(a, b, t) {
  const pa = parseInt(String(a).replace("#", ""), 16);
  const pb = parseInt(String(b).replace("#", ""), 16);
  const u = clamp01(t);
  const mix = (s, d) => Math.round(((s >> 16) & 255) * (1 - u) + ((d >> 16) & 255) * u);
  const mg = (s, d) => Math.round(((s >> 8) & 255) * (1 - u) + ((d >> 8) & 255) * u);
  const mb = (s, d) => Math.round((s & 255) * (1 - u) + (d & 255) * u);
  const r = mix(pa, pb);
  const g = mg(pa, pb);
  const bl = mb(pa, pb);
  return `rgb(${r}, ${g}, ${bl})`;
}

function u32(n) {
  return n >>> 0;
}

function hashSeed(state) {
  const s = String(state?.seed || state?.dateJst || "tako-ito");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return u32(h);
}

function mulberry(a) {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, a: u32(a) };
}

function bump(x, mid, half) {
  const h = Number(half) || 0;
  if (!(h > 0)) return 0;
  const d = Math.abs((Number(x) || 0) - (Number(mid) || 0));
  if (d <= h) return 1;
  return Math.max(0, 1 - (d - h) / h);
}

function gustValue(flyT, events) {
  if (!Array.isArray(events) || !events.length) return 0;
  const t = Number(flyT) || 0;
  const rise = 0.6;
  let g = 0;
  for (const ev of events) {
    const t0 = Number(ev?.t0) || 0;
    const dur = Number(ev?.dur) || 0;
    const amp = Number(ev?.amp) || 0;
    const t1 = t0 + dur;
    if (t < t0 || t > t1 || dur <= 0) continue;
    let w = 1;
    if (t < t0 + rise) w = (t - t0) / rise;
    else if (t > t1 - rise) w = (t1 - t) / rise;
    g += amp * clamp(w, 0, 1);
  }
  return g;
}

export function windMagOf(state) {
  if (typeof windAt === "function") {
    const r = windAt(Number(state?.kiteX) || 0, Number(state?.kiteY) || 0, Number(state?.flyT) || 0, state?.params);
    if (r && typeof r === "object" && Number.isFinite(r.windMag)) return Math.max(0, r.windMag);
    if (Number.isFinite(r)) return Math.max(0, r);
  }
  const p = state?.params || {};
  const base = Number(p.windBase);
  const windBase = Number.isFinite(base) && base > 0 ? base : 5;
  const x = Number(state?.kiteX) || 0;
  const y = Number(state?.kiteY) || 0;
  const flyT = Number(state?.flyT) || 0;
  const profileY = 0.55 + 0.45 * bump(y, p.bandY, (Number(p.bandW) || 0) * 0.65);
  const profileX = 0.75 + 0.25 * bump(x, p.bandX, p.bandXw);
  const gust = gustValue(flyT, p.events);
  return windBase * profileY * profileX * (1 + gust);
}

export function kitePos(state) {
  const x = Number(state?.kiteX);
  const y = Number(state?.kiteY);
  return {
    x: Number.isFinite(x) ? x : 7,
    y: Number.isFinite(y) ? y : 15.2,
  };
}

export function ringsOf(state) {
  return Array.isArray(state?.params?.rings) ? state.params.rings : [];
}

export function ringDone(state, i) {
  const prog = Array.isArray(state?.ringProg) ? state.ringProg[i] : null;
  const kind = ringsOf(state)[i]?.kind || "pass";
  if (kind === "hold") return (Number(prog?.holdT) || 0) >= HOLD_TIME - 1e-6;
  return !!prog?.passed;
}

export function currentRingIndex(state) {
  const rings = ringsOf(state);
  const kite = kitePos(state);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < rings.length; i++) {
    if (ringDone(state, i)) continue;
    const r = rings[i];
    const x = Number(r?.x);
    const y = Number(r?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const d = Math.hypot(x - kite.x, y - kite.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * キャンバスを CSS サイズ × DPR に合わせ、描画は CSS ピクセル座標で行う。
 * @returns {{ cssW: number, cssH: number, dpr: number }}
 */
export function syncCanvasSize(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = Math.max(1, canvas.clientWidth || VIEW_W);
  const cssH = Math.max(1, canvas.clientHeight || VIEW_H);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { cssW, cssH, dpr };
}

/**
 * 高さに合わせて 844×390 を伸ばし、幅が足りなければ contain する。
 * 余った部分は同じ空色で埋める。
 */
export function makeView(cssW, cssH) {
  let scale = cssH / VIEW_H;
  if (VIEW_W * scale > cssW + 0.5) scale = cssW / VIEW_W;
  const drawW = VIEW_W * scale;
  const drawH = VIEW_H * scale;
  const ox = (cssW - drawW) / 2;
  const oy = (cssH - drawH) / 2;
  return {
    scale,
    ox,
    oy,
    drawW,
    drawH,
    cssW,
    cssH,
    sx(x) {
      return ox + x * scale;
    },
    sy(y) {
      return oy + y * scale;
    },
    px(wu) {
      return wu * scale;
    },
    worldX(cssX) {
      return (cssX - ox) / scale;
    },
    worldY(cssY) {
      return (cssY - oy) / scale;
    },
  };
}

/**
 * クライアント座標をキャンバス論理座標（0..844, 0..390, Y 下向き）へ。
 * @returns {{ x: number, y: number }}
 */
export function clientToLogical(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cssW = canvas.clientWidth || rect.width || VIEW_W;
  const cssH = canvas.clientHeight || rect.height || VIEW_H;
  const view = makeView(cssW, cssH);
  const cssX = ((clientX - rect.left) / (rect.width || 1)) * cssW;
  const cssY = ((clientY - rect.top) / (rect.height || 1)) * cssH;
  return { x: view.worldX(cssX), y: view.worldY(cssY) };
}

export function inLeftZone(x, y) {
  return x >= LEFT_X0 && x <= LEFT_X1 && y >= LEFT_Y0 && y <= LEFT_Y1;
}

export function inRightZone(x, y, slack = 0) {
  return (
    x >= RIGHT_X0 - slack &&
    x <= RIGHT_X1 + slack &&
    y >= RIGHT_Y0 - slack &&
    y <= RIGHT_Y1 + slack
  );
}

export function makeCamera(state, fx, reduced) {
  const kite = kitePos(state);
  const reveal = state?.phase === "reveal" || state?.status === "over";
  let scale = WORLD_SCALE;
  let targetX = kite.x - 2;
  let targetY = kite.y - 8;

  if (reveal) {
    let minX = kite.x;
    let maxX = kite.x;
    let minY = 0;
    let maxY = Math.max(kite.y, 16);
    for (const r of ringsOf(state)) {
      const x = Number(r?.x);
      const y = Number(r?.y);
      const rad = Number(r?.r) || 6;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x - rad);
      maxX = Math.max(maxX, x + rad);
      minY = Math.min(minY, y - rad);
      maxY = Math.max(maxY, y + rad);
    }
    const trail = fx?.trail || [];
    for (const p of trail) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    minX -= 5;
    maxX += 5;
    minY = Math.min(minY, 0) - 2;
    maxY += 8;
    const spanX = Math.max(18, maxX - minX);
    const spanY = Math.max(18, maxY - minY);
    scale = clamp(Math.min(560 / spanX, 250 / spanY, WORLD_SCALE), 3.0, WORLD_SCALE);
    targetX = (minX + maxX) / 2;
    targetY = (minY + maxY) / 2;
  }

  if (fx) {
    const k = reduced ? 1 : 0.14;
    if (!Number.isFinite(fx.camX)) fx.camX = targetX;
    if (!Number.isFinite(fx.camY)) fx.camY = targetY;
    if (!Number.isFinite(fx.camScale)) fx.camScale = scale;
    fx.camX += (targetX - fx.camX) * k;
    fx.camY += (targetY - fx.camY) * k;
    fx.camScale += (scale - fx.camScale) * k;
  }
  const camX = fx?.camX ?? targetX;
  const camY = fx?.camY ?? targetY;
  const camScale = fx?.camScale ?? scale;

  function worldToView(wx, wy) {
    return {
      x: VIEW_W / 2 + (wx - camX) * camScale,
      y: VIEW_H / 2 - (wy - camY) * camScale,
    };
  }

  if (fx && reveal) {
    const mid = worldToView(targetX, targetY);
    fx.overlayX = clamp(mid.x, 280, 600);
    fx.overlayY = clamp(mid.y, 110, 210);
  }

  return { camX, camY, scale: camScale, worldToView };
}

function fillSky(ctx, view) {
  const g = ctx.createLinearGradient(0, 0, 0, view.cssH);
  g.addColorStop(0, SKY_A);
  g.addColorStop(0.72, SKY_B);
  g.addColorStop(1, SKY_B);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.cssW, view.cssH);
}

function drawClouds(ctx, view, state, fx, reduced, windMag) {
  let rng = { a: hashSeed(state) ^ 0x9e3779b9 };
  const drift = reduced ? 0 : (Number(fx?.clock) || 0) * (1.6 + windMag * 1.8);
  const layers = 6;
  for (let i = 0; i < layers; i++) {
    let r1 = mulberry(rng.a); rng = r1;
    let r2 = mulberry(rng.a); rng = r2;
    let r3 = mulberry(rng.a); rng = r3;
    const w = 70 + r1.value * 110;
    const h = 16 + r2.value * 18;
    const baseY = 28 + r3.value * 150;
    const speed = 0.45 + (i % 3) * 0.25;
    const period = VIEW_W + w * 2;
    let r4 = mulberry(rng.a); rng = r4;
    const x0 = r4.value * period;
    const x = ((x0 + drift * speed) % period) - w;
    const alpha = 0.18 + (i % 2) * 0.1;
    ctx.fillStyle = rgba("#f7fbff", alpha);
    ctx.beginPath();
    ctx.ellipse(view.sx(x), view.sy(baseY), view.px(w * 0.55), view.px(h), 0, 0, Math.PI * 2);
    ctx.ellipse(view.sx(x + w * 0.28), view.sy(baseY - h * 0.25), view.px(w * 0.4), view.px(h * 0.9), 0, 0, Math.PI * 2);
    ctx.ellipse(view.sx(x - w * 0.25), view.sy(baseY + h * 0.1), view.px(w * 0.35), view.px(h * 0.75), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHills(ctx, view, cam) {
  const horizon = cam.worldToView(0, 0).y;
  const hy = view.sy(horizon);
  // far mountains, just above the grass line
  ctx.beginPath();
  ctx.moveTo(0, hy);
  const pts = [
    [-80, 36],
    [80, 70],
    [200, 40],
    [340, 78],
    [500, 44],
    [660, 86],
    [820, 50],
    [960, 64],
  ];
  for (const [x, rise] of pts) {
    ctx.lineTo(view.sx(x), hy - view.px(rise));
  }
  ctx.lineTo(view.cssW, hy);
  ctx.lineTo(view.cssW, view.cssH);
  ctx.lineTo(0, view.cssH);
  ctx.closePath();
  ctx.fillStyle = MTN_A;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, hy + view.px(8));
  const near = [
    [-40, 22],
    [140, 48],
    [300, 24],
    [470, 56],
    [640, 28],
    [800, 50],
    [980, 30],
  ];
  for (const [x, rise] of near) {
    ctx.lineTo(view.sx(x), hy - view.px(rise) + view.px(10));
  }
  ctx.lineTo(view.cssW, hy + view.px(8));
  ctx.lineTo(view.cssW, view.cssH);
  ctx.lineTo(0, view.cssH);
  ctx.closePath();
  ctx.fillStyle = MTN_B;
  ctx.fill();

  const g = ctx.createLinearGradient(0, hy, 0, view.cssH);
  g.addColorStop(0, GRASS_A);
  g.addColorStop(1, GRASS_B);
  ctx.fillStyle = g;
  const grassTop = Math.min(view.cssH, Math.max(hy, 0));
  ctx.fillRect(0, grassTop, view.cssW, view.cssH - grassTop + 2);

  // dry grass strokes near the horizon, kept cheap
  if (horizon < VIEW_H + 40) {
    ctx.strokeStyle = rgba("#8a6840", 0.22);
    ctx.lineWidth = Math.max(0.6, view.px(0.8));
    ctx.lineCap = "round";
    const y0 = horizon;
    for (let i = 0; i < 28; i++) {
      const x = 18 + i * 30 + (i % 3) * 6;
      const p0 = view.sx(x);
      const p1 = view.sy(y0 - 2);
      ctx.beginPath();
      ctx.moveTo(p0, p1 + view.px(6));
      ctx.lineTo(p0 + view.px((i % 2 ? 3 : -2)), p1 - view.px(7 + (i % 4)));
      ctx.stroke();
    }
  }
}

function drawBand(ctx, view, cam, state) {
  const p = state?.params || {};
  const bandY = Number(p.bandY);
  const bandW = Number(p.bandW);
  if (!Number.isFinite(bandY) || !Number.isFinite(bandW) || bandW <= 0) return;
  const bandX = Number(p.bandX);
  const bandXw = Number(p.bandXw);
  const y0 = cam.worldToView(0, bandY + bandW / 2).y;
  const y1 = cam.worldToView(0, bandY - bandW / 2).y;
  const top = view.sy(Math.min(y0, y1));
  const h = Math.abs(view.sy(y1) - view.sy(y0));
  ctx.fillStyle = rgba("#f7fbff", 0.26);
  if (Number.isFinite(bandX) && Number.isFinite(bandXw) && bandXw > 0) {
    const x0 = cam.worldToView(bandX - bandXw, bandY).x;
    const x1 = cam.worldToView(bandX + bandXw, bandY).x;
    const left = view.sx(Math.min(x0, x1));
    const w = Math.abs(view.sx(x1) - view.sx(x0));
    ctx.fillRect(left, top, w, h);
    ctx.strokeStyle = rgba("#f7fbff", 0.42);
    ctx.lineWidth = Math.max(1, view.px(1.2));
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left + w, top);
    ctx.moveTo(left, top + h);
    ctx.lineTo(left + w, top + h);
    ctx.stroke();
  } else {
    ctx.fillRect(0, top, view.cssW, h);
  }
}

function drawTrail(ctx, view, cam, fx, emphasize) {
  const trail = fx?.trail;
  if (!Array.isArray(trail) || trail.length < 2) return;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < trail.length; i++) {
    const p = cam.worldToView(trail[i].x, trail[i].y);
    if (i === 0) ctx.moveTo(view.sx(p.x), view.sy(p.y));
    else ctx.lineTo(view.sx(p.x), view.sy(p.y));
  }
  ctx.strokeStyle = rgba(INK, emphasize ? 0.42 : 0.18);
  ctx.lineWidth = Math.max(1, view.px(emphasize ? 2.2 : 1.4));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

function drawOneRing(ctx, view, cam, ring, done, current) {
  const x = Number(ring?.x);
  const y = Number(ring?.y);
  const r = Number(ring?.r);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r) || r <= 0) return;
  const p = cam.worldToView(x, y);
  const rr = Math.max(view.px(r * (cam.scale || WORLD_SCALE)), view.px(10));
  ctx.save();
  ctx.beginPath();
  ctx.arc(view.sx(p.x), view.sy(p.y), rr, 0, Math.PI * 2);
  ctx.fillStyle = rgba(RING, current ? 0.2 : done ? 0.05 : 0.12);
  ctx.fill();
  const dash = current ? [view.px(7), view.px(5)] : [view.px(6), view.px(5)];
  const width = Math.max(1.6, view.px(current ? 3.4 : done ? 2 : 2.8));
  ctx.setLineDash(dash);
  ctx.strokeStyle = rgba("#3a3530", current ? 0.55 : done ? 0.16 : 0.4);
  ctx.lineWidth = width + Math.max(1.2, view.px(1.6));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(view.sx(p.x), view.sy(p.y), rr, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(RING, current ? 1 : done ? 0.38 : 0.96);
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.setLineDash([]);
  if (ring?.kind === "hold") {
    ctx.beginPath();
    ctx.arc(view.sx(p.x), view.sy(p.y), rr * 0.86, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(RING, current ? 0.55 : done ? 0.16 : 0.4);
    ctx.lineWidth = Math.max(1, view.px(1.4));
    ctx.stroke();
  }
  ctx.restore();
}

function drawRings(ctx, view, cam, state, opts = {}) {
  const rings = ringsOf(state);
  const current = currentRingIndex(state);
  const skipCurrent = !!opts.skipCurrent;
  const onlyCurrent = !!opts.onlyCurrent;
  for (let i = 0; i < rings.length; i++) {
    const isCur = i === current;
    if (onlyCurrent && !isCur) continue;
    if (skipCurrent && isCur) continue;
    drawOneRing(ctx, view, cam, rings[i], ringDone(state, i), isCur);
  }
}

function lineColor(state) {
  const stress = Number(state?.stress) || 0;
  if (stress >= STRESS_WARN) {
    const t = clamp((stress - STRESS_WARN) / 0.4, 0, 1);
    return lerpHex(LINE, LINE_WARN, 0.45 + 0.55 * t);
  }
  const slack = Number(state?.slack) || 0;
  if (slack > SLACK_WARN) {
    const t = clamp((slack - SLACK_WARN) / 2.2, 0.25, 0.85);
    return lerpHex(LINE, "#8a7a62", t);
  }
  return LINE;
}

function lineCurve(x0, y0, x1, y1, slack, tension) {
  const sag = Math.min(120, Math.max(0, slack) * 24) * (1 - clamp01(tension * 1.35));
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2 + sag;
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({
      x: u * u * x0 + 2 * u * t * mx + t * t * x1,
      y: u * u * y0 + 2 * u * t * my + t * t * y1,
      t,
    });
  }
  return pts;
}

function strokePts(ctx, view, pts, fromT, color, width) {
  let started = false;
  ctx.beginPath();
  for (const p of pts) {
    if (p.t + 1e-6 < fromT) continue;
    if (!started) {
      ctx.moveTo(view.sx(p.x), view.sy(p.y));
      started = true;
    } else ctx.lineTo(view.sx(p.x), view.sy(p.y));
  }
  if (!started) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawLine(ctx, view, cam, state, { fromMid = false } = {}) {
  const kite = kitePos(state);
  const kp = cam.worldToView(kite.x, kite.y);
  const x0 = REEL_CX;
  const y0 = REEL_CY;
  const x1 = kp.x;
  const y1 = kp.y;
  const slack = Number(state?.slack) || 0;
  const tension = Number(state?.tension) || 0;
  const color = lineColor(state);
  const width = Math.max(1.4, view.px(state?.snapped ? 1.6 : slack > SLACK_WARN ? 1.8 : 2.35));
  const pts = lineCurve(x0, y0, x1, y1, slack, tension);
  if (state?.snapped) {
    const cut = 0.42;
    const a = pts.filter((p) => p.t <= cut);
    const b = pts.filter((p) => p.t >= cut + 0.08);
    if (a.length) {
      const last = a[a.length - 1];
      a.push({ x: last.x + 8, y: last.y + 18, t: cut + 0.02 });
    }
    if (b.length) {
      const first = b[0];
      b.unshift({ x: first.x - 6, y: first.y + 14, t: cut + 0.06 });
    }
    if (!fromMid) strokePts(ctx, view, a, 0, color, width);
    strokePts(ctx, view, b, fromMid ? 0 : 0, color, width);
    return;
  }
  strokePts(ctx, view, pts, fromMid ? 0.32 : 0, color, width);
}

function drawKite(ctx, view, cam, state, fx, reduced, windMag) {
  const kite = kitePos(state);
  const p = cam.worldToView(kite.x, kite.y);
  const tilt = Number(state?.right?.tilt) || 0;
  const vx = Number(state?.kiteVx) || 0;
  const vy = Number(state?.kiteVy) || 0;
  let ang = tilt * 0.48;
  if (Number.isFinite(vx) || Number.isFinite(vy)) {
    ang += Math.atan2(vx, 8 + Math.abs(vy)) * 0.18;
  }
  if (!reduced) {
    const flutter = Math.sin((Number(fx?.clock) || 0) * (3.6 + windMag * 0.25)) * 0.045;
    ang += flutter * (0.5 + clamp01(Number(state?.tension) || 0));
  }
  if (state?.snapped || state?.crashed) ang += 0.35;
  const h = Math.max(view.px(36), 20);
  const w = h * 0.78;
  ctx.save();
  ctx.translate(view.sx(p.x), view.sy(p.y));
  ctx.rotate(ang);

  // tail
  const tailWind = (windMag / 6) * (reduced ? 0.4 : 1);
  ctx.strokeStyle = KITE_RED;
  ctx.lineWidth = Math.max(1, view.px(1.3));
  ctx.lineCap = "round";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * w * 0.12, h * 0.5);
    const sway = reduced ? i * 4 : Math.sin((Number(fx?.clock) || 0) * 3 + i) * 6;
    ctx.quadraticCurveTo(i * 10 + sway, h * 0.9, i * (8 + tailWind * 4) + sway, h * 1.45);
    ctx.stroke();
  }

  // paper body (rectangular 和凧)
  ctx.fillStyle = KITE_WHITE;
  ctx.strokeStyle = BONE;
  ctx.lineWidth = Math.max(1, view.px(1.15));
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.fill();
  ctx.stroke();
  // red lattice fields
  ctx.fillStyle = KITE_RED;
  ctx.fillRect(-w / 2, -h / 2, w / 2, h / 2);
  ctx.fillRect(0, 0, w / 2, h / 2);
  ctx.strokeStyle = KITE_WHITE;
  ctx.lineWidth = Math.max(0.8, view.px(1));
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(w / 2, 0);
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(0, h / 2);
  ctx.moveTo(-w / 4, -h / 2);
  ctx.lineTo(-w / 4, h / 2);
  ctx.moveTo(w / 4, -h / 2);
  ctx.lineTo(w / 4, h / 2);
  ctx.moveTo(-w / 2, -h / 4);
  ctx.lineTo(w / 2, -h / 4);
  ctx.moveTo(-w / 2, h / 4);
  ctx.lineTo(w / 2, h / 4);
  ctx.stroke();
  ctx.strokeStyle = BONE;
  ctx.lineWidth = Math.max(1, view.px(1.15));
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.moveTo(w / 2, -h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.stroke();
  ctx.restore();
}

function drawStake(ctx, view, cam) {
  const foot = cam.worldToView(0, 0);
  const top = cam.worldToView(0, 1.7);
  const visible =
    foot.x > -30 && foot.x < VIEW_W + 30 && top.y < VIEW_H + 40 && foot.y > -20;
  if (!visible) return false;
  ctx.save();
  ctx.strokeStyle = "#5a4a36";
  ctx.lineWidth = Math.max(2, view.px(3));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(view.sx(foot.x), view.sy(foot.y));
  ctx.lineTo(view.sx(top.x), view.sy(top.y));
  ctx.stroke();
  ctx.restore();
  return { x: top.x, y: top.y, foot };
}

function drawWindsock(ctx, view, x, y, windMag, clock, reduced) {
  const len = 28 + clamp(windMag, 0, 12) * 4.2;
  const droop = clamp(18 - windMag * 1.6, 2, 18);
  const flutter = reduced ? 0 : Math.sin(clock * (2.2 + windMag * 0.4)) * Math.min(6, 1.2 + windMag * 0.5);
  const ang = -0.18 + (windMag / 10) * 0.35 + flutter * 0.03;
  ctx.save();
  ctx.translate(view.sx(x), view.sy(y));
  ctx.rotate(ang);
  ctx.strokeStyle = "#5a4a36";
  ctx.lineWidth = Math.max(1.4, view.px(2));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, view.px(10));
  ctx.lineTo(0, 0);
  ctx.stroke();
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const x0 = t0 * len;
    const x1 = t1 * len;
    const y0 = (t0 * t0) * droop + (i % 2 === 0 ? 0 : flutter * 0.2);
    const y1 = (t1 * t1) * droop;
    const h0 = (1 - t0) * 7;
    const h1 = (1 - t1) * 7;
    ctx.beginPath();
    ctx.moveTo(view.px(x0), view.px(y0 - h0));
    ctx.lineTo(view.px(x1), view.px(y1 - h1));
    ctx.lineTo(view.px(x1), view.px(y1 + h1));
    ctx.lineTo(view.px(x0), view.px(y0 + h0));
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? KITE_RED : KITE_WHITE;
    ctx.strokeStyle = BONE;
    ctx.lineWidth = Math.max(0.7, view.px(0.8));
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawReel(ctx, view, fx) {
  const cx = view.sx(REEL_CX);
  const cy = view.sy(REEL_CY);
  const r = view.px(REEL_R);
  const ang = Number(fx?.reelAngle) || 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba("#3a3530", 0.08);
  ctx.fill();
  ctx.lineWidth = Math.max(2, view.px(5));
  ctx.strokeStyle = rgba("#5a4a36", 0.82);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.2, view.px(2.2));
  ctx.strokeStyle = rgba("#3a3530", 0.55);
  ctx.stroke();
  ctx.strokeStyle = rgba("#3a3530", 0.45);
  ctx.lineWidth = Math.max(1, view.px(1.6));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12);
    ctx.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, view.px(10), 0, Math.PI * 2);
  ctx.fillStyle = rgba("#5a4a36", 0.85);
  ctx.fill();
  ctx.restore();
  // dead-zone mark
  ctx.save();
  ctx.strokeStyle = rgba(INK, 0.12);
  ctx.lineWidth = Math.max(1, view.px(1));
  ctx.beginPath();
  ctx.moveTo(view.sx(REEL_CX), view.sy(REEL_CY - 16));
  ctx.lineTo(view.sx(REEL_CX), view.sy(REEL_CY + 16));
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const label = (text, y, size, alpha) => {
    ctx.font = `700 ${Math.max(10, view.px(size))}px ${FONT}`;
    const x = view.sx(REEL_CX);
    const yy = view.sy(y);
    ctx.lineWidth = Math.max(3, view.px(3.4));
    ctx.strokeStyle = rgba(HUD_BG, 0.88);
    ctx.strokeText(text, x, yy);
    ctx.fillStyle = rgba(INK, alpha);
    ctx.fillText(text, x, yy);
  };
  label("↑ 出す", REEL_CY - REEL_R * 0.58, 12, 0.8);
  label("↓ 巻く", REEL_CY + REEL_R * 0.58, 12, 0.8);
  ctx.restore();
}

function drawSteer(ctx, view, state) {
  const x = view.sx(STEER_CX - STEER_HALF_W);
  const y = view.sy(STEER_CY - STEER_HALF_H);
  const w = view.px(STEER_HALF_W * 2);
  const h = view.px(STEER_HALF_H * 2);
  ctx.save();
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, view.px(18));
  else ctx.rect(x, y, w, h);
  ctx.fillStyle = rgba("#1c2430", 0.12);
  ctx.strokeStyle = rgba("#1c2430", 0.28);
  ctx.lineWidth = Math.max(1, view.px(1.4));
  ctx.fill();
  ctx.stroke();
  const tilt = clamp(Number(state?.right?.tilt) || 0, -1, 1);
  const nx = view.sx(STEER_CX + tilt * STEER_HALF_W);
  const ny = view.sy(STEER_CY);
  ctx.beginPath();
  ctx.arc(nx, ny, view.px(9), 0, Math.PI * 2);
  ctx.fillStyle = rgba(HUD_BG, 0.92);
  ctx.strokeStyle = rgba(INK, 0.45);
  ctx.lineWidth = Math.max(1, view.px(1.2));
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawThumbGuide(ctx, view, x, y, active, hint) {
  const r = view.px(THUMB_GUIDE_R);
  ctx.save();
  ctx.beginPath();
  ctx.arc(view.sx(x), view.sy(y), r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(HUD_BG, active ? 0.42 : hint ? 0.34 : 0.22);
  ctx.strokeStyle = rgba(INK, active ? 0.55 : 0.32);
  ctx.lineWidth = Math.max(1.2, view.px(1.6));
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(view.sx(x), view.sy(y), r * 0.42, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(INK, 0.22);
  ctx.lineWidth = Math.max(1, view.px(1));
  ctx.stroke();
  ctx.restore();
}

function leftThumbPos(left) {
  if (left?.active && Number.isFinite(left.x) && Number.isFinite(left.y)) {
    return { x: left.x, y: left.y, active: true };
  }
  return { x: REEL_CX, y: REEL_CY, active: false };
}

function rightThumbPos(right) {
  if (right?.active && Number.isFinite(right.x)) {
    return {
      x: clamp(right.x, STEER_CX - STEER_HALF_W, STEER_CX + STEER_HALF_W),
      y: STEER_CY,
      active: true,
    };
  }
  return { x: STEER_CX, y: STEER_CY, active: false };
}

function worldBounds(state) {
  const rings = ringsOf(state);
  const kite = kitePos(state);
  let minX = Math.min(0, kite.x);
  let maxX = Math.max(8, kite.x);
  let minY = 0;
  let maxY = Math.max(64, kite.y);
  for (const r of rings) {
    const x = Number(r?.x);
    const y = Number(r?.y);
    const rad = Number(r?.r) || 6;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x - rad);
    maxX = Math.max(maxX, x + rad);
    minY = Math.min(minY, y - rad);
    maxY = Math.max(maxY, y + rad);
  }
  const p = state?.params || {};
  if (Number.isFinite(Number(p.bandY)) && Number.isFinite(Number(p.bandW))) {
    minY = Math.min(minY, Number(p.bandY) - Number(p.bandW) / 2);
    maxY = Math.max(maxY, Number(p.bandY) + Number(p.bandW) / 2);
  }
  minY = Math.min(minY, 0);
  maxY = Math.max(maxY, 64);
  const padX = 6;
  const padY = 4;
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
}

function drawMinimap(ctx, view, state) {
  const x = 12;
  const y = 50;
  const w = 112;
  const h = 136;
  const boxX = view.sx(x);
  const boxY = view.sy(y);
  const boxW = view.px(w);
  const boxH = view.px(h);
  ctx.save();
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(boxX, boxY, boxW, boxH, view.px(5));
  else ctx.rect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = rgba(HUD_BG, 0.9);
  ctx.strokeStyle = rgba(INK, 0.22);
  ctx.lineWidth = Math.max(1, view.px(1));
  ctx.fill();
  ctx.stroke();
  ctx.font = `700 ${Math.max(10, view.px(11))}px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("輪", boxX + boxW / 2, boxY + view.px(4));

  const innerX = x + 18;
  const innerY = y + 20;
  const innerW = w - 26;
  const innerH = h - 28;
  const b = worldBounds(state);
  const spanX = Math.max(8, b.maxX - b.minX);
  const spanY = Math.max(8, b.maxY - b.minY);
  const map = (wx, wy) => ({
    x: innerX + ((wx - b.minX) / spanX) * innerW,
    y: innerY + innerH - ((wy - b.minY) / spanY) * innerH,
  });

  const p = state?.params || {};
  if (Number.isFinite(Number(p.bandY)) && Number.isFinite(Number(p.bandW))) {
    const top = map(0, Number(p.bandY) + Number(p.bandW) / 2);
    const bot = map(0, Number(p.bandY) - Number(p.bandW) / 2);
    ctx.fillStyle = rgba("#7eb7d9", 0.28);
    const yy = view.sy(Math.min(top.y, bot.y));
    ctx.fillRect(view.sx(innerX), yy, view.px(innerW), Math.abs(view.sy(bot.y) - view.sy(top.y)));
  }

  const rings = ringsOf(state);
  const current = currentRingIndex(state);
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    const c = map(Number(r.x) || 0, Number(r.y) || 0);
    const rr = Math.max(view.px(3.5), view.px(((Number(r.r) || 6) / spanX) * innerW));
    ctx.beginPath();
    ctx.arc(view.sx(c.x), view.sy(c.y), rr, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(RING, ringDone(state, i) ? 0.35 : i === current ? 1 : 0.85);
    ctx.lineWidth = Math.max(1, view.px(i === current ? 1.8 : 1.3));
    ctx.setLineDash([view.px(2.4), view.px(1.8)]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const kite = kitePos(state);
  const k = map(kite.x, kite.y);
  ctx.beginPath();
  ctx.moveTo(view.sx(k.x), view.sy(k.y - 5));
  ctx.lineTo(view.sx(k.x + 4), view.sy(k.y + 4));
  ctx.lineTo(view.sx(k.x - 4), view.sy(k.y + 4));
  ctx.closePath();
  ctx.fillStyle = KITE_RED;
  ctx.fill();

  // altitude cue — labels stay off the rail so they do not hide the marker
  const railX = view.sx(x + 8);
  const railY0 = view.sy(innerY);
  const railY1 = view.sy(innerY + innerH);
  ctx.strokeStyle = rgba(INK, 0.4);
  ctx.lineWidth = Math.max(1.2, view.px(1.6));
  ctx.beginPath();
  ctx.moveTo(railX, railY0);
  ctx.lineTo(railX, railY1);
  ctx.stroke();
  const ky = view.sy(k.y);
  ctx.fillStyle = KITE_RED;
  ctx.strokeStyle = rgba(HUD_BG, 0.95);
  ctx.lineWidth = Math.max(1, view.px(1.2));
  ctx.beginPath();
  ctx.arc(railX, ky, view.px(3.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.font = `700 ${Math.max(9, view.px(9.5))}px ${FONT}`;
  ctx.fillStyle = rgba(INK, 0.82);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("高", railX, railY0 - view.px(7));
  ctx.fillText("低", railX, railY1 + view.px(7));
  ctx.restore();
  ctx.restore();
}

function fitWorld(items, box) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    minX = Math.min(minX, it.x - (it.r || 0));
    maxX = Math.max(maxX, it.x + (it.r || 0));
    minY = Math.min(minY, it.y - (it.r || 0));
    maxY = Math.max(maxY, it.y + (it.r || 0));
  }
  if (!Number.isFinite(minX)) {
    minX = -12;
    maxX = 20;
    minY = 0;
    maxY = 64;
  }
  minY = Math.min(minY, 0);
  const pad = 4;
  minX -= pad;
  maxX += pad;
  minY -= pad / 2;
  maxY += pad;
  const spanX = Math.max(8, maxX - minX);
  const spanY = Math.max(8, maxY - minY);
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const ox = box.x + (box.w - spanX * scale) / 2;
  const oy = box.y + (box.h - spanY * scale) / 2;
  return {
    map(wx, wy) {
      return {
        x: ox + (wx - minX) * scale,
        y: oy + (maxY - wy) * scale,
      };
    },
    scale,
  };
}

/**
 * タイトルの輪の縮小図。配置の解説も数値も出さない。
 * @param {HTMLCanvasElement} canvas
 * @param {object} state
 */
export function drawTitlePreview(canvas, state) {
  if (!canvas || typeof canvas.getContext !== "function") return;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  const dpr = Math.min((typeof window !== "undefined" && window.devicePixelRatio) || 1, 2);
  const cssW = Math.max(1, canvas.clientWidth || 240);
  const cssH = Math.max(1, canvas.clientHeight || 160);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = HUD_BG;
  ctx.fillRect(0, 0, cssW, cssH);
  const sky = ctx.createLinearGradient(0, 0, 0, cssH);
  sky.addColorStop(0, SKY_A);
  sky.addColorStop(1, SKY_B);
  ctx.fillStyle = sky;
  ctx.fillRect(2, 2, cssW - 4, cssH - 4);
  const rings = ringsOf(state);
  const p = state?.params || {};
  const items = rings.map((r) => ({
    x: Number(r.x) || 0,
    y: Number(r.y) || 0,
    r: Number(r.r) || 6,
  }));
  if (Number.isFinite(Number(p.bandY))) {
    items.push({ x: Number(p.bandX) || 0, y: Number(p.bandY), r: (Number(p.bandW) || 10) / 2 });
  }
  const box = { x: 10, y: 8, w: cssW - 20, h: cssH - 16 };
  const fit = fitWorld(items, box);
  if (Number.isFinite(Number(p.bandY)) && Number.isFinite(Number(p.bandW))) {
    const top = fit.map(Number(p.bandX) || 0, Number(p.bandY) + Number(p.bandW) / 2);
    const bot = fit.map(Number(p.bandX) || 0, Number(p.bandY) - Number(p.bandW) / 2);
    ctx.fillStyle = rgba("#f7fbff", 0.28);
    ctx.fillRect(box.x, Math.min(top.y, bot.y), box.w, Math.abs(bot.y - top.y));
  }
  for (const r of rings) {
    const c = fit.map(Number(r.x) || 0, Number(r.y) || 0);
    const rr = Math.max(4, (Number(r.r) || 6) * fit.scale);
    ctx.beginPath();
    ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
    ctx.setLineDash([3.5, 2.5]);
    ctx.strokeStyle = rgba("#3a3530", 0.45);
    ctx.lineWidth = 3.1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(RING, 1);
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {{ reducedMotion?: boolean, fx?: object, left?: object, right?: object }} [opts]
 */
export function drawScene(ctx, state, opts = {}) {
  const canvas = ctx.canvas;
  const { cssW, cssH, dpr } = syncCanvasSize(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const view = makeView(cssW, cssH);
  const reduced = !!opts.reducedMotion;
  const fx = opts.fx;
  const cam = makeCamera(state, fx, reduced);
  const windMag = windMagOf(state);
  const clock = Number(fx?.clock) || 0;
  const playing = state?.status === "playing";
  const phase = state?.phase;
  const reveal = playing && phase === "reveal";

  fillSky(ctx, view);
  drawClouds(ctx, view, state, fx, reduced, windMag);
  drawHills(ctx, view, cam);
  drawBand(ctx, view, cam, state);

  const stake = drawStake(ctx, view, cam);
  if (stake) drawWindsock(ctx, view, stake.x, stake.y, windMag, clock, reduced);

  if (playing || state?.status === "over") {
    drawTrail(ctx, view, cam, fx, reveal || state?.status === "over");
  }
  drawRings(ctx, view, cam, state, { skipCurrent: playing && (phase === "release" || phase === "fly") });
  drawLine(ctx, view, cam, state, { fromMid: false });

  const showControls = playing && phase !== "reveal";
  if (showControls || state?.status === "title") {
    drawReel(ctx, view, fx);
    if (showControls) drawSteer(ctx, view, state);
  }

  if (!stake) {
    drawWindsock(ctx, view, 74, 300, windMag, clock, reduced);
  }

  const leftPos = leftThumbPos(opts.left);
  const rightPos = rightThumbPos(opts.right);
  if (showControls) {
    drawThumbGuide(ctx, view, leftPos.x, leftPos.y, leftPos.active, !!state?.hintLeft);
    drawThumbGuide(ctx, view, rightPos.x, rightPos.y, rightPos.active, !!state?.hintRight);
    drawMotionGuides(ctx, view, state);
  }

  // 糸の途中と凧、今の輪は指より手前
  drawLine(ctx, view, cam, state, { fromMid: true });
  if (playing && (phase === "release" || phase === "fly")) {
    drawRings(ctx, view, cam, state, { onlyCurrent: true });
  } else if (reveal || state?.status === "over") {
    // rings already drawn; current stays visible in the overlay
  }
  drawKite(ctx, view, cam, state, fx, reduced, windMag);

  if (playing && phase !== "reveal") drawMinimap(ctx, view, state);

  const fxView = {
    ...view,
    reducedMotion: reduced,
    worldToView: cam.worldToView,
  };
  drawFx(ctx, fx, fxView, state);
}
