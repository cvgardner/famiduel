// Every playable game. A game listed in content/games.json but missing here
// shows as "coming soon".
import type { GameDef } from '../engine/game';
import airhockey from './airhockey';
import fourinarow from './fourinarow';
import seabattle from './seabattle';

export const GAMES: Record<string, GameDef> = {
  [airhockey.id]: airhockey,
  [fourinarow.id]: fourinarow,
  [seabattle.id]: seabattle,
};
