import { describe, expect, it } from 'vitest';
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { H, W } from '../src/engine/world';
import { GAMES } from '../src/games/registry';
import type { ChopChop } from '../src/games/chopchop/logic';
import { DT, player } from './helpers';

type Floater = { str: string; x: number; y: number; life: number; size: number; player: 0 | 1 };
type Box = { x0: number; x1: number; y0: number; y1: number };
const over = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const BASE_Y = H - 124; // the chopper's segment, in each seat's own frame (index.ts L.baseY)

// F207: "+2" rose over the next branch up (12% of its readable frames), "Shield!" printed on
// the chopper (1,965/2,522) and "🧊 Frozen!" sat on the frozen tree's own "🧊 frozen" label for
// its whole bright half. "+2" now starts past the branch tips, "Shield!" low on the trunk's other
// side, and the frozen label alone says "frozen".
describe('Chop Chop: pops stay off the chopper, the next branches and the frozen label', () => {
  it('in bot matches at every level with powers, both seats', () => {
    const total: Record<string, number> = {};
    const onBranch: Record<string, number> = {};
    const onChopper: Record<string, number> = {};
    let onLabel = 0;
    let freezes = 0;
    const list = (powers.games as Record<string, PowerDef[]>).chopchop;
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        const players: [PlayerInfo, PlayerInfo] = [player({ bot: level, power: list[seed % list.length] }), player({ bot: level, power: list[(seed + 1) % list.length] })];
        const fx = new Fx();
        const view = GAMES.chopchop.create({ seed, rng: makeRng(seed), players, powersOn: true, sfx: { play() {} } as unknown as Sfx, fx, end() {} }) as unknown as { game: ChopChop; update(dt: number, i: Input): void };
        const input = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;
        const g = view.game;
        for (let i = 0; i < 60 * 300 && !g.done; i++) {
          view.update(DT, input);
          fx.update(DT);
          if (g.choppers.some((c) => c.frozen > 0)) freezes++;
          for (const f of (fx as unknown as { floaters: Floater[] }).floaters) {
            if (f.life < 0.45) continue;
            total[f.str] = (total[f.str] ?? 0) + 1;
            const w = ([...f.str].length * f.size * 0.55) / 2;
            const h = f.size * 0.45;
            for (const p of [0, 1] as const) {
              const x = p === 0 ? f.x : W - f.x;
              const y = p === 0 ? f.y : H - f.y;
              const box = { x0: x - w, x1: x + w, y0: y - h, y1: y + h };
              const c = g.choppers[p];
              if (c.frozen > 0 && over(box, { x0: W / 2 - 45, x1: W / 2 + 45, y0: BASE_Y - 89, y1: BASE_Y - 71 })) onLabel++;
              let branch = false;
              for (let k = 1; k <= 3; k++) {
                const b = g.branch(p, c.idx + k);
                if (!b) continue;
                const bx = W / 2 + b * 26;
                const by = BASE_Y - k * 40;
                if (over(box, { x0: b < 0 ? bx - 74 : bx, x1: b < 0 ? bx : bx + 74, y0: by - 23, y1: by + 7 })) branch = true;
              }
              if (branch) onBranch[f.str] = (onBranch[f.str] ?? 0) + 1;
              const cx = W / 2 + c.side * 62;
              if (over(box, { x0: cx - 16, x1: cx + 16, y0: BASE_Y - 42, y1: BASE_Y + 40 })) onChopper[f.str] = (onChopper[f.str] ?? 0) + 1;
            }
          }
        }
      }
    }
    for (const k of Object.keys(total)) console.log(`chopchop ${k}: branch ${onBranch[k] ?? 0}, chopper ${onChopper[k] ?? 0} / ${total[k]}`);
    expect(freezes).toBeGreaterThan(300);
    expect(total['🧊 Frozen!']).toBeUndefined();
    expect(onLabel).toBeLessThan(30); // a milestone pop now and then
    expect(total['+2']).toBeGreaterThan(1000);
    expect(onBranch['+2'] ?? 0).toBe(0);
    expect(total['Shield!']).toBeGreaterThan(1000);
    expect(((onChopper['Shield!'] ?? 0) + (onBranch['Shield!'] ?? 0)) / total['Shield!']).toBeLessThan(0.05);
  }, 120_000); // whole bot matches: GitHub CI runs ~3x slower than a laptop
});
