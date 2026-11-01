// The ghost finger: a tiny looping animation in each intro half that shows the
// game's gesture (tap, hold, pull back, swipe...). Kids who can't read the
// how-to line yet can copy the finger. Each game names its gesture in
// content/games.json; the animations themselves are CSS (`.demo` in style.css).
// It shows for a game's first few matches on this phone, then gets out of the way.

export const GESTURES = ['tap', 'tap2', 'sides', 'hold', 'pull', 'swipe', 'slide', 'drag', 'move', 'drop', 'stick'] as const;
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
  power?: { icon: string; name: string; desc: string } | null;
};

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * One half of the "How to play" screen opened from the pause menu. A kid who
 * only realises mid-match that they don't know the gesture (or what their power
 * does) gets the ghost finger, the how-to line and their picked power, facing
 * them. A bot's half just says it is waiting.
 */
export function howToHalfHtml(seat: HowToSeat, game: { icon: string; name: string; howTo: string; gesture?: string }): string {
  const g = isGesture(game.gesture) ? game.gesture : null;
  const head = `<div class="intro-head"><div class="intro-title">${game.icon} ${game.name}</div>${g && !seat.bot ? demoHtml(g, !!seat.lefty) : ''}</div>`;
  const body = seat.bot
    ? `<p class="howto">🤖 Waiting for you</p>`
    : `<p class="howto">${game.howTo}</p>${
        seat.power ? `<p class="my-power"><span class="picon">${seat.power.icon}</span> <b>Your power: ${seat.power.name}</b> ${seat.power.desc}</p>` : ''
      }`;
  return `<div class="half p${seat.p}${seat.bot ? ' bot' : ''}" style="--c:${seat.color}"><div class="half-inner">${head}${body}<div class="who">${escHtml(seat.name)}${seat.bot ? ' 🤖' : ''}</div></div></div>`;
}
