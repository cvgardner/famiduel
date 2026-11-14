// The ghost finger: a tiny looping animation in each intro half that shows the
// game's gesture (tap, hold, pull back, swipe...). Kids who can't read the
// how-to line yet can copy the finger. Each game names its gesture in
// content/games.json; the animations themselves are CSS (`.demo` in style.css).
// It shows for a game's first few matches on this phone, then gets out of the way.

import { H, MID } from '../engine/world';
import { powerPicHtml } from './powerpic';

export const GESTURES = ['tap', 'tap2', 'sides', 'hold', 'pull', 'swipe', 'slide', 'drag', 'move', 'drop', 'stick', 'kick'] as const;
export type Gesture = (typeof GESTURES)[number];

/** Matches of a game after which its intro stops showing the ghost finger. */
export const DEMO_MATCHES = 3;

export function isGesture(g: unknown): g is Gesture {
  return typeof g === 'string' && (GESTURES as readonly string[]).includes(g);
}

/** Show the demo until this game has been played DEMO_MATCHES times on this phone. */
export function showsDemo(history: readonly { game: string }[], game: string): boolean {
  let n = 0;
  for (const h of history) if (h.game === game && ++n >= DEMO_MATCHES) return false;
  return true;
}

/**
 * How long the in-play finger stays over a person's half at their first match (ms):
 * the 1.8 s countdown plus one second of play. Any longer and its dark card hid the
 * person's goal or the first snacks while play was already on (F137).
 */
export const PLAY_DEMO_MS = 2800;

/**
 * The very first match of a game on this phone also shows the finger once more in
 * play, over each person's own half, through the countdown and the first second of
 * play (the intro's copy is small and gone by the time the ball moves).
 */
export function firstMatchOf(history: readonly { game: string }[], game: string): boolean {
  return !history.some((h) => h.game === game);
}

/**
 * The in-play finger for seat p (CSS turns seat 1's copy to face them). `at` is how far
 * down seat 0's screen it sits (0.72 by default, between the middle and their edge; a
 * game whose own hints sit there, like Ping Pong's, sets `demoAt` in content/games.json).
 */
export function playDemoHtml(g: Gesture, p: number, lefty = false, at = 0.72, keeper = false): string {
  // keeper: Penalty's two-role loop starts on its second half (the keeper's dive), for the
  // seat that keeps goal first (F138); the ~2.8 s in play only fits one role.
  const side = besideCountdown(at) ? `;--dx:${DEMO_BESIDE_DX}%;--s:${DEMO_BESIDE_SCALE}` : '';
  const [out, gone] = playDemoOut(g, keeper);
  const fade = `;--out:${out}s;--fade:${round2(gone - out)}s`;
  // F215: the shooter's copy loops the swipe alone (SHOOTER_LOOP), so it is still on at GO.
  const role = g === 'kick' ? (keeper ? ' keeper' : ' shooter') : '';
  return `<div class="play-demo p${p}${role}" data-p="${p}" style="--at:${at}${side}${fade}" aria-hidden="true">${demoHtml(g, lefty)}</div>`;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * F214: when each gesture's finger fades out in its first loop (seconds after it starts:
 * [last fully shown, gone]), read from the `d-<gesture>-f` keyframes in style.css
 * (2.6 s loops; Penalty's two-role loop is 5.2 s and the keeper's copy starts 2.6 s in).
 * The in-play card fades over the same stretch, so it never shows as an empty dark box
 * over a person's half after the finger has gone. tests/demo.test.ts checks the CSS.
 */
export const PLAY_DEMO_OUT: Record<Gesture, readonly [number, number]> = {
  tap: [1.82, 2.21],
  tap2: [2.08, 2.39],
  sides: [1.72, 2.13],
  hold: [1.64, 2.08],
  pull: [1.46, 1.87],
  swipe: [0.83, 1.14],
  slide: [1.95, 2.47],
  drag: [2.18, 2.6],
  move: [1.66, 2.08],
  drop: [1.3, 1.72],
  stick: [1.95, 2.29],
  kick: [1.85, 2.02],
};
/**
 * F215: in play the shooter's Penalty copy loops the swipe alone every SHOOTER_LOOP seconds
 * (`.play-demo.shooter` in style.css), so it shows two flicks and fades with the second,
 * just after GO; on the 5.2 s two-role loop its one flick was gone at 1.14 s, before GO.
 */
export const SHOOTER_LOOP = 1.4;
/** Penalty's keeper-first copy: the dive's finger, 2.6 s into the 5.2 s loop. */
export const PLAY_DEMO_OUT_KEEPER: readonly [number, number] = [1.82, 2.18];

export function playDemoOut(g: Gesture, keeper = false): readonly [number, number] {
  return keeper && g === 'kick' ? PLAY_DEMO_OUT_KEEPER : PLAY_DEMO_OUT[g];
}

/** Each person's "3 2 1" digit sits this far from the middle line (world units; runner.ts). */
export const COUNT_DY = 120;

/**
 * F152: a finger card at the same height as a person's countdown digit covered "3 2 1"
 * with its dark tile (the default 0.72 is the digit's height). Such a card moves to the
 * person's right of the digit, a little smaller, so both read while the finger loops.
 */
export const DEMO_BESIDE_DX = 28;
export const DEMO_BESIDE_SCALE = 1.7;

/** Would a finger card `at` this far down seat 0's screen meet the countdown digit? */
export function besideCountdown(at: number): boolean {
  return Math.abs(at - (MID + COUNT_DY) / H) < 0.12;
}

