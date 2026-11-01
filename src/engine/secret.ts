// Pass-and-play for hidden information on one flat phone. Games where a
// player's choice must stay secret (Rock Paper Scissors picks, Sea Battle
// fleets) cannot use the face-to-face layout between two people: the other
// player sees the finger and the screen. Instead each secret move goes:
//
//   cover  — the screen turns to the picker and hides everything; the other
//            player is told (in their own orientation) to look away.
//   secret — the picker makes the move on a full screen facing them.
//   locked — "Locked in ✓", nothing about the move is shown, then the next
//            player's cover, or `revealed` once everyone has moved.
//
// Against a bot none of this is needed (bots never peek), so games only use it
// when both seats are people. Pure state, no DOM: tests drive it directly.
import { other, type PlayerIndex } from '../core/types';
import { COLORS, facing, rrect, shade, text, type G } from './draw';
import { H, W } from './world';
import { inkOn } from '../core/contrast';

export type SecretStep = { kind: 'cover' | 'secret' | 'locked'; p: PlayerIndex; t: number };

export const SECRET = {
  /** A cover ignores taps this long, so the last player's lifting finger can't skip it. */
  coverGuard: 0.5,
  /** How long "Locked in ✓" shows before the next cover. */
  locked: 0.8,
};

export class SecretTurns {
  step: SecretStep | null = null;
  /** Seats that have made their secret move this round. */
  moved: [boolean, boolean] = [false, false];
  /** True for the frame after the last seat locked in: time to reveal. */
  revealed = false;

  /** Start a round of secret moves; `first` picks first. */
  start(first: PlayerIndex): void {
    this.moved = [false, false];
    this.revealed = false;
    this.step = { kind: 'cover', p: first, t: 0 };
  }

  /** Who the screen faces, or null when no secret move is under way. */
  get facing(): PlayerIndex | null {
    return this.step?.p ?? null;
  }

  get picking(): PlayerIndex | null {
    return this.step?.kind === 'secret' ? this.step.p : null;
  }

  /** Advance timers. `tapped` is any touch or the action key this frame. Returns true when the cover was lifted. */
  update(dt: number, tapped: boolean): boolean {
    const s = this.step;
    if (!s) return false;
    s.t += dt;
    if (s.kind === 'cover' && tapped && s.t >= SECRET.coverGuard) {
      this.step = { kind: 'secret', p: s.p, t: 0 };
      return true;
    }
    if (s.kind === 'locked' && s.t >= SECRET.locked) {
      const n = other(s.p);
      if (this.moved[n]) {
        this.step = null;
        this.revealed = true;
      } else this.step = { kind: 'cover', p: n, t: 0 };
    }
    return false;
  }

  /** The picker made their secret move. */
  lock(p: PlayerIndex): void {
    if (this.step?.kind !== 'secret' || this.step.p !== p) return;
    this.moved[p] = true;
    this.step = { kind: 'locked', p, t: 0 };
  }
}

/** The world point (x, y) given in the frame of the player the screen faces. */
export const toWorld = (viewer: PlayerIndex, x: number, y: number) => (viewer === 1 ? { x: W - x, y: H - y } : { x, y });

/**
 * Draw a look-away cover in the picker's frame (call inside a frame already
 * turned to face them). The banner at the far edge faces the other player.
 */
export function drawCover(
  gx: G,
  t: number,
  picker: { name: string; color: string },
  watcher: { name: string; color: string },
  title: string,
  note?: string,
): void {
  const grd = gx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, shade(picker.color, -0.78));
  grd.addColorStop(1, shade(picker.color, -0.45));
  gx.fillStyle = grd;
  gx.fillRect(0, 0, W, H);
  lookAwayBanner(gx, watcher, 'look away!');
  text(gx, '🙈', W / 2, 250, { size: 60 });
  text(gx, title, W / 2, 318, { size: 22, color: '#fff', weight: 700 });
  text(gx, picker.name, W / 2, 360, { size: 38, color: picker.color, stroke: 'rgba(0,0,0,0.4)' });
  const s = 1 + 0.05 * Math.sin(t * 5);
  rrect(gx, W / 2 - 140 * s, 410, 280 * s, 70, 35, picker.color, '#fff', 3);
  // Words on the player's colour: dark ink on the light colours, white on the dark ones.
  const ink = inkOn(picker.color);
  text(gx, `Tap when only ${picker.name}`, W / 2, 432, { size: 19, color: ink });
  text(gx, 'is looking 👀', W / 2, 458, { size: 19, color: ink });
  if (note) text(gx, note, W / 2, 530, { size: 16, color: COLORS.gold, weight: 700 });
}

/** A strip at the far edge of the picker's frame, turned to face the other player. */
export function lookAwayBanner(gx: G, watcher: { name: string; color: string }, msg: string): void {
  facing(gx, 1, W / 2, 70, () => {
    rrect(gx, 24, 34, W - 48, 72, 22, 'rgba(0,0,0,0.35)', watcher.color, 3);
    text(gx, `🙈 ${watcher.name}, ${msg}`, W / 2, 62, { size: 20, color: '#fff', weight: 800 });
    text(gx, 'No peeking until the reveal', W / 2, 88, { size: 13, color: COLORS.dim, weight: 700 });
  });
}
