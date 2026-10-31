// Press-and-hold gate for buttons a resting hand can hit by accident (the pause
// button sits on the centre line, right where both players' hands are).
// Pure and time-driven so it can be unit tested; the view feeds it times.

/** How long a finger must stay on the button. Long enough that a palm brushing
 *  past or a tap aimed at the game doesn't count, short enough to feel instant
 *  to a parent who means it. */
export const HOLD_MS = 600;

export type HoldEvent = 'none' | 'fired' | 'tooShort';

export class HoldGate {
  private start: number | null = null;
  private fired = false;

  constructor(readonly ms = HOLD_MS) {}

  get holding(): boolean {
    return this.start !== null;
  }

  press(now: number): void {
    this.start = now;
    this.fired = false;
  }

  /** 0..1 while held, for drawing the fill ring. */
  progress(now: number): number {
    if (this.start === null) return 0;
    return Math.min(1, Math.max(0, (now - this.start) / this.ms));
  }

  /** Call every frame while held; returns 'fired' exactly once when the hold completes. */
  update(now: number): HoldEvent {
    if (this.start === null || this.fired) return 'none';
    if (now - this.start >= this.ms) {
      this.fired = true;
      this.start = null;
      return 'fired';
    }
    return 'none';
  }

  /** Finger lifted. A release before the hold completes is 'tooShort' (show a hint). */
  release(now: number): HoldEvent {
    if (this.start === null) return 'none';
    const ev = this.update(now);
    this.start = null;
    return ev === 'fired' ? 'fired' : 'tooShort';
  }

  /** Finger slid off or the touch was cancelled: drop it silently. */
  cancel(): void {
    this.start = null;
  }
}
