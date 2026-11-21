import { describe, expect, it } from 'vitest';
import { textSizeOf } from '../src/app/store';

// Settings > Look > Text size: older saves only have bigText; Largest needs both flags.
describe('text size step', () => {
  it('reads Usual, Bigger and Largest from the saved flags', () => {
    expect(textSizeOf({})).toBe('usual');
    expect(textSizeOf({ bigText: false, largestText: true })).toBe('usual');
    expect(textSizeOf({ bigText: true })).toBe('bigger');
    expect(textSizeOf({ bigText: true, largestText: false })).toBe('bigger');
    expect(textSizeOf({ bigText: true, largestText: true })).toBe('largest');
  });
});
