// The contract every minigame implements. A game is a pure rules module
// (logic.ts, testable in Node) plus a view (index.ts) that turns fingers and
// bots into intents and draws the state.
import type { Rng } from '../core/rng';
import type { GameResult, PlayerInfo } from '../core/types';
import type { G } from './draw';
import type { Fx } from './fx';
import type { Input } from './input';
import type { Sfx } from './sfx';

export type GameContext = {
  seed: number;
  rng: Rng;
  players: [PlayerInfo, PlayerInfo];
  /** False in classic mode: no energy bars, no power buttons. */
  powersOn: boolean;
  sfx: Sfx;
  fx: Fx;
  /** Call exactly once when the match is decided. The shell shows results. */
  end(result: GameResult): void;
};

export interface GameInstance {
  /** Fixed step, dt = 1/60 s. */
  update(dt: number, input: Input): void;
  render(g: G): void;
}

export type GameDef = {
  id: string;
  create(ctx: GameContext): GameInstance;
};

/** Keyboard layout for desktop play and testing. Directions are screen directions. */
export const KEYS = [
  { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', action: 'Space', power: 'Enter' },
  { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', action: 'KeyF', power: 'KeyE' },
] as const;
