// Player profiles, settings, the current match night and the match history,
// all kept on the device (localStorage). Nothing leaves the phone.
import { PLAYER_COLORS, safePair } from '../core/colors';
import type { BotLevel, GameResult, PlayerIndex } from '../core/types';

/**
 * `bot` says whether this seat is a bot and its level for every game;
 * `botLevels` holds a level picked for one game on that game's intro, which
 * wins there (a parent may want an easy Checkers bot but a normal Air Hockey one).
 */
export type Profile = { name: string; color: string; headStart: number; bot: BotLevel | null; botLevels?: Record<string, BotLevel>; /** Swaps two-thumb controls (stick and FIRE); older saves are right-handed. */ lefty?: boolean; /** The bot level "Play the bot" brings back after "Play together". */ lastBot?: BotLevel };

export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];

/** Who plays this seat in this game: null for a person, else the bot's level. */
export function botFor(pr: Profile, game: string): BotLevel | null {
  if (!pr.bot) return null;
  const lv = pr.botLevels?.[game];
  return lv && BOT_LEVELS.includes(lv) ? lv : pr.bot;
}
/** How many losses in a row to the same bot, in one game, before we offer an easier one. */
export const LOSSES_BEFORE_OFFER = 2;

export type EasierOffer = { bot: PlayerIndex; person: PlayerIndex; from: BotLevel; to: BotLevel };

/**
 * After a person loses LOSSES_BEFORE_OFFER matches of one game in a row to a
 * bot at the same level, the result screen offers that game's bot one level
 * easier. Only for a person against a bot (two bots or two people get nothing),
 * never below Easy, and a draw or a win breaks the run. Lowering the level
 * starts the count again, because older records carry the old level.
 */
export function easierOffer(history: readonly MatchRecord[], game: string, profiles: readonly [Profile, Profile]): EasierOffer | null {
  const levels = [botFor(profiles[0], game), botFor(profiles[1], game)] as const;
  if (!!levels[0] === !!levels[1]) return null;
  const bot: PlayerIndex = levels[0] ? 0 : 1;
  const person: PlayerIndex = bot === 0 ? 1 : 0;
  const from = levels[bot]!;
  const i = BOT_LEVELS.indexOf(from);
  if (i <= 0) return null;
  const mine = history.filter((r) => r.game === game).slice(-LOSSES_BEFORE_OFFER);
  if (mine.length < LOSSES_BEFORE_OFFER) return null;
  const lost = mine.every((r) => r.winner === bot && r.bots?.[bot] === from && r.bots?.[person] === null);
  return lost ? { bot, person, from, to: BOT_LEVELS[i - 1] } : null;
}

export type Settings = { powers: boolean; autoHandicap: boolean; sound: boolean; haptics: boolean };
export type MatchRecord = {
  game: string;
  at: number;
  names: [string, string];
  winner: PlayerIndex | null;
  score: [number, number];
  powers: [string | null, string | null];
  /** Each seat's bot level in this match (null = a person). Older records lack it. */
  bots?: [BotLevel | null, BotLevel | null];
};
export type Night = { started: number; wins: [number, number]; games: MatchRecord[] };

export { PLAYER_COLORS };

const KEY = 'famiduel.v1';
const HISTORY_CAP = 2000;

/**
 * `night` is the family's match night (two people). Games against the bot keep
 * their own tally in `soloNight`, so a kid's practice never lands on the family
 * scoreboard or tips the auto handicap between two people.
 */
type Saved = { profiles: [Profile, Profile]; settings: Settings; night: Night; soloNight?: Night; history: MatchRecord[] };

const freshNight = (): Night => ({ started: Date.now(), wins: [0, 0], games: [] });

/** Solo play: exactly one seat is a bot (two bots is a demo, two people a duel). */
export function isSolo(profiles: readonly [Profile, Profile]): boolean {
  return !!profiles[0].bot !== !!profiles[1].bot;
}

function defaults(): Saved {
  return {
    profiles: [
      { name: 'Player 1', color: PLAYER_COLORS[0].hex, headStart: 0, bot: null },
      { name: 'Player 2', color: PLAYER_COLORS[1].hex, headStart: 0, bot: null },
    ],
    settings: { powers: true, autoHandicap: true, sound: true, haptics: true },
    night: freshNight(),
    history: [],
  };
}

export class Store {
  data: Saved;

  constructor(private readonly storage: Storage | null = safeStorage()) {
    this.data = defaults();
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Saved>;
        // Settings merge key by key, so a setting added later keeps its default.
        this.data = { ...this.data, ...saved, settings: { ...this.data.settings, ...saved.settings } };
        // Colours from an older palette (or two look-alike colours) move to safe ones.
        const [a, b] = this.data.profiles;
        [a.color, b.color] = safePair(a.color, b.color);
      }
    } catch {
      // A broken save falls back to defaults.
    }
  }

  save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Private mode or full storage: keep playing without saving.
    }
  }

  record(
    game: string,
    result: GameResult,
    powers: [string | null, string | null],
    bots: [BotLevel | null, BotLevel | null] = [botFor(this.data.profiles[0], game), botFor(this.data.profiles[1], game)],
  ): MatchRecord {
    const rec: MatchRecord = {
      game,
      at: Date.now(),
      names: [this.data.profiles[0].name, this.data.profiles[1].name],
      winner: result.winner,
      score: result.score,
      powers,
      bots,
    };
    const night = this.night;
    if (result.winner !== null) night.wins[result.winner]++;
    night.games.push(rec);
    this.data.history.push(rec);
    if (this.data.history.length > HISTORY_CAP) this.data.history.splice(0, this.data.history.length - HISTORY_CAP);
    this.save();
    return rec;
  }

  /** Remember a bot level for one game (picked on its intro). */
  setBotLevel(p: PlayerIndex, game: string, level: BotLevel): void {
    const pr = this.data.profiles[p];
    pr.botLevels = { ...pr.botLevels, [game]: level };
    this.save();
  }

  /** Setting who plays from the player sheet applies to every game again. */
  setBot(p: PlayerIndex, bot: BotLevel | null): void {
    const pr = this.data.profiles[p];
    if (pr.bot !== bot) delete pr.botLevels;
    pr.bot = bot;
  }

  /** The scoreboard in play: the bot tally in solo play, else the family's match night. */
  get night(): Night {
    if (!isSolo(this.data.profiles)) return this.data.night;
    return (this.data.soloNight ??= freshNight());
  }

  get solo(): boolean {
    return isSolo(this.data.profiles);
  }

  /**
   * The home screen's "Play together / Play the bot" switch. The bot takes the
   * top seat at the level it had last time (Easy at first); per-game levels
   * picked on intros survive switching back and forth.
   */
  setSolo(on: boolean): void {
    const [a, b] = this.data.profiles;
    if (on) {
      if (!isSolo(this.data.profiles)) {
        a.bot = null;
        b.bot = b.lastBot ?? 'easy';
      }
    } else {
      for (const pr of [a, b]) {
        if (pr.bot) pr.lastBot = pr.bot;
        pr.bot = null;
      }
    }
    this.save();
  }

  newNight(): void {
    if (this.solo) this.data.soloNight = freshNight();
    else this.data.night = freshNight();
    this.save();
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
