// Every playable game. A game listed in content/games.json but missing here
// shows as "coming soon".
import type { GameDef } from '../engine/game';
import airhockey from './airhockey';
import chopchop from './chopchop';
import quickdraw from './quickdraw';
import snake from './snake';

export const GAMES: Record<string, GameDef> = {
  [airhockey.id]: airhockey,
  [snake.id]: snake,
  [quickdraw.id]: quickdraw,
  [chopchop.id]: chopchop,
};
