// Every playable game. A game listed in content/games.json but missing here
// shows as "coming soon".
import type { GameDef } from '../engine/game';
import airhockey from './airhockey';
import checkers from './checkers';
import rps from './rps';
import tictactoe from './tictactoe';

export const GAMES: Record<string, GameDef> = {
  [airhockey.id]: airhockey,
  [checkers.id]: checkers,
  [tictactoe.id]: tictactoe,
  [rps.id]: rps,
};
