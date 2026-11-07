import { describe, expect, it } from 'vitest';
import { BOT_FACES, BOT_LEVELS, botFace } from '../src/app/store';

describe('bot faces', () => {
  it('every bot level has its own face, none like a person (🙂) or the bot mark (🤖)', () => {
    const faces = BOT_LEVELS.map(botFace);
    expect(new Set(faces).size).toBe(BOT_LEVELS.length);
    for (const f of faces) {
      expect(f).toMatch(/^\p{Extended_Pictographic}$/u);
      expect(['🙂', '🤖']).not.toContain(f);
    }
    expect(Object.keys(BOT_FACES).sort()).toEqual([...BOT_LEVELS].sort());
    expect(botFace('easy')).toBe('😴');
    expect(botFace('hard')).toBe('😎');
  });
});
