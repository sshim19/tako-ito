/** 共有文と localStorage の読み書き。日付は実行時の JST。 */

import * as constants from "../engine/constants.mjs";

export const GAME_TITLE = "凧の糸";

export const STORAGE_BEST = constants.STORAGE_BEST ?? "tako-ito:bestScore";
export const STORAGE_DAILY_PREFIX =
  constants.STORAGE_DAILY_PREFIX ?? "tako-ito:daily:";
export const SEED_PREFIX = constants.SEED_PREFIX ?? "tako-ito:";

export function seedString(dateJst) {
  if (typeof constants.seedString === "function") return constants.seedString(dateJst);
  return SEED_PREFIX + dateJst;
}

export function dailyKey(dateJst) {
  if (typeof constants.dailyKey === "function") return constants.dailyKey(dateJst);
  return STORAGE_DAILY_PREFIX + dateJst;
}

/** 開示の吹き出し。「よく揚がった」だけ「！」。 */
export const GRADE_CALLOUTS = constants.GRADE_BALLOONS ?? {
  lofty: "よく揚がった！",
  good: "よい高さ",
  close: "おしい",
  off: "ふらついた",
  early: "まだ早い",
};

/** 終了画面の等級。「よく揚がった」のときだけ「凧」を付ける。 */
export const GRADE_RESULT = {
  lofty: "よく揚がった凧",
  good: "よい高さ",
  close: "おしい",
  off: "ふらついた",
  early: "まだ早い",
};

/** 共有文の等級。接尾は付けない。 */
export const GRADE_SHARE = constants.GRADE_SHARE ?? {
  lofty: "よく揚がった",
  good: "よい高さ",
  close: "おしい",
  off: "ふらついた",
  early: "まだ早い",
};

export const WIND_LABELS = constants.WIND_LABELS ?? {
  light: "弱め",
  normal: "ふつう",
  strong: "強め",
};

/**
 * @param {Date} [now]
 * @returns {{ dateJst: string, dateLabel: string, year: number, month: number, day: number }}
 */
export function getJstDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const pick = (type) => Number(parts.find((p) => p.type === type)?.value);
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  const dateJst = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dateLabel = `${month}月${day}日`;
  return { dateJst, dateLabel, year, month, day };
}

/** 画面表示用。0–100 なので桁区切りは出ない。 */
export function formatScore(score) {
  return Math.max(0, Math.floor(Number(score) || 0)).toLocaleString("ja-JP");
}

/**
 * @param {string | null | undefined} grade
 * @returns {string}
 */
export function gradeCallout(grade) {
  return GRADE_CALLOUTS[grade] || GRADE_CALLOUTS.early;
}

/**
 * @param {string | null | undefined} grade
 * @returns {string}
 */
export function gradeResult(grade) {
  return GRADE_RESULT[grade] || GRADE_RESULT.early;
}

/**
 * @param {string | null | undefined} grade
 * @returns {string}
 */
export function gradeShare(grade) {
  return GRADE_SHARE[grade] || GRADE_SHARE.early;
}

/**
 * @param {string | null | undefined} wind
 * @returns {string}
 */
export function windLabel(wind) {
  if (wind === "弱め" || wind === "ふつう" || wind === "強め") return wind;
  return WIND_LABELS[wind] || WIND_LABELS.normal;
}

/**
 * 飛行開始直後に一度出す短い条件。「風は強め」
 * @param {{ wind?: string } | null | undefined} params
 */
export function dailyCondition(params) {
  return `風は${windLabel(params?.wind)}`;
}

/**
 * タイトルの今日の条件。「今日は、風は強め。」
 * @param {{ wind?: string } | null | undefined} params
 */
export function titleDailyLine(params) {
  return `今日は、${dailyCondition(params)}。`;
}

function readNum(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} dateJst
 * @param {Storage} [storage]
 * @returns {{ bestScore: number | null, todayBestScore: number | null }}
 */
export function loadBests(dateJst, storage = globalThis.localStorage) {
  if (!storage) return { bestScore: null, todayBestScore: null };
  return {
    bestScore: readNum(storage, STORAGE_BEST),
    todayBestScore: readNum(storage, dailyKey(dateJst)),
  };
}

/**
 * 今回の得点を保存する。0点は書き込まない（未記録のまま。0 を新記録にしない）。
 * isNewTodayBest は自己ベスト更新と重なるときは false（文言を重ねない）。
 *
 * @param {{ dateJst: string, score: number }} rec
 * @param {Storage} [storage]
 */
export function saveBests({ dateJst, score }, storage = globalThis.localStorage) {
  const prev = loadBests(dateJst, storage);
  const value = Math.max(0, Math.floor(Number(score) || 0));
  if (value <= 0) {
    return {
      bestScore: prev.bestScore,
      todayBestScore: prev.todayBestScore,
      isNewBest: false,
      isNewTodayBest: false,
    };
  }
  const isNewBest = value > (prev.bestScore ?? 0);
  const todayGrew = value > (prev.todayBestScore ?? 0);
  const bestScore = prev.bestScore == null ? value : Math.max(prev.bestScore, value);
  const todayBestScore =
    prev.todayBestScore == null ? value : Math.max(prev.todayBestScore, value);
  try {
    if (bestScore > 0) storage?.setItem(STORAGE_BEST, String(bestScore));
    if (todayBestScore > 0) storage?.setItem(dailyKey(dateJst), String(todayBestScore));
  } catch {
    /* private mode など */
  }
  return {
    bestScore,
    todayBestScore,
    isNewBest,
    isNewTodayBest: todayGrew && !isNewBest,
  };
}

/**
 * 改行3行。風の加減・輪の配置・突風の時刻は出さない。点数はカンマなし。
 * @param {{ dateLabel: string, score: number, grade?: string | null }} rec
 */
export function shareText({ dateLabel, score, grade = null }) {
  const n = Math.max(0, Math.floor(Number(score) || 0));
  return `${GAME_TITLE}\n${dateLabel}\n${gradeShare(grade)} ${n}点`;
}

/**
 * 公開ページの URL。query / hash は付けない。file: は空文字。
 * @param {Pick<Location, "origin" | "protocol" | "pathname">} [loc]
 */
export function sharePageUrl(loc = globalThis.location) {
  if (!loc || loc.protocol === "file:" || !loc.origin || loc.origin === "null") return "";
  let path = String(loc.pathname || "/");
  path = path.replace(/\/index\.html$/i, "/");
  if (!path) path = "/";
  return `${loc.origin}${path}`;
}

/** @param {{ text: string, url?: string }} rec */
export function tweetShareUrl({ text, url = "" }) {
  const params = new URLSearchParams();
  if (text) params.set("text", text);
  if (url) params.set("url", url);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/** 結果文と URL を本文に載せる。 */
/** @param {{ text: string, url?: string }} rec */
export function lineShareUrl({ text, url = "" }) {
  const body = [text, url].filter(Boolean).join("\n");
  return `https://line.me/R/share?text=${encodeURIComponent(body)}`;
}
