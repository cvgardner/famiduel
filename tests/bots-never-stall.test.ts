import { describe, expect, it } from 'vitest';
import games from '../content/games.json';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { DT, player } from './helpers';

// F410: a rival 2-player app's reviews say "a tournament game got stuck on bot's turn".
// The rules tests play bots through each game's logic; this plays them through the real
// view (game.update), where turn cards, waits between shots and the bot's think delays
// live, and fails if a match is not over within LIMIT. (A state-freeze check doesn't work:
// every game's state carries a running clock. A planted bot that never shoots its turn in
// Mini Pool fails this test.)
/** Longest a whole match may take (a close minigolf round between easy bots is the slowest). */
const LIMIT = 15 * 60;
const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];
const SEEDS = [1, 2];

const shown = games.games.filter((g) => !(g as { hidden?: boolean }).hidden).map((g) => g.id);

function play(id: string, level: BotLevel, seed: number, pw: PowerDef | null): { ended: boolean; t: number } {
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: pw }), player({ bot: level, power: pw })];
  let ended = false;
  const view = GAMES[id].create({
    seed,
    rng: makeRng(seed),
    players,
    powersOn: !!pw,
    sfx: { play() {} } as unknown as Sfx,
    fx: new Fx(),
    end() {
      ended = true;
    },
  }) as unknown as { update(dt: number, input: Input): void };
  const input = new Input();
  let i = 0;
  for (; !ended && i * DT < LIMIT; i++) {
    view.update(DT, input);
    input.endFrame();
  }
  return { ended, t: i * DT };
}

describe('bots never stall a match: every shown game ends bot v bot through its view', () => {
  for (const id of shown) {
    it(id, () => {
      const list = (powers.games as Record<string, PowerDef[]>)[id] ?? [];
      const picks: (PowerDef | null)[] = [null, ...list];
      for (const level of LEVELS)
        for (const seed of SEEDS)
          for (const pw of picks) {
            const r = play(id, level, seed, pw);
            const what = `${id} ${level} seed ${seed} power ${pw?.id ?? 'none'}`;
            expect(r.ended, `${what}: not over after ${r.t.toFixed(0)} s`).toBe(true);
          }
    }, 300_000);
  }
});
