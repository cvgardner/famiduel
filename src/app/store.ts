// Player profiles, settings, the current match night and the match history,
// all kept on the device (localStorage). Nothing leaves the phone.
import type { BotLevel, GameResult, PlayerIndex } from '../core/types';

export type Profile = { name: string; color: string; headStart: number; bot: BotLevel | null };
export type Settings = { powers: boolean; autoHandicap: boolean; sound: boolean };
export type MatchRecord = {
  game: string;
  at: number;
  names: [string, string];
  winner: PlayerIndex | null;
  score: [number, number];
  powers: [string | null, string | null];
};
export type Night = { started: number; wins: [number, number]; games: MatchRecord[] };

export const PLAYER_COLORS = ['#3fa9ff', '#ff5c7a', '#4ade80', '#ffb020', '#b06cff', '#26d0ce'];

const KEY = 'famiduel.v1';
const HISTORY_CAP = 2000;

type Saved = { profiles: [Profile, Profile]; settings: Settings; night: Night; history: MatchRecord[] };

function defaults(): Saved {
  return {
    profiles: [
      { name: 'Player 1', color: PLAYER_COLORS[0], headStart: 0, bot: null },
      { name: 'Player 2', color: PLAYER_COLORS[1], headStart: 0, bot: null },
    ],
    settings: { powers: true, autoHandicap: true, sound: true },
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
      if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
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
