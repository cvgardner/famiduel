// Player profiles, settings, the current match night and the match history,
// all kept on the device (localStorage). Nothing leaves the phone.
import { PLAYER_COLORS, safePair } from '../core/colors';
import type { BotLevel, GameResult, PlayerIndex } from '../core/types';

/**
 * `bot` says whether this seat is a bot and its level for every game;
 * `botLevels` holds a level picked for one game on that game's intro, which
 * wins there (a parent may want an easy Checkers bot but a normal Air Hockey one).
 */
export type Profile = { name: string; color: string; headStart: number; bot: BotLevel | null; botLevels?: Record<string, BotLevel> };

export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];

/** Who plays this seat in this game: null for a person, else the bot's level. */
export function botFor(pr: Profile, game: string): BotLevel | null {
  if (!pr.bot) return null;
  const lv = pr.botLevels?.[game];
  return lv && BOT_LEVELS.includes(lv) ? lv : pr.bot;
}
export type Settings = { powers: boolean; autoHandicap: boolean; sound: boolean; haptics: boolean };
export type MatchRecord = {
  game: string;
  at: number;
  names: [string, string];
  winner: PlayerIndex | null;
  score: [number, number];
  powers: [string | null, string | null];
};
export type Night = { started: number; wins: [number, number]; games: MatchRecord[] };

export { PLAYER_COLORS };

const KEY = 'famiduel.v1';
const HISTORY_CAP = 2000;

type Saved = { profiles: [Profile, Profile]; settings: Settings; night: Night; history: MatchRecord[] };

function defaults(): Saved {
  return {
    profiles: [
      { name: 'Player 1', color: PLAYER_COLORS[0].hex, headStart: 0, bot: null },
      { name: 'Player 2', color: PLAYER_COLORS[1].hex, headStart: 0, bot: null },
    ],
    settings: { powers: true, autoHandicap: true, sound: true, haptics: true },
    night: { started: Date.now(), wins: [0, 0], games: [] },
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

  record(game: string, result: GameResult, powers: [string | null, string | null]): MatchRecord {
    const rec: MatchRecord = {
      game,
      at: Date.now(),
      names: [this.data.profiles[0].name, this.data.profiles[1].name],
      winner: result.winner,
      score: result.score,
      powers,
    };
    const night = this.data.night;
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

  newNight(): void {
    this.data.night = { started: Date.now(), wins: [0, 0], games: [] };
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
