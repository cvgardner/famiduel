// Every playable game. A game listed in content/games.json but missing here
// shows as "coming soon".
import type { GameDef } from '../engine/game';
import airhockey from './airhockey';
import checkers from './checkers';
import chopchop from './chopchop';
import fourinarow from './fourinarow';
import minigolf from './minigolf';
import minipool from './minipool';
import penalty from './penalty';
import pingpong from './pingpong';
import quickdraw from './quickdraw';
import rps from './rps';
import seabattle from './seabattle';
import snacksnatch from './snacksnatch';
import snake from './snake';
import sumo from './sumo';
import tanks from './tanks';
import tictactoe from './tictactoe';
import tugofwar from './tugofwar';

export const GAMES: Record<string, GameDef> = {
  [minigolf.id]: minigolf,
  [airhockey.id]: airhockey,
  [sumo.id]: sumo,
  [pingpong.id]: pingpong,
  [penalty.id]: penalty,
  [minipool.id]: minipool,
  [snacksnatch.id]: snacksnatch,
  [snake.id]: snake,
  [quickdraw.id]: quickdraw,
  [tanks.id]: tanks,
  [seabattle.id]: seabattle,
  [fourinarow.id]: fourinarow,
  [checkers.id]: checkers,
  [chopchop.id]: chopchop,
  [tugofwar.id]: tugofwar,
  [tictactoe.id]: tictactoe,
  [rps.id]: rps,
};
