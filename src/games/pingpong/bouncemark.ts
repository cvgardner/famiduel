// Where the ball last landed on the table. Store reviews of other 2-player apps say Ping
// Pong makes it "hard to tell whether the ball has landed yet": a 0.5 s ring that fades
// as it grows is easy to miss on a small, bright phone. The spot stays on the table from
// the bounce until the ball is hit back (or the point ends), so a kid who looked away
// for a moment can still see where it came down. Pure, no drawing, unit tested.

export type Spot = { x: number; y: number; color: string; /** Seconds since the bounce. */ t: number; /** Seconds since it started fading (null while held). */ fade: number | null };

/** How long the spot takes to fade once the ball is hit back. */
export const MARK_FADE = 0.3;
/** The landing ring: how long it grows, and its size from and to. */
export const RING_TIME = 0.6;

export class BounceMark {
  spot: Spot | null = null;

  /** The ball hit the table: a new spot replaces any old one. */
  land(x: number, y: number, color: string): void {
    this.spot = { x, y, color, t: 0, fade: null };
  }

  /** The ball was hit back, or the point ended: the spot starts to fade. */
  release(): void {
    if (this.spot && this.spot.fade === null) this.spot.fade = 0;
  }

  /** Point over, ball gone: drop the spot at once. */
  clear(): void {
    this.spot = null;
  }

  tick(dt: number): void {
    const s = this.spot;
    if (!s) return;
    s.t += dt;
    if (s.fade !== null) {
      s.fade += dt;
      if (s.fade >= MARK_FADE) this.spot = null;
    }
  }

  /** 0..1 opacity of the spot (1 while held). */
  alpha(): number {
    const s = this.spot;
    if (!s) return 0;
    const pop = Math.min(1, s.t / 0.08);
    return s.fade === null ? pop : pop * Math.max(0, 1 - s.fade / MARK_FADE);
  }

  /** The growing landing ring, 0..1 through RING_TIME, or null once it has finished. */
  ring(): number | null {
    const s = this.spot;
    if (!s || s.t >= RING_TIME) return null;
    return s.t / RING_TIME;
  }
}
