// Every playable game. A game listed in content/games.json but missing here
// shows as "coming soon".
import type { GameDef } from '../engine/game';
import airhockey from './airhockey';
import tanks from './tanks';

export const GAMES: Record<string, GameDef> = {
  [airhockey.id]: airhockey,
  [tanks.id]: tanks,
};
