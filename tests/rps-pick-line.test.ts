import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo } from '../src/core/types';
import type { G } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Input } from '../src/engine/input';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { pickLine } from '../src/games/rps/index';
import { recorder } from './canvasRecorder';
import { DT, player } from './helpers';

const idle = { of: () => [], all: () => [], key: () => false, keyPressed: () => false, tapped: () => undefined, holding: () => false, lead: () => 0 } as unknown as Input;

// F254: in Play the bot the person's pill said "Pick in secret!", though nobody else is
// looking (the bot never peeks). "In secret" is for two people, who pass the phone.
describe('Rock Paper Scissors: the pick prompt', () => {
  it('says "in secret" only between two people', () => {
    expect(pickLine(false, false)).toBe('Pick in secret!');
    expect(pickLine(false, true)).toBe('Pick one!');
    expect(pickLine(true, false)).toBe('Choosing…');
    expect(pickLine(true, true)).toBe('Choosing…');
  });

  it('a person playing the bot reads "Pick one!"', () => {
    const players: [PlayerInfo, PlayerInfo] = [player({ bot: null }), player({ bot: 'normal' })];
    const view = GAMES.rps.create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx: { play() {} } as unknown as Sfx, fx: new Fx(), end() {} }) as unknown as { update(dt: number, i: Input): void; render(g: G): void };
    const { g, words } = recorder();
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 5; i++) {
      view.update(DT, idle);
      words.length = 0;
      view.render(g);
      for (const w of words) seen.add(w.str);
    }
    expect(seen.has('Pick one!')).toBe(true);
    expect([...seen].some((s) => /secret/i.test(s))).toBe(false);
  });
});
