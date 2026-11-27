/**
 * 入力、向き、rAF、画面遷移の配線。
 *
 * エンジンインタフェース（engine/sim.mjs）:
 *   createInitialState({ seed, dateJst, bestScore, todayBestScore })
 *     → status は "playing"、phase は "release"。タイトルはこちらで "title" にする。
 *   tick(state, input, dt) → 新しい state（非破壊）。dt は秒。最大 50ms。
 *   input は {
 *     left:  { active, x, y },
 *     right: { active, x, y },
 *     finish: boolean,
 *     landscape: boolean
 *   }。
 *     x, y はそのフレームの論理 wu。active が false のとき x, y は無視する。
 *     finish はそのフレームの立ち上がりだけ true。
 *     landscape が false なら、tick は出す・巻く・傾ける・しまうを無視する（減衰のみ）。
 *   tick は input を書き換えない。
 */
import { tick, createInitialState, canFinish } from "./engine/sim.mjs";
import * as constants from "./engine/constants.mjs";
import {
  drawScene,
  drawTitlePreview,
  clientToLogical,
  inLeftZone,
  inRightZone,
} from "./render/draw.mjs";
import { createFx, resetFx, syncFx } from "./render/fx.mjs";
import { createSfx, resetSfx, syncSound, unlockSfx, setMuted } from "./render/sound.mjs";
import { bindScreens } from "./render/screens.mjs";
import {
  getJstDate,
  seedString,
  loadBests,
  saveBests,
  shareText,
  sharePageUrl,
  tweetShareUrl,
  lineShareUrl,
} from "./render/share.mjs";

const MAX_DT = constants.MAX_DT ?? 0.05;
const FLY_TIME = constants.FLY_TIME ?? constants.FLY_DURATION ?? constants.SHAPE_TIME ?? 75;
const FINISH_MIN_TIME =
  constants.FINISH_MIN ?? constants.FINISH_MIN_TIME ?? constants.FINISH_UNLOCK ?? 22;

const screens = bindScreens(document);
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });

const motionQuery =
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

function reducedMotion() {
  return !!motionQuery.matches;
}

function isLandscape() {
  return window.innerWidth >= window.innerHeight;
}

const { dateJst, dateLabel } = getJstDate();
const seed = seedString(dateJst);

let stored = loadBests(dateJst);
let state = titleStateFrom(stored);
let ended = false;
let landscape = isLandscape();

let leftPointer = null;
let rightPointer = null;
let left = { active: false, x: 0, y: 0 };
let right = { active: false, x: 0, y: 0 };
let finishPulse = false;

let lastTs = 0;
let lastShare = shareText({ dateLabel, score: 0, grade: "early" });
const fx = createFx();
const sfx = createSfx();
screens.setMuteUi(sfx.muted);
screens.setPortrait(!landscape);

function titleStateFrom(bests) {
  const playing = createInitialState({
    seed,
    dateJst,
    bestScore: bests.bestScore ?? 0,
    todayBestScore: bests.todayBestScore ?? 0,
  });
  return { ...playing, status: "title" };
}

function freshRun() {
  stored = loadBests(dateJst);
  ended = false;
  clearPointers();
  lastTs = 0;
  resetFx(fx);
  resetSfx(sfx);
  return createInitialState({
    seed,
    dateJst,
    bestScore: stored.bestScore ?? 0,
    todayBestScore: stored.todayBestScore ?? 0,
  });
}

function canFinishNow(s, isLand) {
  if (!isLand || !s) return false;
  if (typeof canFinish === "function") return canFinish(s);
  if (s.status !== "playing" || s.phase !== "fly") return false;
  if ((Number(s.zoneFrac) || 0) >= 0.999) return true;
  return (Number(s.flyT) || 0) >= FINISH_MIN_TIME;
}

function remainingTime(s) {
  if (!s || s.status !== "playing" || s.phase !== "fly") return null;
  return Math.max(0, FLY_TIME - (Number(s.flyT) || 0));
}

