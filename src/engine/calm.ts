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

/**
 * F227: the fastest any light/dark blink or pulse may run, in cycles a second. WCAG 2.3.1 and
 * the Game Accessibility Guidelines ("avoid flickering") draw the line at three flashes a
 * second; we keep well under it (Quick Draw's half-screen pulse ran 3.5, Chop Chop's low
 * timer 3.2 and Tank Duel's fading shield 4.8).
 */
export const BLINK_MAX_HZ = 2;

/** On/off blink at `hz` cycles a second (capped at BLINK_MAX_HZ): true for the first half of each cycle. */
export function blink(t: number, hz = BLINK_MAX_HZ): boolean {
  return Math.sin(t * 2 * Math.PI * Math.min(hz, BLINK_MAX_HZ)) > 0;
}

/** A smooth 0..1 pulse at `hz` cycles a second (capped at BLINK_MAX_HZ). */
export function pulse(t: number, hz = BLINK_MAX_HZ): number {
  return 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * Math.min(hz, BLINK_MAX_HZ));
}
