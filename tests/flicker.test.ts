import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blink, BLINK_MAX_HZ, pulse } from '../src/engine/calm';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Light/dark changes a viewer sees as flashing: on/off tests and opacity or colour pulses. */
const FLASHY = /(Math\.sin\([^)]*\)\s*[<>])|globalAlpha|alpha\(|fillStyle|strokeStyle|\?\s*COLORS/;

// F227: WCAG 2.3.1 and the Game Accessibility Guidelines ("avoid flickering") draw the line at
// three flashes a second. Quick Draw's Slow Time pulse tinted a whole half 3.5 times a second,
// Chop Chop's low timer flipped 3.2 times and Tank Duel's fading shield blinked 4.8 times.
describe('No flicker above 2 a second', () => {
  it('blink() and pulse() never run faster than BLINK_MAX_HZ', () => {
    expect(BLINK_MAX_HZ).toBeLessThanOrEqual(2);
    for (const hz of [1, 2, 5, 30]) {
      let flips = 0;
      let was = blink(0, hz);
      for (let t = 0; t < 10; t += 1 / 600) {
        const now = blink(t, hz);
        if (now !== was) flips++;
        was = now;
      }
      // Two flips (on then off) a cycle.
      expect(flips / 2 / 10).toBeLessThanOrEqual(BLINK_MAX_HZ + 0.1);
    }
    expect(pulse(0.125, 30)).toBeCloseTo(pulse(0.125, BLINK_MAX_HZ));
  });

  it('no view flashes light/dark with a raw Math.sin faster than BLINK_MAX_HZ', () => {
    const bad: string[] = [];
    for (const f of [...files('src/games'), ...files('src/engine'), ...files('src/app')]) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (!FLASHY.test(line)) return;
        for (const m of line.matchAll(/Math\.sin\(\s*this\.t\s*\*\s*([0-9.]+)/g)) {
          const hz = Number(m[1]) / (2 * Math.PI);
          if (hz > BLINK_MAX_HZ + 1e-9) bad.push(`${f}:${i + 1} runs ${hz.toFixed(1)} a second: ${line.trim()}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
