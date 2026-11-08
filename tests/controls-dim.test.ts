import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { PlayerInfo, PowerDef } from '../src/core/types';
import powers from '../content/powers.json';
import { BOT_CONTROLS_ALPHA, setReader, soloReader } from '../src/engine/draw';
import { W, H } from '../src/engine/world';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { CONTROLS_Y } from '../src/games/tanks/controls';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

type Pt = { x: number; y: number };
type View = Record<string, unknown> & { render(g: unknown): void };

/** Where each seat's own touch buttons sit, read off the view. */
const SPOTS: Record<string, (v: View, p: 0 | 1) => Pt[]> = {
  // Snake's turn buttons: 124 x 60, 12 in from each side, 10 from the seat's edge.
  snake: (_v, p) => [74, W - 74].map((x) => ({ x, y: p === 0 ? H - 40 : 40 })),
  penalty: (v, p) => (v.diveBtns as Pt[][])[p].map((b) => ({ x: b.x, y: b.y })),
  sumo: (v, p) => [(v.buttons as Pt[])[p]].map((b) => ({ x: b.x, y: b.y })),
  tanks: (v, p) => {
    const cs = (v.controls as { stickX: number; fireX: number }[])[p];
    const at = (x: number) => (p === 0 ? { x, y: CONTROLS_Y } : { x: W - x, y: H - CONTROLS_Y });
    return [at(cs.stickX), at(cs.fireX)];
  },
};

/** The brightest fill drawn on each of seat p's buttons. */
function brightness(id: string, bots: [string | null, string | null], p: 0 | 1): number[] {
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: bots[0] as never }), player({ bot: bots[1] as never })];
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES[id].create({ seed: 1, rng: makeRng(1), players, powersOn: false, sfx, fx: new Fx(), end() {} }) as unknown as View;
  const { g, fills } = recorder();
  setReader(soloReader([players[0].bot, players[1].bot]), g);
  try {
    view.render(g);
  } finally {
    setReader(null);
  }
  return SPOTS[id](view, p).map((s) => {
    const on = fills.filter((f) => Math.hypot(f.x - s.x, f.y - s.y) < 3);
    expect(on.length, `${id} seat ${p} button at ${s.x},${s.y}`).toBeGreaterThan(0);
    return Math.max(...on.map((f) => f.alpha));
  });
}

// F170: playing the bot, its own buttons were drawn as bright as the person's, so a kid
// pressed them and nothing happened.
describe('Play the bot: the bot\'s own buttons are drawn faint', () => {
  for (const id of Object.keys(SPOTS)) {
    it(id, () => {
      for (const botSeat of [0, 1] as const) {
        const person = botSeat === 0 ? 1 : 0;
        const bots: [string | null, string | null] = botSeat === 0 ? ['easy', null] : [null, 'easy'];
        const two = (p: 0 | 1) => brightness(id, [null, null], p);
        brightness(id, bots, botSeat).forEach((a, i) => expect(a).toBeCloseTo(two(botSeat)[i] * BOT_CONTROLS_ALPHA));
        expect(brightness(id, bots, person)).toEqual(two(person));
        // Two bots (a demo): nobody at the table, both seats stay bright.
        expect(brightness(id, ['easy', 'easy'], botSeat)).toEqual(two(botSeat));
      }
    });
  }
});

/** The brightest fill drawn on seat p's power button, with every seat holding the game's first power. */
function powerBrightness(id: string, bots: [string | null, string | null], p: 0 | 1): number {
  const pw = (powers.games as Record<string, PowerDef[]>)[id][0];
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: bots[0] as never, power: pw }), player({ bot: bots[1] as never, power: pw })];
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES[id].create({ seed: 1, rng: makeRng(1), players, powersOn: true, sfx, fx: new Fx(), end() {} }) as unknown as View;
  const { g, fills } = recorder();
  setReader(soloReader([players[0].bot, players[1].bot]), g);
  try {
    view.render(g);
  } finally {
    setReader(null);
  }
  const b = (view.powerBtns as ({ button: Pt } | null)[])[p]!.button;
  const on = fills.filter((f) => Math.hypot(f.x - b.x, f.y - b.y) < 3);
  expect(on.length, `${id} seat ${p} power button`).toBeGreaterThan(0);
  return Math.max(...on.map((f) => f.alpha));
}

// F171: the bot's power button read as one more button to press; its face is faint now
// (the energy ring and the power's icon stay clear).
describe('Play the bot: the bot\'s power button is drawn faint', () => {
  for (const id of ['airhockey', 'snake', 'sumo', 'snacksnatch', 'pingpong', 'minigolf', 'chopchop', 'tanks', 'penalty', 'quickdraw']) {
    it(id, () => {
      for (const botSeat of [0, 1] as const) {
        const person = botSeat === 0 ? 1 : 0;
        const bots: [string | null, string | null] = botSeat === 0 ? ['easy', null] : [null, 'easy'];
        expect(powerBrightness(id, bots, botSeat)).toBeCloseTo(powerBrightness(id, [null, null], botSeat) * BOT_CONTROLS_ALPHA);
        expect(powerBrightness(id, bots, person)).toBe(powerBrightness(id, [null, null], person));
        expect(powerBrightness(id, ['easy', 'easy'], botSeat)).toBe(powerBrightness(id, [null, null], botSeat));
      }
    });
  }
});
