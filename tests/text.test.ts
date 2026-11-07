import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BIG_TEXT, BIG_TEXT_CAP, MIN_TEXT, readable, scaledSize, setTextScale, textSpan } from '../src/engine/draw';

/** Every .ts file under src/. */
function sources(dir = path.join(__dirname, '../src')): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('readable canvas text', () => {
  it('counts words and numbers, not single symbols', () => {
    expect(readable('Total')).toBe(true);
    expect(readable('1 bonk')).toBe(true);
    expect(readable('3 – 1')).toBe(true);
    expect(readable('★')).toBe(false);
    expect(readable('x')).toBe(false);
    expect(readable('@')).toBe(false);
    expect(readable('★−1')).toBe(false);
  });

  it('stays at or above Apple\'s 11 pt minimum on a 320 px wide phone', () => {
    // The 360-unit world is scaled to the phone's width (or height, if smaller).
    expect(MIN_TEXT * (320 / 360)).toBeGreaterThanOrEqual(11);
  });

  // The playtest catches computed sizes while it plays; this catches every literal one,
  // including screens the playtest may not reach (scorecards, sudden death, handicap notes).
  it(`no game draws words below ${MIN_TEXT} units`, () => {
    const small: string[] = [];
    const call = /text\(\s*\w+,\s*(['`])((?:(?!\1).)*)\1[^;]*?\bsize:\s*(\d+(?:\.\d+)?)\b/g;
    for (const file of sources()) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(call)) {
        const str = m[2].replace(/\$\{[^}]*\}/g, '0');
        if (Number(m[3]) < MIN_TEXT && readable(str)) small.push(`${path.relative(process.cwd(), file)}: "${m[2]}" at ${m[3]}`);
      }
    }
    expect(small).toEqual([]);
  });
});

describe('Bigger text', () => {
  afterEach(() => setTextScale(1));

  it('is off by default: sizes stay as written', () => {
    expect(scaledSize(13)).toBe(13);
    expect(scaledSize(48)).toBe(48);
  });

  it('grows small print 1.2x and big banners only up to the cap', () => {
    setTextScale(BIG_TEXT);
    expect(scaledSize(13)).toBeCloseTo(15.6);
    expect(scaledSize(20)).toBeCloseTo(24);
    expect(scaledSize(24)).toBe(BIG_TEXT_CAP);
    expect(scaledSize(40)).toBe(40);
    for (let s = MIN_TEXT; s <= 60; s++) expect(scaledSize(s)).toBeGreaterThanOrEqual(s);
  });

  it("finds a label's world span, turned for the top player", () => {
    expect(textSpan(100, 40, 'center', 0)).toEqual([80, 120]);
    expect(textSpan(10, 40, 'left', 0)).toEqual([10, 50]);
    expect(textSpan(10, 40, 'left', 1)).toEqual([-30, 10]);
    expect(textSpan(350, 40, 'right', 1)).toEqual([350, 390]);
  });
});
