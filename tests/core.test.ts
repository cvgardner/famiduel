import { describe, expect, it } from 'vitest';
import { Energy, ENERGY } from '../src/core/energy';
import { effectiveAssist, lerpAssist } from '../src/core/handicap';
import { hashSeed, makeRng } from '../src/core/rng';
import games from '../content/games.json';
import powers from '../content/powers.json';
import { Store, botFor, easierOffer } from '../src/app/store';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
    expect(hashSeed('daily-2026-10-30')).toBe(hashSeed('daily-2026-10-30'));
  });
});

describe('energy', () => {
  it('fills faster with assist and when trailing, caps at 1, spends only when full', () => {
    const plain = new Energy(0);
    const helped = new Energy(2);
    plain.charge(0.1);
    helped.charge(0.1, true);
    expect(plain.value).toBeCloseTo(0.1);
    expect(helped.value).toBeCloseTo(0.1 * (1 + 2 * ENERGY.assistBonus + ENERGY.trailingBonus));
    expect(plain.spend()).toBe(false);
    plain.charge(5);
    expect(plain.value).toBe(1);
    expect(plain.spend(2)).toBe(true);
    expect(plain.value).toBe(0);
    plain.tick(1.5);
    expect(plain.active).toBeCloseTo(0.5);
  });
});

describe('handicap', () => {
  it('adds catch-up for the trailing player only, capped at 3', () => {
    expect(effectiveAssist([0, 1], [4, 1], true, 1)).toBe(3);
    expect(effectiveAssist([0, 1], [4, 1], true, 0)).toBe(0);
    expect(effectiveAssist([0, 1], [4, 1], false, 1)).toBe(1);
    expect(lerpAssist(0, 10, 40)).toBe(10);
    expect(lerpAssist(3, 10, 40)).toBe(40);
    expect(lerpAssist(9, 10, 40)).toBe(40);
  });
});

describe('content', () => {
  it('every game has a unique id, and powers only reference known games, 3 each', () => {
    const ids = games.games.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [game, list] of Object.entries(powers.games)) {
      expect(ids).toContain(game);
      expect(list).toHaveLength(3);
      expect(new Set(list.map((p) => p.id)).size).toBe(3);
    }
  });

  it('home grid: minigolf (the hero) first, the free trio on the top row, action games before slow turn games', () => {
    // Chris's playtest (1 Nov 2026): the action games are the most fun, so they are the
    // stars of the home screen. Strategy board games and the free extras come last.
    const list = games.games;
    expect(list[0].id).toBe('minigolf');
    expect(list.slice(0, 3).every((g) => g.free)).toBe(true);
    const slow = (k: string) => k.startsWith('Strategy') || k === 'Extra';
    const firstSlow = list.findIndex((g) => slow(g.kind));
    expect(firstSlow).toBeGreaterThan(0);
    expect(list.slice(firstSlow).every((g) => slow(g.kind))).toBe(true);
    // Extras sit at the very end.
    expect(list.slice(-2).every((g) => g.kind === 'Extra')).toBe(true);
  });
});

describe('store', () => {
  it('records results into the night and history', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as Storage;
    const s = new Store(storage);
    s.record('airhockey', { winner: 1, score: [3, 5] }, ['freeze', null]);
    expect(s.data.night.wins).toEqual([0, 1]);
    const again = new Store(storage);
    expect(again.data.history).toHaveLength(1);
    again.newNight();
    expect(again.data.night.games).toHaveLength(0);
  });
});

