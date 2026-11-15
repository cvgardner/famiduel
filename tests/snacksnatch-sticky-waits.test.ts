import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel } from '../src/core/types';
import { RULES, SnackSnatch, SnackSnatchBot, type Snack } from '../src/games/snacksnatch/logic';
import { player, power } from './helpers';

// F294: honey poured while the other side's Magnet is on only slows the snacks so the
// magnet steers them straight across (Magnet beat Sticky 87% at normal). Normal and hard
// bots read the telegraphed Magnet and wait it out; easy bots (small kids' level) don't plan.
function setup(level: BotLevel, magnetOn: boolean) {
  const g = new SnackSnatch(
    [player({ power: power('snacksnatch', 'sticky') }), player({ power: power('snacksnatch', 'magnet') })],
    true,
    makeRng(3),
  );
  const near = (x: number): Snack => ({ id: x, x, y: RULES.gum[0] - 60, vx: 0, vy: -120, gold: false, r: RULES.snackR, alive: true, kind: 0 });
  g.snacks = [near(100), near(260)];
  g.energy[0].value = 1;
  if (magnetOn) {
    g.energy[1].value = 1;
    g.energy[1].spend(3);
  }
  return { g, bot: new SnackSnatchBot(0, level, makeRng(5)) };
}

describe('snack snatch: sticky bot vs a magnet', () => {
  it('normal and hard bots hold their honey while the other Magnet pulls, and pour it after', () => {
    for (const level of ['normal', 'hard'] as BotLevel[]) {
      const on = setup(level, true);
      expect(on.g.magnetOn(1)).toBe(true);
      expect(on.bot.think(on.g, 1 / 60).power).toBe(false);
      const off = setup(level, false);
      expect(off.bot.think(off.g, 1 / 60).power).toBe(true);
    }
  });

  it('easy bots pour honey whenever snacks are near', () => {
    const on = setup('easy', true);
    expect(on.bot.think(on.g, 1 / 60).power).toBe(true);
  });
});