function finishRun(next) {
  if (ended) {
    state = next;
    return;
  }
  ended = true;
  clearPointers();
  state = next.status === "over" ? next : { ...next, status: "over" };
  const saved = saveBests({ dateJst, score: state.score });
  stored = { bestScore: saved.bestScore, todayBestScore: saved.todayBestScore };
  lastShare = shareText({ dateLabel, score: state.score, grade: state.grade });
  screens.showOver({
    score: state.score,
    grade: state.grade,
    todayBestScore: saved.todayBestScore,
    bestScore: saved.bestScore,
    isNewBest: saved.isNewBest,
    isNewTodayBest: saved.isNewTodayBest,
  });
}

function takeInput() {
  const input = {
    left: { active: left.active, x: left.x, y: left.y },
    right: { active: right.active, x: right.x, y: right.y },
    finish: finishPulse,
    landscape,
  };
  finishPulse = false;
  return input;
}

function clearPointers() {
  leftPointer = null;
  rightPointer = null;
  left = { active: false, x: 0, y: 0 };
  right = { active: false, x: 0, y: 0 };
  finishPulse = false;
}

function paint() {
  drawScene(ctx, state, {
    reducedMotion: reducedMotion(),
    fx,
    left,
    right,
  });
  if (state.status === "playing") {
    screens.updateHud({
      remaining: remainingTime(state),
      showTime: state.phase === "fly",
      canFinish: canFinishNow(state, landscape),
    });
    screens.setHints(!!state.hintLeft, !!state.hintRight);
  }
  if (state.status === "title" && screens.el.titlePath) {
    drawTitlePreview(screens.el.titlePath, state);
  }
}

function frame(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(Math.max((ts - lastTs) / 1000, 0), MAX_DT);
  lastTs = ts;

  if (state.status === "playing") {
    const input = takeInput();
    const next = tick(state, input, dt);
    syncFx(fx, next, dt, { reducedMotion: reducedMotion(), right, left });
    syncSound(sfx, next);
    if (next.status === "over") {
      finishRun(next);
    } else {
      state = next;
    }
  } else {
    if (state.status !== "over") clearPointers();
    syncFx(fx, state, dt, { reducedMotion: reducedMotion(), right, left });
    syncSound(sfx, state);
  }

  paint();
  requestAnimationFrame(frame);
}

function idleInput() {
  return {
    left: { active: false, x: 0, y: 0 },
    right: { active: false, x: 0, y: 0 },
    finish: false,
    landscape,
  };
}

function startPlay() {
  if (!landscape) {
    screens.setPortrait(true);
    return;
  }
  state = freshRun();
  state = tick(state, idleInput(), 0);
  screens.showPlay();
  screens.updateHud({
    remaining: remainingTime(state),
    showTime: state.phase === "fly",
    canFinish: canFinishNow(state, landscape),
  });
  screens.setHints(state.hintLeft !== false, state.hintRight !== false);
  paint();
}

function unlockAudio() {
  unlockSfx(sfx);
}

window.addEventListener("pointerdown", unlockAudio, { capture: true });
window.addEventListener("touchstart", unlockAudio, { capture: true });
window.addEventListener("keydown", unlockAudio);

screens.el.btnMute?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  unlockSfx(sfx);
  setMuted(sfx, !sfx.muted);
  screens.setMuteUi(sfx.muted);
});

screens.el.btnStart?.addEventListener("click", () => {
  unlockSfx(sfx);
  startPlay();
});

screens.el.btnRetry?.addEventListener("click", () => {
  unlockSfx(sfx);
  startPlay();
});

screens.el.btnFinish?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!canFinishNow(state, landscape)) return;
  finishPulse = true;
});

function currentShare() {
  return {
    text: lastShare,
    url: sharePageUrl(),
  };
}

function guardClick(fn) {
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  };
}

