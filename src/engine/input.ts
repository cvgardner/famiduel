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
};

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
export class Input {
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
  down(id: number, x: number, y: number): void {
    this.pointers.set(id, {
      id, x, y, startX: x, startY: y, owner: ownerOf(y), down: true, pressed: true, released: false,
      movedAt: this.frame - LANDING_AGE, mx: x, my: y,
    });
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
