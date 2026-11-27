/**
 * Web Audio だけで鳴らす効果音。ファイルもライブラリも使わない。
 * エンジンは触らず、state の変化から鳴らす音を決める。丘の上の、風を含んだ落ち着いた音にする。
 */

import * as constants from "../engine/constants.mjs";
import { windAt } from "../engine/wind.mjs";

export const MUTE_KEY = constants.STORAGE_MUTED ?? "tako-ito:muted";
const MASTER_GAIN = 0.34;
const STRESS_WARN = constants.STRESS_WARN ?? 1.22;
const HOLD_TIME = constants.HOLD_TIME ?? 2;

function readMuted(storage) {
  if (!storage) return false;
  try {
    const v = storage.getItem(MUTE_KEY);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

function writeMuted(muted, storage) {
  if (!storage) return;
  try {
    storage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadMuted(storage = globalThis.localStorage) {
  return readMuted(storage);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
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

/** 描画・音用。エンジンの windAt と同じ式。 */
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

function ringDoneCount(state) {
  const prog = Array.isArray(state?.ringProg) ? state.ringProg : [];
  const rings = Array.isArray(state?.params?.rings) ? state.params.rings : [];
  let n = 0;
  for (let i = 0; i < prog.length; i++) {
    const kind = rings[i]?.kind || "pass";
    if (kind === "hold") {
      if ((Number(prog[i]?.holdT) || 0) >= HOLD_TIME - 1e-6) n += 1;
    } else if (prog[i]?.passed) {
      n += 1;
    }
  }
  return n;
}

function snapshot(state) {
  return {
    status: state?.status || "title",
    phase: state?.phase || "release",
    snapped: !!state?.snapped,
    crashed: !!state?.crashed,
    rings: ringDoneCount(state),
    grade: state?.grade ?? null,
    score: Math.max(0, Math.floor(Number(state?.score) || 0)),
    lineRate: Number(state?.left?.lineRate) || 0,
    tension: Number(state?.tension) || 0,
    stress: Number(state?.stress) || 0,
    windMag: windMagOf(state),
  };
}

/**
 * 直前の snapshot と新しい state から、鳴らすべき単発の音を決める。純関数。
 * @returns {{ type: "release"|"snap"|"crash"|"ring"|"reveal", grade?: string, score?: number } | null}
 */
export function soundEvent(prev, state) {
  if (!state) return null;
  const now = snapshot(state);
  const before = prev || {
    status: "idle",
    phase: "none",
    snapped: false,
    crashed: false,
    rings: 0,
  };
  if (!before.snapped && now.snapped) return { type: "snap" };
  if (!before.crashed && now.crashed) return { type: "crash" };
  if (now.rings > (Number(before.rings) || 0)) {
    return { type: "ring", amount: now.rings - (Number(before.rings) || 0) };
  }
  if (
    now.status === "playing" &&
    now.phase === "release" &&
    (before.status !== "playing" || before.phase !== "release")
  ) {
    return { type: "release" };
  }
  if (before.phase !== "reveal" && now.phase === "reveal") {
    return { type: "reveal", grade: now.grade || "early", score: now.score };
  }
  if (before.status !== "over" && now.status === "over" && before.phase !== "reveal") {
    return { type: "reveal", grade: now.grade || "early", score: now.score };
  }
  return null;
}

export function createSfx() {
  return {
    prev: null,
    muted: loadMuted(),
    ctx: null,
    master: null,
    compressor: null,
    noiseBuf: null,
    windSrc: null,
    windFilter: null,
    windGain: null,
    humOsc: null,
    humOsc2: null,
    humFilter: null,
    humGain: null,
    lastReelAt: 0,
  };
}

export function resetSfx(sfx) {
  if (!sfx) return;
  sfx.prev = null;
  sfx.lastReelAt = 0;
  stopLoops(sfx, true);
}

function applyMuteGain(sfx, now) {
  if (!sfx?.master || !sfx.ctx) return;
  const g = sfx.master.gain;
  const t = now ?? sfx.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(sfx.muted ? 0 : MASTER_GAIN, t + 0.03);
}

export function setMuted(sfx, muted, storage = globalThis.localStorage) {
  if (!sfx) return;
  sfx.muted = !!muted;
  writeMuted(sfx.muted, storage);
  applyMuteGain(sfx);
}

export function isMuted(sfx) {
  return !!sfx?.muted;
}

/** 最初の操作で AudioContext を作り、iOS 向けに resume する。 */
export function unlockSfx(sfx) {
  if (!sfx) return;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  try {
    if (!sfx.ctx) {
      const ctx = new AC();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 2.8;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      const master = ctx.createGain();
      master.gain.value = sfx.muted ? 0 : MASTER_GAIN;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      sfx.ctx = ctx;
      sfx.master = master;
      sfx.compressor = compressor;
    }
    if (sfx.ctx.state === "suspended") {
      const p = sfx.ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  } catch {
    /* AudioContext unavailable */
  }
}

function noiseBuffer(sfx) {
  if (sfx.noiseBuf) return sfx.noiseBuf;
  const ctx = sfx.ctx;
  const len = Math.floor(ctx.sampleRate * 1.4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.9 + white * 0.1;
    data[i] = last * 2.1;
  }
  sfx.noiseBuf = buf;
  return buf;
}

function playTone(ctx, dest, { freq, type = "sine", t0, dur, peak, attack = 0.012, endFreq }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq && endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => {
    try {
      osc.disconnect();
      g.disconnect();
    } catch {
      /* already gone */
    }
  };
}

function playNoise(sfx, dest, { t0, dur, peak, attack = 0.008, freq = 1200, type = "lowpass", q = 0.7, endFreq }) {
  const ctx = sfx.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(sfx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t0);
  if (endFreq) filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + dur);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
  src.onended = () => {
    try {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    } catch {
      /* already gone */
    }
  };
}

/** 紙が風をはらむ、短い音。 */
function playRelease(sfx) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.01;
  playNoise(sfx, dest, {
    t0,
    dur: 0.42,
    peak: 0.1,
    attack: 0.04,
    freq: 900,
    type: "bandpass",
    q: 0.7,
    endFreq: 280,
  });
  playTone(ctx, dest, {
    freq: 196,
    endFreq: 148,
    type: "sine",
    t0,
    dur: 0.38,
    peak: 0.055,
    attack: 0.03,
  });
}

/** 巻き枠の、乾いた短い回転。出すほど少し高い。 */
function playReel(sfx, lineRate) {
  const now = sfx.ctx.currentTime;
  const rate = Math.abs(Number(lineRate) || 0);
  const interval = clamp(0.16 - Math.min(0.08, rate * 0.012), 0.07, 0.18);
  if (now - (sfx.lastReelAt || 0) < interval) return;
  sfx.lastReelAt = now;
  const payout = (Number(lineRate) || 0) > 0;
  const freq = payout ? 240 + Math.min(80, rate * 8) : 170 - Math.min(40, rate * 5);
  playTone(sfx.ctx, sfx.master, {
    freq,
    endFreq: freq * 0.82,
    type: "triangle",
    t0: now,
    dur: 0.07,
    peak: 0.028 + Math.min(0.02, rate * 0.003),
    attack: 0.004,
  });
  playNoise(sfx, sfx.master, {
    t0: now,
    dur: 0.05,
    peak: 0.03,
    attack: 0.003,
    freq: payout ? 1800 : 1100,
    type: "bandpass",
    q: 0.9,
    endFreq: 400,
  });
}

/** 糸の、乾いた一音。 */
function playSnap(sfx) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.002;
  playTone(ctx, dest, {
    freq: 520,
    endFreq: 140,
    type: "triangle",
    t0,
    dur: 0.16,
    peak: 0.13,
    attack: 0.003,
  });
  playNoise(sfx, dest, {
    t0,
    dur: 0.12,
    peak: 0.09,
    attack: 0.003,
    freq: 2600,
    type: "highpass",
    q: 0.6,
    endFreq: 500,
  });
  playTone(ctx, dest, {
    freq: 120,
    endFreq: 64,
    type: "sine",
    t0: t0 + 0.02,
    dur: 0.22,
    peak: 0.05,
    attack: 0.008,
  });
}

/** 紙の、短い潰れ。 */
function playCrash(sfx) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.002;
  playNoise(sfx, dest, {
    t0,
    dur: 0.18,
    peak: 0.11,
    attack: 0.006,
    freq: 700,
    type: "lowpass",
    q: 0.7,
    endFreq: 160,
  });
  playTone(ctx, dest, {
    freq: 110,
    endFreq: 60,
    type: "triangle",
    t0,
    dur: 0.2,
    peak: 0.06,
    attack: 0.008,
  });
}

/** 輪の通過。小さな、高い一拍。 */
function playRing(sfx) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.002;
  playTone(ctx, dest, {
    freq: 784,
    type: "sine",
    t0,
    dur: 0.18,
    peak: 0.055,
    attack: 0.006,
  });
  playTone(ctx, dest, {
    freq: 1176,
    type: "sine",
    t0: t0 + 0.02,
    dur: 0.16,
    peak: 0.03,
    attack: 0.01,
  });
}

/** 糸を巻いて風が遠ざかる音。等級に応じた余韻。 */
function playReveal(sfx, ev) {
  const ctx = sfx.ctx;
  const dest = sfx.master;
  const t0 = ctx.currentTime + 0.004;
  playTone(ctx, dest, {
    freq: 174,
    endFreq: 92,
    type: "sine",
    t0,
    dur: 0.46,
    peak: 0.07,
    attack: 0.02,
  });
  playNoise(sfx, dest, {
    t0,
    dur: 0.5,
    peak: 0.05,
    attack: 0.02,
    freq: 800,
    type: "lowpass",
    q: 0.5,
    endFreq: 140,
  });

  const grade = ev?.grade || "early";
  if (grade === "lofty" || grade === "good") {
    const root = grade === "lofty" ? 659 : 523;
    playTone(ctx, dest, {
      freq: root,
      type: "sine",
      t0: t0 + 0.16,
      dur: 0.5,
      peak: 0.08,
      attack: 0.025,
    });
    playTone(ctx, dest, {
      freq: root * 1.5,
      type: "sine",
      t0: t0 + 0.22,
      dur: 0.56,
      peak: 0.045,
      attack: 0.03,
    });
    if (grade === "lofty") {
      playTone(ctx, dest, {
        freq: root * 2,
        type: "sine",
        t0: t0 + 0.28,
        dur: 0.5,
        peak: 0.03,
        attack: 0.04,
      });
    }
  } else if (grade === "close") {
    playTone(ctx, dest, {
      freq: 220,
      endFreq: 196,
      type: "sine",
      t0: t0 + 0.14,
      dur: 0.36,
      peak: 0.06,
      attack: 0.02,
    });
  } else {
    playNoise(sfx, dest, {
      t0: t0 + 0.08,
      dur: 0.1,
      peak: 0.04,
      attack: 0.008,
      freq: 420,
      type: "lowpass",
      q: 0.6,
      endFreq: 140,
    });
    playTone(ctx, dest, {
      freq: 140,
      endFreq: 90,
      type: "sine",
      t0: t0 + 0.08,
      dur: 0.14,
      peak: 0.035,
      attack: 0.01,
    });
  }
}

function stopLoops(sfx, immediate) {
  if (!sfx?.ctx) {
    sfx.windSrc = null;
    sfx.windFilter = null;
    sfx.windGain = null;
    sfx.humOsc = null;
    sfx.humOsc2 = null;
    sfx.humFilter = null;
    sfx.humGain = null;
    return;
  }
  const t = sfx.ctx.currentTime;
  const fade = immediate ? 0.02 : 0.18;
  try {
    if (sfx.windGain) {
      sfx.windGain.gain.cancelScheduledValues(t);
      sfx.windGain.gain.setValueAtTime(sfx.windGain.gain.value, t);
      sfx.windGain.gain.linearRampToValueAtTime(0.0001, t + fade);
    }
    if (sfx.humGain) {
      sfx.humGain.gain.cancelScheduledValues(t);
      sfx.humGain.gain.setValueAtTime(sfx.humGain.gain.value, t);
      sfx.humGain.gain.linearRampToValueAtTime(0.0001, t + fade);
    }
  } catch {
    /* ignore */
  }
  if (!immediate) return;
  try {
    sfx.windSrc?.stop();
    sfx.windSrc?.disconnect();
    sfx.windFilter?.disconnect();
    sfx.windGain?.disconnect();
  } catch {
    /* already gone */
  }
  try {
    sfx.humOsc?.stop();
    sfx.humOsc2?.stop();
    sfx.humOsc?.disconnect();
    sfx.humOsc2?.disconnect();
    sfx.humFilter?.disconnect();
    sfx.humGain?.disconnect();
  } catch {
    /* already gone */
  }
  sfx.windSrc = null;
  sfx.windFilter = null;
  sfx.windGain = null;
  sfx.humOsc = null;
  sfx.humOsc2 = null;
  sfx.humFilter = null;
  sfx.humGain = null;
}

function ensureLoops(sfx) {
  if (!sfx.ctx || !sfx.master) return;
  const ctx = sfx.ctx;
  if (!sfx.windGain) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(sfx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.55;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(filter);
    filter.connect(g);
    g.connect(sfx.master);
    src.start();
    sfx.windSrc = src;
    sfx.windFilter = filter;
    sfx.windGain = g;
  }
  if (!sfx.humGain) {
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc.type = "sine";
    osc2.type = "triangle";
    osc.frequency.value = 72;
    osc2.frequency.value = 144;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(sfx.master);
    osc.start();
    osc2.start();
    sfx.humOsc = osc;
    sfx.humOsc2 = osc2;
    sfx.humFilter = filter;
    sfx.humGain = g;
  }
}

function syncLoops(sfx, state) {
  if (!sfx.ctx || sfx.muted) {
    if (sfx.windGain || sfx.humGain) stopLoops(sfx, false);
    return;
  }
  const playing = state?.status === "playing";
  const phase = state?.phase;
  const live = playing && (phase === "release" || phase === "fly") && !state?.snapped && !state?.crashed;
  if (!live) {
    if (sfx.windGain || sfx.humGain) {
      const t = sfx.ctx.currentTime;
      if (sfx.windGain) sfx.windGain.gain.setTargetAtTime(0.0001, t, 0.18);
      if (sfx.humGain) sfx.humGain.gain.setTargetAtTime(0.0001, t, 0.12);
    }
    return;
  }
  ensureLoops(sfx);
  const t = sfx.ctx.currentTime;
  const windMag = windMagOf(state);
  const tension = clamp(Number(state?.tension) || 0, 0, 1);
  const stress = Number(state?.stress) || 0;
  const windGain = 0.012 + Math.min(0.055, (windMag / 8) * 0.05);
  if (sfx.windGain) sfx.windGain.gain.setTargetAtTime(windGain, t, 0.16);
  if (sfx.windFilter) {
    sfx.windFilter.frequency.setTargetAtTime(280 + Math.min(700, windMag * 70), t, 0.2);
  }
  const taut = tension >= 0.24;
  const warn = stress >= STRESS_WARN;
  let hum = 0;
  if (taut) hum = 0.01 + tension * 0.028;
  if (warn) hum = Math.max(hum, 0.022);
  if (sfx.humGain) sfx.humGain.gain.setTargetAtTime(hum, t, 0.12);
  const baseF = warn ? 140 + Math.min(80, (stress - STRESS_WARN) * 90) : 68 + tension * 36;
  if (sfx.humOsc) sfx.humOsc.frequency.setTargetAtTime(baseF, t, 0.14);
  if (sfx.humOsc2) sfx.humOsc2.frequency.setTargetAtTime(baseF * (warn ? 2.4 : 2.02), t, 0.16);
  if (sfx.humFilter) sfx.humFilter.frequency.setTargetAtTime(warn ? 520 : 260, t, 0.16);

  const lineRate = Number(state?.left?.lineRate) || 0;
  if (Math.abs(lineRate) >= 0.85) playReel(sfx, lineRate);
}

/**
 * state の差分を見て効果音を鳴らす。飛行中の風と糸の唸りはループで追従する。
 * @param {object} sfx
 * @param {object} state
 */
export function syncSound(sfx, state) {
  if (!sfx) return null;
  const ev = soundEvent(sfx.prev, state);
  if (sfx.ctx && !sfx.muted) {
    try {
      syncLoops(sfx, state);
      if (ev?.type === "release") playRelease(sfx);
      else if (ev?.type === "ring") playRing(sfx);
      else if (ev?.type === "snap") {
        stopLoops(sfx, false);
        playSnap(sfx);
      } else if (ev?.type === "crash") {
        playCrash(sfx);
      } else if (ev?.type === "reveal") {
        stopLoops(sfx, false);
        playReveal(sfx, ev);
      }
    } catch {
      /* audio graph failed; ignore */
    }
  } else if (ev?.type === "reveal" || ev?.type === "snap") {
    stopLoops(sfx, false);
  }
  sfx.prev = snapshot(state);
  return ev;
}
