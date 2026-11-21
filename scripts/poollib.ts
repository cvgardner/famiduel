// Shared by `npm run pool` and tests/minipool-levels.test.ts. Mini Pool bot table (`npm run pool`): bot-vs-bot matches per level pairing, seats swapped
// every other match, powers off. Prints the first-named level's win share, how racks end
// (8 sunk last, 8 early, scratch on the 8, the shot cap), shots and seconds per match, and
// the easy bot's head-start ladder (+0..+3) against normal and hard, so bot levels and the
// handicap are tuned from numbers. Mini Pool is a turn game, so it isn't in `npm run sim`.
// Options: `npm run pool -- --n 40`, `--powers` to let both bots pick a random pool power.
import powers from '../content/powers.json';
import { makeRng } from '../src/core/rng';
import type { BotLevel, PlayerIndex, PlayerInfo } from '../src/core/types';
import { MiniPool, MiniPoolBot, type RackEnd } from '../src/games/minipool/logic';

const DT = 1 / 60;
type PowerDef = { id: string; name: string; icon: string; desc: string };
const POOL = (powers.games as Record<string, PowerDef[]>).minipool ?? [];

export interface PoolRow {
  /** Share of finished matches won by the first-named seat (level a). */
  wins: number;
  unfinished: number;
  ends: Record<RackEnd, number>;
  shots: number;
  seconds: number;
}

function info(level: BotLevel, assist: number, power: PowerDef | null): PlayerInfo {
  return { name: level, color: '#3fa9ff', assist, power, bot: level } as PlayerInfo;
}

/** n matches of level a (with head start `assist`) against level b, seats swapped every other one. */
export function poolPairing(a: BotLevel, b: BotLevel, n: number, assist = 0, powersOn = false, seed0 = 1): PoolRow {
  let won = 0;
  let done = 0;
  let shots = 0;
  let seconds = 0;
  const ends: Record<RackEnd, number> = { eight: 0, early8: 0, scratch8: 0, cap: 0 };
  for (let i = 0; i < n; i++) {
    const rng = makeRng(seed0 + i * 7919);
    const aSeat: PlayerIndex = i % 2 === 0 ? 0 : 1;
    const pick = () => (powersOn && POOL.length ? POOL[Math.floor(rng.next() * POOL.length)] : null);
    const pa = info(a, assist, pick());
    const pb = info(b, 0, pick());
    const players: [PlayerInfo, PlayerInfo] = aSeat === 0 ? [pa, pb] : [pb, pa];
    const g = new MiniPool(players, powersOn, rng, (i >> 1) % 2 === 0 ? 0 : 1);
    const bots = [new MiniPoolBot(0, players[0].bot!, rng), new MiniPoolBot(1, players[1].bot!, rng)];
    let shot = 0;
    while (!g.finished && g.t < 900) {
      g.step(DT, [bots[0].think(g, DT), bots[1].think(g, DT)]);
      for (const e of g.events) {
        if (e.type === 'shot') shot++;
        if (e.type === 'rackWon') ends[e.how]++;
      }
    }
    if (!g.finished || g.winner === null) continue;
    done++;
    shots += shot;
    seconds += g.t;
    if (g.winner === aSeat) won++;
  }
  return { wins: done ? won / done : 0, unfinished: n - done, ends, shots: done ? shots / done : 0, seconds: done ? seconds / done : 0 };
}

