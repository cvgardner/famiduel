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
};

/**
 * One frame of input in world coordinates. Games read it in update(); the
 * stage fills it from pointer and keyboard events. Keys exist so the game can
 * be played and tested on a desktop.
 */
export class Input {
  readonly pointers = new Map<number, Pointer>();
  readonly keys = new Set<string>();
  readonly keysPressed = new Set<string>();

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
    this.pointers.set(id, { id, x, y, startX: x, startY: y, owner: ownerOf(y), down: true, pressed: true, released: false });
  }

  move(id: number, x: number, y: number): void {
    const p = this.pointers.get(id);
    if (p && p.down) {
      p.x = x;
      p.y = y;
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
