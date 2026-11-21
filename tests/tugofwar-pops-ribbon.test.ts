import { afterEach, describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerInfo, PowerDef } from '../src/core/types';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import type { TugOfWar } from '../src/games/tugofwar/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };
type View = { game: TugOfWar; update(dt: number, i: Input): void; ribbon(): number };

afterEach(() => setTextScale(1));

// F386: every Tug of War pop was centred on the rope at the card line, and "The lines are
// closing in!" printed across the red ribbon both players watch. Readable pops (life >= 0.45)
// whose words cross the ribbon's bow (9 units each way, plus 3) are counted.
describe('Tug of War: pops keep off the red ribbon', () => {
  for (const scale of [1, BIG_TEXT]) {
    it(`in bot matches with every power pair${scale === 1 ? '' : ' (Bigger text)'}`, () => {
      setTextScale(scale);
      const list = (powers.games as Record<string, PowerDef[]>).tugofwar;
      let total = 0;
      let onRibbon = 0;
      const examples: string[] = [];
      for (const seed of [1, 2]) {
        for (const level of ['easy', 'normal'] as BotLevel[]) {
          for (let i = 0; i < list.length; i++) {
            const a = list[i];
            const b = list[(i + seed) % list.length];
            const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: a }), player({ bot: 'normal', power: b })];
            const fx = new Fx();
            const view = GAMES.tugofwar.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as View;
            const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
            for (let k = 0; k < 60 * 240 && view.game.winner === null; k++) {
              view.update(DT, input);
              fx.update(DT);
              const ry = view.ribbon();
              for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
                if (Math.abs(f.x - W / 2) > 1 || f.life < 0.45) continue;
                total++;
                if (Math.abs(f.y - ry) < scaledSize(f.size) * 0.45 + 12) {
                  onRibbon++;
                  if (examples.length < 5) examples.push(`${f.str} y ${f.y.toFixed(0)} ribbon ${ry.toFixed(0)}`);
                }
              }
            }
            expect(view.game.winner).not.toBeNull();
          }
        }
      }
      console.log(`tugofwar pops on the ribbon: ${onRibbon}/${total}`, examples);
      expect(total).toBeGreaterThan(500);
      expect(onRibbon / total).toBeLessThan(0.01);
    }, 120_000);
  }
});
