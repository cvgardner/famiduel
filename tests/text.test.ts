import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIN_TEXT, readable } from '../src/engine/draw';

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