function openShareTab(href) {
  if (!href) return;
  window.open(href, "_blank", "noopener,noreferrer");
}

screens.el.btnShareX?.addEventListener(
  "click",
  guardClick(() => {
    openShareTab(tweetShareUrl(currentShare()));
  }),
);

screens.el.btnShareLine?.addEventListener(
  "click",
  guardClick(() => {
    openShareTab(lineShareUrl(currentShare()));
  }),
);

function eventPoint(e) {
  return clientToLogical(canvas, e.clientX, e.clientY);
}

function maybeCapture(e) {
  if (e.pointerType && e.pointerType !== "touch") {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
}

function isHudTarget(e) {
  const t = e.target;
  if (!t || typeof t.closest !== "function") return false;
  return !!t.closest("#btn-mute, #btn-finish, #btn-start, #btn-retry, .share-btn, .panel, .portrait");
}

function pointerDown(e) {
  if (state.status !== "playing" || !landscape) return;
  if (isHudTarget(e)) return;
  const pt = eventPoint(e);
  if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;

  if (leftPointer == null && inLeftZone(pt.x, pt.y)) {
    leftPointer = e.pointerId;
    left = { active: true, x: pt.x, y: pt.y };
    maybeCapture(e);
    if (e.cancelable) e.preventDefault();
    return;
  }

  if (rightPointer == null && inRightZone(pt.x, pt.y)) {
    rightPointer = e.pointerId;
    right = { active: true, x: pt.x, y: pt.y };
    maybeCapture(e);
    if (e.cancelable) e.preventDefault();
  }
}

function pointerMove(e) {
  if (state.status !== "playing") return;
  if (e.pointerId === leftPointer || e.pointerId === rightPointer) {
    if (e.cancelable) e.preventDefault();
  }
  if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
  const pt = eventPoint(e);
  if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
  if (e.pointerId === leftPointer) {
    left = { active: true, x: pt.x, y: pt.y };
  } else if (e.pointerId === rightPointer) {
    right = { active: true, x: pt.x, y: pt.y };
  }
}

function endHand(e) {
  if (e.pointerId === leftPointer) {
    leftPointer = null;
    left = { active: false, x: left.x, y: left.y };
    return true;
  }
  if (e.pointerId === rightPointer) {
    rightPointer = null;
    right = { active: false, x: right.x, y: right.y };
    return true;
  }
  return false;
}

function pointerUp(e) {
  if (endHand(e) && e.cancelable) e.preventDefault();
}

function pointerCancel(e) {
  // 離した扱い。糸も傾きも跳ねない（出す・巻くの速さと傾きは減衰し、張力は幾何だけから再計算する）。
  if (endHand(e) && e.cancelable) e.preventDefault();
}

canvas.addEventListener("pointerdown", pointerDown, { passive: false });
window.addEventListener("pointermove", pointerMove, { passive: false });
window.addEventListener("pointerup", pointerUp, { passive: false });
window.addEventListener("pointercancel", pointerCancel, { passive: false });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener(
  "touchstart",
  (e) => {
    if (state.status === "playing" && e.cancelable) e.preventDefault();
  },
  { passive: false },
);

window.addEventListener(
  "touchmove",
  (e) => {
    if (state.status === "playing" && e.cancelable) e.preventDefault();
  },
  { passive: false },
);

function applyOrientation() {
  const next = isLandscape();
  if (next === landscape) {
    screens.setPortrait(!next);
    return;
  }
  landscape = next;
  screens.setPortrait(!landscape);
  if (!landscape) {
    clearPointers();
  }
}

window.addEventListener("resize", applyOrientation);
window.addEventListener("orientationchange", applyOrientation);

screens.showTitle({ dateLabel, bestScore: stored.bestScore, params: state.params });
screens.updateHud({ remaining: null, showTime: false, canFinish: false });
paint();
requestAnimationFrame(frame);

