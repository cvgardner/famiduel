import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// F277: "honest bot" means the bot plays by the person's rules. Rival two-player apps get
// this wrong (reviews: a hard bot scored 2 points per slap to the person's 1, power-ups
// spawned in front of the bot). Here only the *Bot classes know a seat is a bot: the rules
// classes in each src/games/<id>/logic.ts never read a player's `.bot` or a BotLevel, so a
// person and a bot always score, spawn and move alike. This keeps that true.
const GAMES_DIR = path.join(__dirname, '..', 'src', 'games');

/**
 * The file's code with comments removed, split into its top-level exports. `rules` is
 * everything but the `export class <Name>Bot` regions; `classes` is only the other classes.
 */
function rulesRegion(src: string): { rules: string; classes: string } {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const starts = [...code.matchAll(/^export (?:class|function|const|type|interface) /gm)].map((m) => m.index!);
  let rules = code.slice(0, starts[0] ?? code.length);
  let classes = '';
  for (let i = 0; i < starts.length; i++) {
    const chunk = code.slice(starts[i], starts[i + 1] ?? code.length);
    if (/^export class \w*Bot\b/.test(chunk)) continue;
    rules += chunk;
    // A class ends at its first unindented closing brace; tables after it are bot settings.
    if (chunk.startsWith('export class ')) classes += chunk.slice(0, chunk.search(/^\}/m) + 1 || chunk.length);
  }
  return { rules, classes };
}

/** Lines where the rules ask about a bot: a seat's `.bot`, `isBot`, or (inside a rules class) a BotLevel. */
function botReads(src: string): string[] {
  const { rules, classes } = rulesRegion(src);
  return [
    ...rules.split('\n').filter((l) => /\.bot\b|\bisBot\b/.test(l)),
    ...classes.split('\n').filter((l) => /\bBotLevel\b/.test(l)),
  ];
}

const ids = fs.readdirSync(GAMES_DIR).filter((d) => fs.existsSync(path.join(GAMES_DIR, d, 'logic.ts')));

describe('bots play by the same rules', () => {
  it('finds the games', () => {
    expect(ids.length).toBeGreaterThanOrEqual(15);
  });

  for (const id of ids) {
    it(`${id}: the rules never ask whether a seat is a bot`, () => {
      const hits = botReads(fs.readFileSync(path.join(GAMES_DIR, id, 'logic.ts'), 'utf8'));
      expect(hits, `${id}/logic.ts outside its *Bot class`).toEqual([]);
    });
  }

  it('the check catches a rule that reads a seat\'s bot', () => {
    const bad = 'export class Slap {\n  score(p) { return this.players[p].bot ? 2 : 1; }\n}\nexport class SlapBot {\n  level: BotLevel;\n}\n';
    expect(botReads(bad)).toEqual(['  score(p) { return this.players[p].bot ? 2 : 1; }']);
    const levelled = 'const PACE = {} satisfies Record<BotLevel, number>;\nexport class Slap {\n  constructor(readonly hard: BotLevel) {}\n}\n';
    expect(botReads(levelled)).toEqual(['  constructor(readonly hard: BotLevel) {}']);
    expect(botReads('export class SlapBot {\n  go() { return this.me.bot; }\n}\n')).toEqual([]);
  });
});
