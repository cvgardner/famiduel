import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { setTextScale } from '../src/engine/draw';
import { Fx } from '../src/engine/fx';
import type { Sfx } from '../src/engine/sfx';
import { MID, W } from '../src/engine/world';
import { PAUSE_CLEAR } from '../src/games/sumo/index';
import { GAMES } from '../src/games/registry';
import { recorder } from './canvasRecorder';
import { player } from './helpers';

/** A recorder whose words measure by the font size they are drawn at (bold system font ≈ 0.6 em a letter). */
function sizedRecorder() {
  const rec = recorder();
  const g = rec.g as unknown as Record<string, unknown>;
  const em = () => parseFloat(/(\d+(?:\.\d+)?)px/.exec(String(g.font))?.[1] ?? '10');
  g.measureText = (s: string) => ({ width: [...s].length * em() * 0.6 });
  const sized: { str: string; x: number; y: number; w: number }[] = [];
  const fillText = g.fillText as (s: string, x: number, y: number) => void;
  g.fillText = (s: string, x: number, y: number) => {
    fillText(s, x, y);
    const last = rec.words[rec.words.length - 1];
    sized.push({ str: s, x: last.x, y: last.y, w: [...s].length * em() * 0.6 });
  };
  return { ...rec, sized };
}

type View = { render(g: unknown): void };
function create(id: 'sumo' | 'snake' | 'chopchop'): View {
  const sfx = { play() {} } as unknown as Sfx;
  return GAMES[id].create({ seed: 1, rng: makeRng(1), players: [player({ bot: null }), player({ bot: null })], powersOn: false, sfx, fx: new Fx(), end() {} }) as unknown as View;
}

/** Each banner word's box: the smallest rounded box around its centre. */
function check(view: View, strs: string[]) {
  const rec = sizedRecorder();
  view.render(rec.g);
  let n = 0;
  for (const w of rec.sized.filter((x) => strs.includes(x.str))) {
    const around = rec.fills.filter((b) => b.box && b.box.x0 < w.x && w.x < b.box.x1 && b.box.y0 < w.y && w.y < b.box.y1 && b.box.x1 - b.box.x0 > 100);
    const f = around.sort((p, q) => p.box!.x1 - p.box!.x0 - (q.box!.x1 - q.box!.x0))[0];
    expect(f, `a box behind "${w.str}"`).toBeDefined();
    const box = f!.box!;
    expect(w.x - w.w / 2, `"${w.str}" starts inside its box`).toBeGreaterThanOrEqual(box.x0 + 6);
    expect(w.x + w.w / 2, `"${w.str}" ends inside its box`).toBeLessThanOrEqual(box.x1 - 6);
    // The pause button covers the left edge at the centre line.
    if (box.y0 < MID + 30 && box.y1 > MID - 30) expect(box.x0, `"${w.str}" box clear of the pause button`).toBeGreaterThanOrEqual(PAUSE_CLEAR);
    expect(box.x1).toBeLessThanOrEqual(W);
    n++;
  }
  return n;
}

// F246: with Bigger text on a small phone, Sumo's "Player 1 wins the round!" box ran under the
// pause button and Snake's "Ouch! Next round…" ran past its fixed box.
describe('boxed round-end banners fit their words, with and without Bigger text', () => {
  for (const scale of [1, 1.2]) {
    it(`Sumo (text scale ${scale})`, () => {
      setTextScale(scale);
      try {
        for (const str of ['Player 1 wins the round!', 'Bot wins the round!', 'Both out! Again']) {
          const v = create('sumo');
          (v as unknown as { showBanner(s: string, c: string, t: number, b: boolean): void }).showBanner(str, '#ffffff', 1, true);
          expect(check(v, [str])).toBe(2);
        }
      } finally {
        setTextScale(1);
      }
    });
    it(`Snake (text scale ${scale})`, () => {
      setTextScale(scale);
      try {
        for (const w of [0, 1, null]) {
          const v = create('snake');
          const g = (v as unknown as { game: { phase: string; done: boolean; lastRound: number | null } }).game;
          Object.assign(g, { phase: 'over', done: false, lastRound: w });
          expect(check(v, ['You win the round!', 'Ouch! Next round…', 'Draw round! Again'])).toBe(2);
        }
      } finally {
        setTextScale(1);
      }
    });
    it(`Chop Chop (text scale ${scale})`, () => {
      setTextScale(scale);
      try {
        for (const reason of ['bonk', 'time', 'fifty']) {
          const v = create('chopchop');
          const g = (v as unknown as { game: { phase: string; done: boolean; lastRound: number | null; choppers: { outReason: string }[] } }).game;
          Object.assign(g, { phase: 'over', done: false, lastRound: 0 });
          g.choppers[1].outReason = reason;
          expect(check(v, ['You win the round!', 'Bonked!', 'Out of time!', 'They got to 50!'])).toBe(2);
        }
      } finally {
        setTextScale(1);
      }
    });
  }
});
