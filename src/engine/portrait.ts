// FamiDuel is played with the phone lying flat between two people. A flat
// phone's orientation sensor is unreliable: lean in to putt, lift an edge, or
// pass the phone and the OS flips the page to landscape, which shrinks the
// portrait world into a sideways strip. Browsers can't lock orientation (iOS
// never; Android only in fullscreen), so we undo the OS turn ourselves: when a
// phone reports a landscape turn, the whole app is counter-rotated so the
// table stays fixed to the physical phone.

/** Degrees the app is counter-rotated by (CSS rotate, clockwise positive). */
export type Turn = 0 | 90 | -90;

/**
 * Pure rule. `angle` is the screen's turn from its natural orientation
 * (screen.orientation.angle, or the old window.orientation). Only phones
 * (coarse pointer) whose viewport is wider than tall are turned back; a
 * desktop or a landscape-native tablet reports angle 0 and is left alone.
 */
export function counterTurn(angle: number, vw: number, vh: number, coarse: boolean): Turn {
  if (!coarse || vw <= vh) return 0;
  const a = ((Math.round(angle) % 360) + 360) % 360;
  if (a === 90) return -90;
  if (a === 270) return 90;
  return 0;
}

/** Screen (client) offset from the element's centre → its own unrotated frame. */
export function unturn(turn: Turn, dx: number, dy: number): { x: number; y: number } {
  if (turn === -90) return { x: -dy, y: dx };
  if (turn === 90) return { x: dy, y: -dx };
  return { x: dx, y: dy };
}

let current: Turn = 0;
/** The turn applied right now (Stage maps pointers through it). */
export const currentTurn = (): Turn => current;

function screenAngle(): number {
  const so = (screen as Screen & { orientation?: { angle?: number } }).orientation;
  if (so && typeof so.angle === 'number') return so.angle;
  const wo = (window as unknown as { orientation?: number }).orientation;
  return typeof wo === 'number' ? wo : 0;
}

/** Keeps `root` (fixed, full screen) portrait on phones; calls `onChange` after each change. */
export function keepPortrait(root: HTMLElement, onChange: () => void): void {
  const coarse = window.matchMedia?.('(pointer: coarse)');
  const apply = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const turn = counterTurn(screenAngle(), vw, vh, !!coarse?.matches);
    const s = root.style;
    if (turn) {
      // Lay the app out as a vh × vw portrait box, centred, then rotate it.
      s.inset = 'auto';
      s.width = `${vh}px`;
      s.height = `${vw}px`;
      s.left = `${(vw - vh) / 2}px`;
      s.top = `${(vh - vw) / 2}px`;
      s.transform = `rotate(${turn}deg)`;
    } else {
      for (const k of ['inset', 'width', 'height', 'left', 'top', 'transform'] as const) s[k] = '';
    }
    root.dataset.turn = String(turn);
    const changed = turn !== current;
    current = turn;
    if (changed || turn) onChange();
  };
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  (screen as Screen & { orientation?: EventTarget }).orientation?.addEventListener?.('change', apply);
  apply();
}
