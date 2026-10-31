// Runs one match: countdown, fixed-step updates, then hands the result back.
import { makeRng } from '../core/rng';
import type { GameResult, PlayerInfo } from '../core/types';
import { text, type G } from '../engine/draw';
import { Fx } from '../engine/fx';
import type { GameDef, GameInstance } from '../engine/game';
import type { Sfx } from '../engine/sfx';
import type { Stage } from '../engine/stage';
import { STEP } from '../engine/stage';
import { H, MID, W } from '../engine/world';

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
  ) {
    if (skipCountdown) this.countdown = 0;
    this.game = def.create({
      seed,
      rng: makeRng(seed),
      players,
      powersOn,
      sfx,
      fx: this.fx,
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
    }
  }

  /** Test hook: run the match headlessly for up to `seconds` of game time. */
  fastForward(seconds: number): void {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps && !this.done; i++) this.stage.step();
  }
}