// Props drawn next to the finger, per gesture: the thing the finger moves.
const PROPS: Record<Gesture, string> = {
  tap: '',
  tap2: '<i class="cell"></i>',
  sides: '<i class="side l"></i><i class="side r"></i>',
  hold: '<i class="p"></i>',
  pull: '<i class="p"></i>',
  swipe: '<i class="p"></i>',
  slide: '<i class="p"></i>',
  drag: '<i class="p"></i>',
  move: '<i class="p"></i><i class="cell"></i>',
  drop: '<i class="p"></i>',
  stick: '<i class="base"></i><i class="fire"></i>',
  // Two roles: the shooter's ball, then the keeper's dive button.
  kick: '<i class="p"></i><i class="cell"></i>',
};

export function demoHtml(g: Gesture, lefty = false): string {
  return `<div class="demo${lefty && g === 'stick' ? ' lefty' : ''} g-${g}" aria-hidden="true" data-gesture="${g}">${PROPS[g]}<i class="r"></i><i class="f"></i></div>`;
}

/**
 * After the first matches the finger goes away, but a kid can forget (or a new kid
 * picks the phone up). A small "?" beside the title brings it back for that half.
 */
export function demoHelpHtml(p: number): string {
  return `<button class="demo-help" data-p="${p}" aria-label="Show me how to play"><span>?</span></button>`;
}

/**
 * A kid who needed the "?" once probably needs it twice. When a seat taps "?", that
 * game's next intro shows the finger in that half again by itself (for the same person
 * only), until a match of it is played to the end. Kept for this session only.
 */
export class HelpMemory {
  private readonly wanted = new Set<string>();

  private key(game: string, p: number, who: string): string {
    return `${game}\u0000${p}\u0000${who}`;
  }

  /** The seat tapped "?" in this game's intro. */
  mark(game: string, p: number, who: string): void {
    this.wanted.add(this.key(game, p, who));
  }

  /** Should this game's intro show the finger again for this seat? */
  wants(game: string, p: number, who: string): boolean {
    return this.wanted.has(this.key(game, p, who));
  }

  /** A match was played to the end with the finger shown again: back to the "?". */
  played(game: string, p: number, who: string): void {
    this.wanted.delete(this.key(game, p, who));
  }
}

/** What one seat sees on the mid-match "How to play" screen. */
export type HowToSeat = {
  p: number;
  name: string;
  color: string;
  bot: boolean;
  lefty?: boolean;
  power?: { id?: string; icon: string; name: string; desc: string } | null;
  /** The power meter right now (0..1 full, seconds still active); left out = not shown. */
  charge?: { value: number; active: number } | null;
};

/**
 * Where a picked power is right now, in words a kid can act on: on, ready to
 * tap, or how full its meter is. The meter fills from play, not from time, so
 * it says how full, never "ready in 4 s".
 */
export function powerStatus(c: { value: number; active: number }): { cls: 'on' | 'ready' | 'charging'; text: string } {
  if (c.active > 0) return { cls: 'on', text: '✨ On now!' };
  if (c.value >= 1) return { cls: 'ready', text: '⚡ Ready! Tap your power button' };
  const pct = Math.max(0, Math.min(99, Math.floor(c.value * 100)));
  return { cls: 'charging', text: `Charging: ${pct}%` };
}

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * One half of the "How to play" screen opened from the pause menu. A kid who
 * only realises mid-match that they don't know the gesture (or what their power
 * does) gets the ghost finger, the how-to line and their picked power, facing
 * them. A bot's half just says it is waiting.
 */
function chargeHtml(c: { value: number; active: number }): string {
  const st = powerStatus(c);
  const fill = st.cls === 'charging' ? Math.max(0, Math.min(1, c.value)) : 1;
  return `<span class="charge ${st.cls}"><span class="charge-bar"><i style="width:${Math.round(fill * 100)}%"></i></span>${st.text}</span>`;
}

/**
 * The colour-free seat cue in words (see seatRing in engine/draw.ts): player 0's piece has a
 * solid white ring, player 1's a dashed one. Shown on a person's half of the intro and of
 * How to play in the games that draw the ring, so a kid knows which piece is theirs before
 * round 1 even when both colours look alike to them.
 */
export function seatCueHtml(p: number): string {
  const dash = p === 1 ? ' stroke-dasharray="5 4"' : '';
  return ` <span class="seat-cue"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="rgba(20,17,43,.7)" stroke-width="4"${dash}/><circle cx="12" cy="12" r="8" fill="none" stroke="#fff" stroke-width="2"${dash}/></svg> yours: <b>${p === 1 ? 'dashed' : 'solid'} ring</b></span>`;
}

export function howToHalfHtml(seat: HowToSeat, game: { id?: string; icon: string; name: string; howTo: string; gesture?: string; seatRing?: boolean }): string {
  const g = isGesture(game.gesture) ? game.gesture : null;
  const head = `<div class="intro-head"><div class="intro-title">${game.icon} ${game.name}</div>${g && !seat.bot ? demoHtml(g, !!seat.lefty) : ''}</div>`;
  const body = seat.bot
    ? `<p class="howto">🤖 Waiting for you</p>`
    : `<p class="howto">${game.howTo}</p>${
        seat.power ? `<p class="my-power">${game.id && seat.power.id ? powerPicHtml(game.id, seat.power.id) : ''}<span class="picon">${seat.power.icon}</span> <b>Your power: ${seat.power.name}</b> ${seat.power.desc}${
            seat.charge ? chargeHtml(seat.charge) : ''
          }</p>` : ''
      }`;
  return `<div class="half p${seat.p}${seat.bot ? ' bot' : ''}" style="--c:${seat.color}"><div class="half-inner">${head}${body}<div class="who">${escHtml(seat.name)}${seat.bot ? ' 🤖' : game.seatRing ? seatCueHtml(seat.p) : ''}</div></div></div>`;
}
