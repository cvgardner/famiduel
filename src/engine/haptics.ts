// Short vibrations on the moments a player should *feel*: a hit, a goal, a
// wrong move, the win. Driven by the same sound names the games already play,
// so every game gets haptics with no per-game code. Works where the browser
// has navigator.vibrate (Android Chrome); iPhone Safari has none, so there it
// does nothing. A store wrapper can swap in a native haptics call later via
// the `vibrate` constructor argument.
import type { SoundName } from './sfx';

/** Vibration pattern (ms on, ms off, ms on...) per sound; unlisted sounds don't buzz. */
export const HAPTICS: Partial<Record<SoundName, number | number[]>> = {
  hit: 15,
  chop: 15,
  power: 25,
  thud: 30,
  splash: 40,
  buzz: [20, 40, 20], // double tick = "can't do that"
  score: 50,
  win: [60, 80, 60, 80, 120],
};

/** Sounds that always get through the rate limit (they mark the big moments). */
const BIG = new Set<SoundName>(['score', 'win']);

/** Smaller buzzes closer together than this are dropped, so rallies don't hum. */
export const MIN_GAP_MS = 70;

export type Vibrate = (pattern: number | number[]) => boolean;

export function browserVibrate(): Vibrate | null {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return null;
  return (p) => navigator.vibrate(p);
}

export class Haptics {
  enabled = true;
  private last = -Infinity;

  constructor(
    private readonly vibrate: Vibrate | null = browserVibrate(),
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** True when this device can vibrate at all (the setting is hidden otherwise). */
  get supported(): boolean {
    return this.vibrate !== null;
  }

  /** Buzz for a sound, if it has a pattern. Returns whether a vibration was sent. */
  feel(name: SoundName): boolean {
    const pattern = HAPTICS[name];
    if (!this.enabled || !this.vibrate || pattern === undefined) return false;
    const t = this.now();
    if (!BIG.has(name) && t - this.last < MIN_GAP_MS) return false;
    this.last = t;
    try {
      return this.vibrate(pattern) !== false;
    } catch {
      return false;
    }
  }
}
