// Player profiles, settings, the current match night and the match history,
// all kept on the device (localStorage). Nothing leaves the phone.
import { PLAYER_COLORS, safePair } from '../core/colors';
import { newTournament, recordGame, type Tournament } from '../core/tournament';
import type { BotLevel, GameResult, PlayerIndex } from '../core/types';

/**
 * `bot` says whether this seat is a bot and its level for every game;
 * `botLevels` holds a level picked for one game on that game's intro, which
 * wins there (a parent may want an easy Checkers bot but a normal Air Hockey one).
 */
export type Profile = { name: string; color: string; headStart: number; bot: BotLevel | null; botLevels?: Record<string, BotLevel>; /** Swaps two-thumb controls (stick and FIRE) and moves corner power buttons to the right corner; older saves are right-handed. */ lefty?: boolean; /** The bot level "Play the bot" brings back after "Play together". */ lastBot?: BotLevel; /** A name given to this seat's bot; a bot without one is called "Bot". */ botName?: string };

/** What a bot seat is called when nobody named it. */
export const BOT_NAME = 'Bot';

/**
 * The name a seat shows on screen and in the history. A bot never borrows the
 * person's name (after "Play the bot", the top seat said "Player 2" or a
 * sibling's name), and the person's name comes back when a person sits there.
 */
export function seatName(profiles: readonly [Profile, Profile], p: PlayerIndex): string {
  const pr = profiles[p];
  if (!pr.bot) return pr.name;
  if (pr.botName) return pr.botName;
  // Two unnamed bots (a demo match) still need names a viewer can tell apart.
  const other = profiles[p === 0 ? 1 : 0];
  return other.bot && !other.botName ? `${BOT_NAME} ${p + 1}` : BOT_NAME;
}

export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];

/** Who plays this seat in this game: null for a person, else the bot's level. */
export function botFor(pr: Profile, game: string): BotLevel | null {
  if (!pr.bot) return null;
  const lv = pr.botLevels?.[game];
  return lv && BOT_LEVELS.includes(lv) ? lv : pr.bot;
}
/**
 * A bot level picked for this one game on its intro that differs from the bot's usual
 * level (the player sheet's), so the home card can say "🤖 Hard" and nobody is surprised
 * that this game's bot plays differently. Null when every bot seat plays its usual level.
 */
export function ownBotLevel(profiles: readonly Profile[], game: string): BotLevel | null {
  for (const pr of profiles) {
    const lv = botFor(pr, game);
    if (lv && lv !== pr.bot) return lv;
  }
  return null;
}
/** How many losses in a row to the same bot, in one game, before we offer an easier one. */
export const LOSSES_BEFORE_OFFER = 2;

/** headStart set: the bot is already Easy, so the offer is one more head start star (to that many). */
export type EasierOffer = { bot: PlayerIndex; person: PlayerIndex; from: BotLevel; to: BotLevel; headStart?: number };

/** Most head start stars a seat can have (the player sheet's ★★★). */
export const MAX_HEAD_START = 3;

/**
 * After a person loses LOSSES_BEFORE_OFFER matches of one game in a row to a
 * bot at the same level, the result screen offers that game's bot one level
 * easier. Only for a person against a bot (two bots or two people get nothing),
 * never below Easy, and a draw or a win breaks the run. Lowering the level
 * starts the count again, because older records carry the old level. Against an
 * Easy bot it offers the person one more head start star instead (up to
 * MAX_HEAD_START); records carry the stars, so a new star starts the count again.
 */
export function easierOffer(history: readonly MatchRecord[], game: string, profiles: readonly [Profile, Profile]): EasierOffer | null {
  const levels = [botFor(profiles[0], game), botFor(profiles[1], game)] as const;
  if (!!levels[0] === !!levels[1]) return null;
  const bot: PlayerIndex = levels[0] ? 0 : 1;
  const person: PlayerIndex = bot === 0 ? 1 : 0;
  const from = levels[bot]!;
  const i = BOT_LEVELS.indexOf(from);
  if (i < 0) return null;
  // Already Easy: a small kid who still loses gets a head start star instead.
  const head = profiles[person].headStart ?? 0;
  if (i === 0 && head >= MAX_HEAD_START) return null;
  const mine = history.filter((r) => r.game === game).slice(-LOSSES_BEFORE_OFFER);
  if (mine.length < LOSSES_BEFORE_OFFER) return null;
  const lost = mine.every(
    (r) => r.winner === bot && r.bots?.[bot] === from && r.bots?.[person] === null && (i > 0 || (r.heads?.[person] ?? 0) === head),
  );
  if (!lost) return null;
  return i > 0 ? { bot, person, from, to: BOT_LEVELS[i - 1] } : { bot, person, from, to: from, headStart: head + 1 };
}

/** 'auto' follows the phone's light/dark setting. Missing in older saves (= auto). */
export type ThemePref = 'auto' | 'light' | 'dark';
export type Settings = { powers: boolean; autoHandicap: boolean; sound: boolean; haptics: boolean; theme?: ThemePref };
export type MatchRecord = {
  game: string;
  at: number;
  names: [string, string];
  winner: PlayerIndex | null;
  score: [number, number];
  powers: [string | null, string | null];
  /** Each seat's bot level in this match (null = a person). Older records lack it. */
  bots?: [BotLevel | null, BotLevel | null];
  /** Each seat's head start stars from the player sheet in this match. Older records lack it (0). */
  heads?: [number, number];
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
type Saved = {
  profiles: [Profile, Profile];
  settings: Settings;
  night: Night;
  soloNight?: Night;
  history: MatchRecord[];
  /** The 7-game tournament in progress (or just won), kept so a quit or a closed app can carry on. */
  tournament?: Tournament | null;
  /**
   * Bumped when a default changes for everyone. 2 (Nov 2026, Chris): super powers and the
   * auto handicap start OFF; saves from before had them on only because that was the default.
   */
  settingsVersion?: number;
};

const SETTINGS_VERSION = 2;

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
    // Classic rules out of the box (Chris, Nov 2026): powers and the auto handicap are opt-in.
    settings: { powers: false, autoHandicap: false, sound: true, haptics: true },
    night: freshNight(),
    history: [],
    settingsVersion: SETTINGS_VERSION,
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
        // Saves from before powers and the auto handicap went opt-in move to the new default once.
        if ((saved.settingsVersion ?? 1) < 2) {
          this.data.settings.powers = false;
          this.data.settings.autoHandicap = false;
        }
        this.data.settingsVersion = SETTINGS_VERSION;
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
      names: [seatName(this.data.profiles, 0), seatName(this.data.profiles, 1)],
      winner: result.winner,
      score: result.score,
      powers,
      bots,
      heads: [this.data.profiles[0].headStart ?? 0, this.data.profiles[1].headStart ?? 0],
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

  /** One seat's head start stars (0 to MAX_HEAD_START), as on the player sheet. */
  setHeadStart(p: PlayerIndex, stars: number): void {
    this.data.profiles[p].headStart = Math.max(0, Math.min(MAX_HEAD_START, Math.round(stars)));
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

  /** Start a new 7-game tournament from these games (replaces any old one). */
  startTournament(pool: readonly string[], seed: number): Tournament {
    this.data.tournament = newTournament(pool, seed);
    this.save();
    return this.data.tournament;
  }

  /** A tournament game finished. Ignored when it is not the game the tournament is on. */
  recordTournament(game: string, winner: PlayerIndex | null): void {
    const t = this.data.tournament;
    if (!t) return;
    recordGame(t, game, winner);
    this.save();
  }

  endTournament(): void {
    this.data.tournament = null;
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
