import { ownerOf } from './world';

export type Pointer = {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  /** Owner is fixed when the finger lands, so dragging past the middle keeps it. */
  owner: 0 | 1;
  down: boolean;
  /** True only on the frame the finger landed / lifted. */
  pressed: boolean;
  released: boolean;
  /** Frame this finger last really moved (a landing counts as LANDING_AGE frames older). */
  movedAt: number;
  /** Where it was when its movement was last counted. */
  mx: number;
  my: number;
  /** When the finger landed (the touch event's own time, ms; 0 = unknown). */
  at: number;
};

/** True once the finger has travelled MOVE_STEP from where it landed. */
export function hasMoved(p: Pointer): boolean {
  return p.mx !== p.startX || p.my !== p.startY;
}

/** A finger must travel this far (world units) to count as moving; palms jitter less. */
export const MOVE_STEP = 3;
/** A finger that just landed counts as having moved this many frames ago, so a finger that
 * is steering now keeps the paddle when a palm lands, but a palm that has rested for longer
 * loses it to a fresh finger. */
export const LANDING_AGE = 12;

/**
 * One frame of input in world coordinates. Games read it in update(); the
 * stage fills it from pointer and keyboard events. Keys exist so the game can
 * be played and tested on a desktop.
 */
/** The most a frame can fall behind (the stage's catch-up cap, seconds). */
export const MAX_LAG = 0.1;

export class Input {
  /** Real time (ms, the event clock) at the end of the step being run; set by the stage, 0 = unknown. */
  clock = 0;
  readonly pointers = new Map<number, Pointer>();
  readonly keys = new Set<string>();
  readonly keysPressed = new Set<string>();
  /** Fixed updates so far; endFrame() counts them. */
  frame = 0;

  all(): Pointer[] {
    return [...this.pointers.values()];
  }

  of(player: 0 | 1): Pointer[] {
    return this.all().filter((p) => p.owner === player);
  }

  /** The player's newest finger that is still down. */
  held(player: 0 | 1): Pointer | undefined {
    const list = this.of(player).filter((p) => p.down);
    return list[list.length - 1];
  }

  /**
   * The finger that steers a dragged paddle (Air Hockey, Ping Pong): of the player's fingers
   * still down (minus any `skip` rejects, e.g. one that landed on the power button), the one
   * that moved last. A palm resting on the screen then never takes the paddle from a finger
   * that is playing, whichever landed first.
   */
  steering(player: 0 | 1, skip?: (p: Pointer) => boolean): Pointer | undefined {
    let best: Pointer | undefined;
    for (const p of this.of(player)) {
      if (!p.down || (skip && skip(p))) continue;
      if (!best || p.movedAt >= best.movedAt) best = p;
    }
    return best;
  }

  /**
   * The finger that holds a stick (Tank Duel): like steering(), but the finger already holding
   * it keeps it while it is down, so a thumb holding the stick still is not robbed by a palm
   * that lands. Another finger takes over when it is steering more recently and either it has
   * really moved or the holder never did (a palm that landed first never moves; the thumb
   * that lands after it takes the stick at once).
   */
  holding(player: 0 | 1, currentId: number | null, skip?: (p: Pointer) => boolean): Pointer | undefined {
    const best = this.steering(player, skip);
    const cur = currentId === null ? undefined : this.pointers.get(currentId);
    if (!cur || !cur.down || cur.owner !== player || (skip && skip(cur))) return best;
    if (!best || best.id === cur.id || best.movedAt <= cur.movedAt) return cur;
    return hasMoved(best) || !hasMoved(cur) ? best : cur;
  }

  /** Any pointer of the player that landed this frame. */
  tapped(player: 0 | 1): Pointer | undefined {
    return this.of(player).find((p) => p.pressed);
  }

  key(code: string): boolean {
    return this.keys.has(code);
  }

  keyPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  // --- used by the stage ---
  down(id: number, x: number, y: number, at = 0): void {
    this.pointers.set(id, {
      id, x, y, startX: x, startY: y, owner: ownerOf(y), down: true, pressed: true, released: false,
      movedAt: this.frame - LANDING_AGE, mx: x, my: y, at,
    });
  }

  /**
   * F187: how long before the end of the current step a finger landed, in seconds, at most
   * `max` (one step). Steps are 1/60 s, so two taps in one step read the same time; a race
   * (Quick Draw) uses this to tell them apart by their touch events. Negative when the touch
   * came after this step's end (a slow frame runs several steps, and its touches all reach
   * the first one), down to -MAX_LAG. 0 when either time is unknown (tests, keys).
   */
  lead(p: Pointer, max: number): number {
    if (!p.at || !this.clock) return 0;
    return Math.max(-MAX_LAG, Math.min(max, (this.clock - p.at) / 1000));
  }

  move(id: number, x: number, y: number): void {
    const p = this.pointers.get(id);
    if (p && p.down) {
      p.x = x;
      p.y = y;
      if (Math.hypot(x - p.mx, y - p.my) >= MOVE_STEP) {
        p.movedAt = this.frame;
        p.mx = x;
        p.my = y;
      }
    }
  }

  up(id: number): void {
    const p = this.pointers.get(id);
    if (p) {
      p.down = false;
      p.released = true;
    }
  }

  /** Call after each fixed update: clears one-frame flags and lifted fingers. */
  endFrame(): void {
    this.frame++;
    for (const [id, p] of this.pointers) {
      if (!p.down) this.pointers.delete(id);
      else p.pressed = false;
    }
    this.keysPressed.clear();
  }

  reset(): void {
    this.pointers.clear();
    this.keys.clear();
    this.keysPressed.clear();
  }
}
