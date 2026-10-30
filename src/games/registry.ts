// Every playable game. A game listed in content/games.json but missing here
// shows as "coming soon".
import type { GameDef } from '../engine/game';
import airhockey from './airhockey';
import snacksnatch from './snacksnatch';
import sumo from './sumo';

export const GAMES: Record<string, GameDef> = {
  [airhockey.id]: airhockey,
  [sumo.id]: sumo,
  [snacksnatch.id]: snacksnatch,
};
