/** 凧の糸: 左手は巻き枠を上下、右手は横の溝を左右。 */
import * as C from "../engine/constants.mjs";
import {
  drawTravelGuide,
  guideNow,
  pathLine,
  prefersReducedMotion,
} from "./motion-guide.mjs";

const REEL_CX = C.REEL_CX ?? C.LINE_CX ?? 188;
const REEL_CY = C.REEL_CY ?? C.LINE_CY ?? 268;
const STEER_CX = C.STEER_CX ?? C.TILT_CX ?? 648;
const STEER_CY = C.STEER_CY ?? C.TILT_CY ?? 268;
const STEER_HALF = C.STEER_HALF ?? C.STEER_HALF_W ?? 120;

export function drawMotionGuides(ctx, view, state) {
  if (state?.status !== "playing") return;
  if (state.phase === "reveal") return;
  const reduced = prefersReducedMotion();
  const t = guideNow();
  if (state.hintLeft !== false) {
    drawTravelGuide(ctx, view, pathLine(REEL_CX, REEL_CY - 80, REEL_CX, REEL_CY + 80, 18), t, {
      period: 2.4,
      loop: "pingpong",
      reduced,
      alpha: 0.48,
    });
  }
  if (state.hintRight !== false) {
    const pts = pathLine(STEER_CX - STEER_HALF * 0.82, STEER_CY, STEER_CX + STEER_HALF * 0.82, STEER_CY, 18);
    drawTravelGuide(ctx, view, pts, t, { period: 2.2, loop: "pingpong", reduced, alpha: 0.48 });
  }
}
