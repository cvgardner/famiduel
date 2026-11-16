import { describe, expect, it } from 'vitest';
import { judge } from '../scripts/powers-sim';

// F332: the outlier list judged a power on an average that included "none", so in Chop
// Chop (any power beats none ~90%) Shield and Double read 66-67% and were flagged although
// every head-to-head pair was in band. Numbers below are main's n=60 normal read.
describe('sim:powers outliers', () => {
  it('a power in band against the other powers is not flagged for crushing none', () => {
    expect(judge('chopchop', 'shield', [0.57, 0.53], 0.87)).toEqual([]);
    expect(judge('chopchop', 'double', [0.47, 0.63], 0.9)).toEqual([]);
  });
  it('a power far from 50% against the other powers is flagged', () => {
    expect(judge('snake', 'boost', [0.27, 0.38], 0.5)).toEqual(['snake/boost: 33% vs the other powers']);
  });
  it('a power that loses to no power is flagged on its own line', () => {
    expect(judge('snake', 'boost', [0.27, 0.38], 0.28)).toEqual([
      'snake/boost: 33% vs the other powers',
      'snake/boost: loses to no power (28%)',
    ]);
    expect(judge('tanks', 'shield', [0.4, 0.45], 0.45)).toEqual([]);
  });
});