describe('bot level per game', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as Storage;
  };
  it('a level picked on one game\'s intro is kept for that game only', () => {
    const storage = mem();
    const s = new Store(storage);
    s.setBot(1, 'normal');
    s.setBotLevel(1, 'checkers', 'easy');
    const again = new Store(storage);
    const pr = again.data.profiles[1];
    expect(botFor(pr, 'checkers')).toBe('easy');
    expect(botFor(pr, 'airhockey')).toBe('normal');
  });
  it('a person is never a bot, whatever levels are saved', () => {
    const s = new Store(mem());
    s.setBot(1, 'hard');
    s.setBotLevel(1, 'sumo', 'easy');
    s.setBot(1, null);
    expect(botFor(s.data.profiles[1], 'sumo')).toBeNull();
    expect(botFor(s.data.profiles[0], 'sumo')).toBeNull();
  });
  it('changing who plays on the player sheet applies to every game again', () => {
    const s = new Store(mem());
    s.setBot(1, 'normal');
    s.setBotLevel(1, 'checkers', 'easy');
    s.setBot(1, 'normal'); // Done without a change keeps the per-game level
    expect(botFor(s.data.profiles[1], 'checkers')).toBe('easy');
    s.setBot(1, 'hard');
    expect(botFor(s.data.profiles[1], 'checkers')).toBe('hard');
  });
  it('ignores a broken saved level', () => {
    const pr = { name: 'x', color: '#fff', headStart: 0, bot: 'normal' as const, botLevels: { snake: 'silly' as never } };
    expect(botFor(pr, 'snake')).toBe('normal');
  });
});

describe('button', () => {
  it('counts a tap that lands and lifts within one frame', async () => {
    const { Input } = await import('../src/engine/input');
    const { Button } = await import('../src/engine/widgets');
    const input = new Input();
    const b = new Button(100, 500, 30, 0);
    input.down(1, 100, 500);
    input.up(1);
    b.update(input);
    expect(b.pressed).toBe(true);
    input.endFrame();
    b.update(input);
    expect(b.released).toBe(true);
    expect(b.held).toBe(false);
  });
});

describe('make the bot easier offer', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as Storage;
  };
  const lose = (s: Store, game = 'checkers', winner: 0 | 1 | null = 1) => s.record(game, { winner, score: [0, 1] }, [null, null]);
  it('comes after two losses in a row to the same bot, one level down', () => {
    const s = new Store(mem());
    s.setBot(1, 'hard');
    lose(s);
    expect(easierOffer(s.data.history, 'checkers', s.data.profiles)).toBeNull();
    lose(s);
    expect(easierOffer(s.data.history, 'checkers', s.data.profiles)).toEqual({ bot: 1, person: 0, from: 'hard', to: 'normal' });
  });
  it('works with the bot in either seat', () => {
    const s = new Store(mem());
    s.setBot(0, 'normal');
    lose(s, 'sumo', 0);
    lose(s, 'sumo', 0);
    expect(easierOffer(s.data.history, 'sumo', s.data.profiles)).toEqual({ bot: 0, person: 1, from: 'normal', to: 'easy' });
  });
  it('a win, a draw or another game in between breaks the run only for that game', () => {
    const s = new Store(mem());
    s.setBot(1, 'normal');
    lose(s);
    lose(s, 'checkers', 0);
    lose(s);
    expect(easierOffer(s.data.history, 'checkers', s.data.profiles)).toBeNull();
    lose(s, 'checkers', null);
    lose(s);
    expect(easierOffer(s.data.history, 'checkers', s.data.profiles)).toBeNull();
    lose(s, 'airhockey');
    lose(s);
    expect(easierOffer(s.data.history, 'checkers', s.data.profiles)).not.toBeNull();
  });
  it('never below Easy, and lowering the level starts the count again', () => {
    const s = new Store(mem());
    s.setBot(1, 'normal');
    lose(s);
    lose(s);
    s.setBotLevel(1, 'checkers', 'easy');
    expect(easierOffer(s.data.history, 'checkers', s.data.profiles)).toBeNull();
    lose(s);
    lose(s);
    expect(easierOffer(s.data.history, 'checkers', s.data.profiles)).toBeNull();
  });
  it('never for two people, two bots, or old records without bot levels', () => {
    const s = new Store(mem());
    lose(s);
    lose(s);
    expect(easierOffer(s.data.history, 'checkers', s.data.profiles)).toBeNull();
    s.setBot(0, 'hard');
    s.setBot(1, 'hard');
    lose(s);
    lose(s);
    expect(easierOffer(s.data.history, 'checkers', s.data.profiles)).toBeNull();
    s.setBot(0, null);
    const old = s.data.history.slice(-2).map((r) => ({ ...r, bots: undefined }));
    expect(easierOffer(old, 'checkers', s.data.profiles)).toBeNull();
  });
});
