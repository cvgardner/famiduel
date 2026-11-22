import { afterEach, describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerInfo, PowerDef } from '../src/core/types';
import { BIG_TEXT, scaledSize, setTextScale } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { H, MID, W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import { LINE_PX } from '../src/games/tugofwar/index';
import type { TugOfWar } from '../src/games/tugofwar/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };
type View = { game: TugOfWar; update(dt: number, i: Input): void; lineReach(str: string, shown: number): [number, number] };

afterEach(() => setTextScale(1));

// F405: with Bigger text, "The lines are closing in!" landed on the top seat's own chalk line
// and its "your line" label. Readable pops (life >= 0.45) whose words cross their seat's chalk
// line band (the flags above it and the label below, where the words are wide enough to
// reach them) are counted.
describe('Tug of War: pops keep off their own chalk line', () => {
  for (const scale of [1, BIG_TEXT]) {
    it(`in bot matches with every power pair${scale === 1 ? '' : ' (Bigger text)'}`, () => {
      setTextScale(scale);
      const list = (powers.games as Record<string, PowerDef[]>).tugofwar;
      let total = 0;
      let onLine = 0;
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
              if (view.game.phase === 'result') continue;
              for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
                if (Math.abs(f.x - W / 2) > 1 || f.life < 0.45) continue;
                total++;
                const ly = f.player === 0 ? f.y : H - f.y;
                const line = MID + view.game.lineNow(f.player) * LINE_PX;
                const half = scaledSize(f.size) * 0.45;
                const [above, below] = view.lineReach(f.str, scaledSize(f.size));
                if (ly - half < line + below && line - above < ly + half) {
                  onLine++;
                  if (examples.length < 5) examples.push(`${f.str} seat ${f.player} y ${ly.toFixed(0)} line ${line.toFixed(0)}`);
                }
              }
            }
            expect(view.game.winner).not.toBeNull();
          }
        }
      }
      console.log(`tugofwar pops on their chalk line: ${onLine}/${total}`, examples);
      expect(total).toBeGreaterThan(500);
      expect(onLine / total).toBeLessThan(0.01);
    }, 120_000);
  }
});
