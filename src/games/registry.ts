// Every playable game. A game listed in content/games.json but missing here
// shows as "coming soon".
import type { GameDef } from '../engine/game';
import airhockey from './airhockey';
import checkers from './checkers';
import chopchop from './chopchop';
import quickdraw from './quickdraw';
import rps from './rps';
import snake from './snake';
import tanks from './tanks';
import tictactoe from './tictactoe';

export const GAMES: Record<string, GameDef> = {
  [airhockey.id]: airhockey,
  [snake.id]: snake,
  [quickdraw.id]: quickdraw,
  [tanks.id]: tanks,
  [checkers.id]: checkers,
  [chopchop.id]: chopchop,
  [tictactoe.id]: tictactoe,
  [rps.id]: rps,
};
