// Runs one match: countdown, fixed-step updates, then hands the result back.
import { makeRng } from '../core/rng';
import type { GameResult, PlayerIndex, PlayerInfo } from '../core/types';
import { rrect, text, type G } from '../engine/draw';
import { Fx } from '../engine/fx';
import type { GameDef, GameInstance } from '../engine/game';
import type { Sfx } from '../engine/sfx';
import type { Stage } from '../engine/stage';
import { STEP } from '../engine/stage';
import { H, MID, W } from '../engine/world';
import { starterLines } from './starter';

const COUNT_STEP = 0.6;
const OUTRO = 1.6;

export class Runner {
  readonly fx = new Fx();
  readonly game: GameInstance;
  result: GameResult | null = null;
  private countdown = 3 * COUNT_STEP;
  private outro = 0;
  private done = false;
  paused = false;
  time = 0;

  constructor(
    private readonly stage: Stage,
    readonly def: GameDef,
    readonly seed: number,
    readonly players: [PlayerInfo, PlayerInfo],
    powersOn: boolean,
    private readonly sfx: Sfx,
    private readonly onDone: (r: GameResult) => void,
    skipCountdown = false,
    starter?: PlayerIndex,
  ) {
    if (skipCountdown) this.countdown = 0;
    this.game = def.create({
      seed,
      rng: makeRng(seed),
      players,
      powersOn,
      sfx,
      fx: this.fx,
      starter,
      end: (r) => {
        if (!this.result) this.result = r;
      },
    });
    stage.onStep = (dt) => this.step(dt);
    stage.onRender = (g) => this.render(g);
  }

  step(dt: number): void {
    if (this.paused || this.done) return;
    this.time += dt;
    this.fx.update(dt);
    if (this.countdown > 0) {
      const before = Math.ceil(this.countdown / COUNT_STEP);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown / COUNT_STEP);
      if (this.countdown <= 0) this.sfx.play('go');
      else if (after !== before) this.sfx.play('count');
      return;
    }
    this.game.update(dt, this.stage.input);
    if (this.result) {
      this.outro += dt;
      if (this.outro >= OUTRO) {
        this.done = true;
        this.onDone(this.result);
      }
    }
  }

  render(g: G): void {
    g.save();
    this.fx.applyShake(g);
    this.game.render(g);
    g.restore();
    this.fx.render(g);
    if (this.countdown > 0) {
      g.fillStyle = 'rgba(10,8,25,0.45)';
      g.fillRect(0, 0, W, H);
      const n = Math.ceil(this.countdown / COUNT_STEP);
      const k = (this.countdown % COUNT_STEP) / COUNT_STEP;
      const size = 70 + 40 * k;
      text(g, String(n), W / 2, MID + 120, { size, color: '#fff', stroke: 'rgba(0,0,0,0.5)', player: 0 });
      text(g, String(n), W / 2, MID - 120, { size, color: '#fff', stroke: 'rgba(0,0,0,0.5)', player: 1 });
      // Turn games: say who goes first, on both sides, so a rematch's swap reads as on purpose.
      const lines = this.starterLines();
      for (const p of [0, 1] as const) {
        const line = lines[p];
        if (!line) continue;
        const mine = line === 'You go first!';
        const y = p === 0 ? MID + 200 : MID - 200;
        // A solid pill, so the game's own turn line underneath doesn't show through.
        const starter = this.game.firstMover?.();
        const ring = starter === 0 || starter === 1 ? this.players[starter].color : '#fff';
        rrect(g, W / 2 - 130, y - 22, 260, 44, 22, '#1b1638', ring, 3);
        text(g, line, W / 2, y, { size: mine ? 26 : 20, color: mine ? '#fff' : '#d6d2f0', stroke: 'rgba(0,0,0,0.6)', player: p });
      }
    }
  }

  /** What each seat reads under the countdown (null: nothing, e.g. a game with no first mover). */
  starterLines(): [string | null, string | null] {
    return starterLines(this.game.firstMover?.(), [this.players[0].name, this.players[1].name]);
  }

  /** Test hook: run the match headlessly for up to `seconds` of game time. */
  fastForward(seconds: number): void {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps && !this.done; i++) this.stage.step();
  }
}
