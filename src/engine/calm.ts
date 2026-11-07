// "Reduce motion" on the phone (iOS Settings > Accessibility > Motion, Android "Remove
// animations"): moving decoration holds still. The ghost finger stops in CSS
// (style.css), the power pictures freeze on one frame (app/powerpic.ts), the camera
// no longer shakes and full-screen flashes are a quarter as bright (engine/fx.ts). The game itself still moves: that is the game.

const QUERY = '(prefers-reduced-motion: reduce)';

/** True when the phone asks for less motion (false where there is no window, as in unit tests). */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(QUERY).matches;
}

/** Calls back whenever the phone's reduce motion setting flips. */
export function onReducedMotionChange(cb: () => void): void {
  if (typeof matchMedia !== 'function') return;
  matchMedia(QUERY).addEventListener?.('change', cb);
}
