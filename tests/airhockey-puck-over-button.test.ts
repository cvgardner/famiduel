import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import type { AirHockey } from '../src/games/airhockey/logic';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

type Btn = { button: { x: number; y: number; r: number } };
type View = { game: AirHockey; powerBtns: (Btn | null)[]; render(g: unknown): void };

// F279: the power buttons sit in the rink's corners and were drawn over the pucks, so a puck
// in a corner slid out of sight (bot matches: a puck on a button 2.6% of frames, ~1 s a match).
describe('Air Hockey: a puck in a corner shows over the power button', () => {
  for (const lefty of [false, true]) {
    it(`both seats${lefty ? ', left-handed' : ''}`, () => {
      const list = (powers.games as Record<string, PowerDef[]>).airhockey;
      const players: [PlayerInfo, PlayerInfo] = [player({ bot: null, power: list[0], lefty }), player({ bot: null, power: list[1], lefty })];
      const view = GAMES.airhockey.create({ seed: 1, rng: makeRng(1), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx: new Fx(), end() {} }) as unknown as View;
      for (const p of [0, 1]) {
        const b = view.powerBtns[p]!.button;
        const pk = view.game.pucks[0];
        // Just inside the button's edge, toward the rink.
        pk.x = b.x + (b.x < 180 ? 6 : -6);
        pk.y = b.y + (p === 0 ? -6 : 6);
        const rec = recorder();
        view.render(rec.g);
        const at = (x: number, y: number) => rec.fills.map((f, i) => (Math.abs(f.x - x) < 0.01 && Math.abs(f.y - y) < 0.01 ? i : -1)).filter((i) => i >= 0);
        const shine = at(pk.x - 4, pk.y - 4);
        const button = at(b.x, b.y);
        expect(button.length, 'button drawn').toBeGreaterThan(0);
        expect(shine.length, 'puck drawn').toBeGreaterThan(0);
        expect(Math.max(...shine), `seat ${p}: puck's last draw after the button`).toBeGreaterThan(Math.max(...button));
      }
    });
  }

  it('a puck in mid-rink is drawn once', () => {
    const list = (powers.games as Record<string, PowerDef[]>).airhockey;
    const players: [PlayerInfo, PlayerInfo] = [player({ bot: null, power: list[0] }), player({ bot: null, power: list[1] })];
    const view = GAMES.airhockey.create({ seed: 1, rng: makeRng(1), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx: new Fx(), end() {} }) as unknown as View;
    const pk = view.game.pucks[0];
    pk.x = 180;
    pk.y = 200;
    const rec = recorder();
    view.render(rec.g);
    expect(rec.fills.filter((f) => Math.abs(f.x - 176) < 0.01 && Math.abs(f.y - 196) < 0.01)).toHaveLength(1);
  });
});
