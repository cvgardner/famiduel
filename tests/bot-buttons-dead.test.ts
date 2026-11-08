import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerInfo, PowerDef } from '../src/core/types';
import powers from '../content/powers.json';
import { Input } from '../src/engine/input';
import { W, H } from '../src/engine/world';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { GAMES } from '../src/games/registry';
import { CONTROLS_Y } from '../src/games/tanks/controls';
import { DT, player } from './helpers';

type Pt = { x: number; y: number };
type View = Record<string, unknown> & { game: unknown; update(dt: number, input: Input): void };

/** Where each seat's own touch buttons sit, read off the view (as in controls-dim.test.ts). */
const SPOTS: Record<string, (v: View, p: 0 | 1) => Pt[]> = {
  snake: (_v, p) => [74, W - 74].map((x) => ({ x, y: p === 0 ? H - 40 : 40 })),
  penalty: (v, p) => (v.diveBtns as Pt[][])[p].map((b) => ({ x: b.x, y: b.y })),
  sumo: (v, p) => [(v.buttons as Pt[])[p]].map((b) => ({ x: b.x, y: b.y })),
  tanks: (v, p) => {
    const cs = (v.controls as { stickX: number; fireX: number }[])[p];
    const at = (x: number) => (p === 0 ? { x, y: CONTROLS_Y } : { x: W - x, y: H - CONTROLS_Y });
    return [at(cs.stickX), at(cs.fireX)];
  },
  snacksnatch: (v, p) => (v.buttons as Pt[][])[p].map((b) => ({ x: b.x, y: b.y })),
};

const STEPS = 1800; // 30 s of play

/**
 * Plays a seeded match for 30 s with `bots` in the seats. When `tapSeat` is set, a finger
 * presses each of that seat's buttons (and its power button) in turn, drags a little and
 * lifts, all match long. Returns the game state every second.
 */
function play(id: string, bots: [BotLevel | null, BotLevel | null], tapSeat: 0 | 1 | null): string[] {
  const pw = (powers.games as Record<string, PowerDef[]>)[id][0];
  const players: [PlayerInfo, PlayerInfo] = [player({ bot: bots[0], power: pw }), player({ bot: bots[1], power: pw })];
  const sfx = { play() {} } as unknown as Sfx;
  const view = GAMES[id].create({ seed: 7, rng: makeRng(7), players, powersOn: true, sfx, fx: new Fx(), end() {} }) as unknown as View;
  const input = new Input();
  const spots = tapSeat === null ? [] : [...SPOTS[id](view, tapSeat), (view.powerBtns as ({ button: Pt } | null)[])[tapSeat]!.button];
  const snaps: string[] = [];
  let finger = 0;
  for (let i = 0; i < STEPS; i++) {
    const k = i % 24;
    if (spots.length && k === 0) {
      const s = spots[(i / 24) % spots.length];
      input.down(++finger, s.x, s.y);
    } else if (finger && k < 10) {
      const f = input.pointers.get(finger);
      if (f) input.move(finger, f.x + 3, f.y + (tapSeat === 0 ? -2 : 2));
    } else if (finger && k === 10) input.up(finger);
    view.update(DT, input);
    input.endFrame();
    if (i % 60 === 59) snaps.push(JSON.stringify(view.game));
  }
  return snaps;
}

// F172: playing the bot, its buttons are drawn faint (F170/F171) because nobody at the table
// should press them; a kid who still taps them must change nothing, for either seat.
describe('Play the bot: tapping the bot\'s buttons does nothing', () => {
  for (const id of Object.keys(SPOTS)) {
    it(id, () => {
      for (const botSeat of [0, 1] as const) {
        const person = botSeat === 0 ? 1 : 0;
        const bots: [BotLevel | null, BotLevel | null] = botSeat === 0 ? ['easy', null] : [null, 'easy'];
        expect(play(id, bots, botSeat), `${id}: taps on the bot's buttons (bot in seat ${botSeat})`).toEqual(play(id, bots, null));
        // The same taps really reach the buttons: on the person's own seat they change the match.
        expect(play(id, bots, person), `${id}: the person's taps (seat ${person}) do something`).not.toEqual(play(id, bots, null));
      }
    }, 60_000);
  }
});
