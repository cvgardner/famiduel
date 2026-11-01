// Where Tank Duel's two thumb controls sit in a player's own strip, and which
// touches count for each. Positions are in player 0's frame (bottom strip);
// the view turns them 180° for player 1. Right-handed players steer with the
// left thumb and fire with the right; a left-handed player gets the mirror.
import { W } from '../../engine/world';

export const STICK_R = 40;
export const FIRE_R = 34;
export const CONTROLS_Y = 584;
const STICK_X = 78;
const FIRE_X = 288;
/** The outer part of the strip on the fire side fires, the outer part on the stick side steers. */
const FIRE_ZONE = 236;
const STICK_ZONE = 150;

export type Controls = { stickX: number; fireX: number; /** True when a strip touch at this x (own frame) is on the fire side. */ fireSide(x: number): boolean; stickSide(x: number): boolean };

export function controlsFor(lefty: boolean): Controls {
  if (!lefty) return { stickX: STICK_X, fireX: FIRE_X, fireSide: (x) => x > FIRE_ZONE, stickSide: (x) => x < STICK_ZONE };
  return { stickX: W - STICK_X, fireX: W - FIRE_X, fireSide: (x) => x < W - FIRE_ZONE, stickSide: (x) => x > W - STICK_ZONE };
}

/** Width of the player-coloured band around a FIRE button. */
export const FIRE_RIM = 5;

/**
 * How a seat's FIRE button is painted. The button stays red (red means fire), but it
 * sits in a band of its owner's colour behind a thin dark gap, so two kids sitting
 * close can tell whose button is whose even when a player's colour is close to red.
 */
export function fireLook(playerColor: string, ready: boolean): { rim: string; gap: string; fill: string; rimR: number } {
  return { rim: playerColor, gap: '#14112b', fill: ready ? '#ff5c5c' : '#8a5560', rimR: FIRE_R + FIRE_RIM };
}
