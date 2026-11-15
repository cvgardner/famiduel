import { describe, expect, it } from 'vitest';
import { pairing, powersOf, SPECS } from '../scripts/simlib';

// F295: at HARD, Slow Time's warned head start (0.06 s) was twice the bot's reaction spread
// (0.03 s), so it won 65-67% against every pick (n=240). A steadier reactor gains less from a
// warning (BOT_LEVELS.hard.edge); now ~61% at hard, as at normal.
describe('Quick Draw: Slow Time at hard stays in the 35-65% band', () => {
  it('Slow Time vs no power, hard bots, 120 matches', () => {
    const spec = SPECS.find((s) => s.id === 'quickdraw')!;
    const slow = powersOf('quickdraw').find((p) => p.id === 'slowtime')!;
    const r = pairing(spec, ['hard', 'hard'], 120, true, [slow, null]);
    expect(r.wins).toBeLessThan(0.65);
    expect(r.wins).toBeGreaterThan(0.5);
  }, 60_000);
});
