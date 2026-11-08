// The ghost finger: a tiny looping animation in each intro half that shows the
// game's gesture (tap, hold, pull back, swipe...). Kids who can't read the
// how-to line yet can copy the finger. Each game names its gesture in
// content/games.json; the animations themselves are CSS (`.demo` in style.css).
// It shows for a game's first few matches on this phone, then gets out of the way.

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
export function playDemoHtml(g: Gesture, p: number, lefty = false, at = 0.72): string {
  return `<div class="play-demo p${p}" data-p="${p}" style="--at:${at}" aria-hidden="true">${demoHtml(g, lefty)}</div>`;
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
