// Tug of War view: a rope across a grassy field with a mud pit in the middle, seen from
// above. Each player's puller leans back at their end; the red ribbon on the rope shows
// who is winning, and each player's chalk line is in their colour. Each half is drawn in
// the bottom player's frame and turned 180° for the top player.
import { liftOn, popColor, POP_OUTLINE } from '../../engine/fx';
import { other, PLAYERS, type PlayerIndex } from '../../core/types';
import { alpha, circle, COLORS, controlsAlpha, facing, glow, line, noGlow, rrect, scaledSize, seatEdges, shade, silentSeat, text, type G } from '../../engine/draw';
import { pulse } from '../../engine/calm';
import { KEYS, type GameContext, type GameDef, type GameInstance } from '../../engine/game';
import type { Input } from '../../engine/input';
import { PowerButton, powerSpot } from '../../engine/widgets';
import { H, MID, W } from '../../engine/world';
import { RULES, toward, TugOfWar, TugOfWarBot, type Intent, type RoundResult } from './logic';

const GRASS_NEAR = '#3f8f3a';
const GRASS_FAR = '#357d33';
const MUD = '#7a5230';
/** The colours most of the play area is painted in (tests read pops against them). */
export const SURFACES: readonly string[] = [GRASS_NEAR, GRASS_FAR, MUD];
/** A seat colour lifted until a small pop reads behind its outline on the grass and mud. */
/**
 * F375: round stars. An empty star was a dark blot that read like the grass tufts beside
 * it, so every star now has a light outline (3:1 on both grasses) and a won star is gold.
 */
export const STAR = { outline: '#ffffff', empty: 'rgba(0,0,0,0.3)', won: COLORS.gold, line: 2 } as const;
export function seatPop(color: string): string {
  return SURFACES.reduce((c, s) => liftOn(c, POP_OUTLINE, s), popColor(color));
}

/** World units from the middle to a player's line (at line 1). */
export const LINE_PX = 130;
/** F405: how far a seat's chalk line reaches above (its flags) and below (the "your line" label) its y. */
export const LINE_BAND = { above: 20, below: 23 } as const;
/** F405: seconds a pop stays bright, for how far a closing line can move toward it. */
const LINE_DRIFT_T = 1.5;
/** Local (bottom-player) layout of one half. */
export const L = {
  /** Where the puller's hands grip the rope, before the rope's slide moves them. */
  pullerY: MID + 140,
  /** How far the puller is dragged along with the rope (a fraction of the ribbon's move). */
  drag: 0.22,
  /** The PULL! pad near the player's own edge (the whole half takes taps). */
  padY: H - 50,
  padR: 40,
  /** The round card and the "Ready… PULL!" words, between the middle and the line. */
  cardY: MID + 72,
  /** Round stars beside the puller. */
  starX: W / 2 + 118,
  starY: MID + 150,
};
/** Half the width of the mud pit across the middle. */
const MUD_H = 26;
/** The final yank: how long the winner's flourish plays at the end of a round. */
const YANK_T = 0.7;
/** F386: how far (up and down) a pop's words keep off the ribbon's centre: its bow, yank ring and some travel. */
const RIBBON_CLEAR = 30;
/** F386: how far a pop rises while it is still bright (fx: 40/s for POP_FRESH s, a little more for long words). */
const POP_BRIGHT_RISE = 30;
/** The round card waits until the yank and the tumble into the mud have played. */
const CARD_AT = 0.8;
/**
 * Where a round card sits (local y): the winner's between the middle and their line (the
 * ribbon has gone past it), the loser's further back, clear of their puller lying in the mud.
 */
export const CARD_Y = { won: MID + 72, lost: MID + 176 };
/** Round card box (local x) for each card: the loser's sits level with that seat's round
 *  stars, so it stops short of them (F376), kept centred; the winner's spans the field. */
export function cardBox(lost: boolean): { x: number; w: number } {
  if (!lost) return { x: 28, w: W - 56 };
  const right = L.starX - 11 - STAR.line - 6;
  return { x: W - right, w: 2 * right - W };
}

/** Local point in player p's frame to a screen point. */
const toScreen = (p: PlayerIndex, x: number, y: number) => (p === 0 ? { x, y } : { x: W - x, y: H - y });

class TugOfWarView implements GameInstance {
  readonly game: TugOfWar;
  private bots: (TugOfWarBot | null)[];
  private powerBtns: (PowerButton | null)[];
  private t = 0;
  /** Seconds left of each puller's jerk back after a counted tap. */
  private jerk: [number, number] = [0, 0];
  private press: [number, number] = [0, 0];
  /** The end-of-round yank: who won it, and time since. */
  private finale: { p: PlayerIndex; t: number } | null = null;
  /** A Big Yank just landed: shown as a snap of the rope. */
  private snap = 0;
  /** Pops born this step per seat, so a second one goes a line up. */
  private pops = [0, 0];
  private ended = false;

  constructor(private readonly ctx: GameContext) {
    this.game = new TugOfWar(ctx.players, ctx.powersOn, ctx.rng);
    this.bots = PLAYERS.map((p) => (ctx.players[p].bot ? new TugOfWarBot(p, ctx.players[p].bot!, ctx.rng) : null));
    this.powerBtns = PLAYERS.map((p) => {
      const pw = ctx.players[p].power;
      if (!ctx.powersOn || !pw) return null;
      const [x, y] = powerSpot(p, 40, 42, !!ctx.players[p].lefty);
      return new PowerButton(x, y, p, pw, ctx.players[p].color, silentSeat(ctx.players, p));
    });
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    const g = this.game;
    const intents = PLAYERS.map((p): Intent => {
      const bot = this.bots[p];
      if (bot) return bot.think(g, dt);
      const btn = this.powerBtns[p];
      const power = btn ? btn.update(input, g.energy[p], KEYS[p].power) : false;
      // Any number of fingers landing in this half this step is one tap (a palm or a
      // five-finger slap pulls once); the rules space counted taps out further still.
      const tap = input.of(p).some((f) => f.pressed && !(btn && btn.button.hit(f.x, f.y))) || input.keyPressed(KEYS[p].action);
      return { tap, power };
    }) as [Intent, Intent];
    for (const p of PLAYERS) if (intents[p].tap) this.press[p] = 0.1;
    g.step(dt, intents);
    for (const p of PLAYERS) {
      this.jerk[p] = Math.max(0, this.jerk[p] - dt);
      this.press[p] = Math.max(0, this.press[p] - dt);
    }
    this.snap = Math.max(0, this.snap - dt);
    if (this.finale) this.finale.t += dt;
    if (g.phase !== 'result') this.finale = null;
    const { sfx, fx, players } = this.ctx;
    this.pops = [0, 0];
    for (const e of g.events) {
      if (e.type === 'pull') {
        this.jerk[e.p] = 0.09;
        sfx.play('click');
        if (g.strain() > 0.75 && this.t % 0.5 < dt) {
          const s = this.feet(e.p);
          fx.burst(s.x, s.y, '#c9a06a', 3, 60, 2);
        }
      } else if (e.type === 'ready') sfx.play('count');
      else if (e.type === 'go') {
        sfx.play('go');
        for (const p of PLAYERS) if (!silentSeat(players, p)) this.popFor(p, 'PULL!', COLORS.gold, 26);
      } else if (e.type === 'closing') {
        sfx.play('count');
        for (const p of PLAYERS) if (!silentSeat(players, p)) this.popFor(p, 'The lines are closing in!', '#ffffff', 17);
      } else if (e.type === 'power') {
        sfx.play('power');
        fx.flash('#ffd54a', 0.1);
        const pw = players[e.p].power!;
        this.popFor(e.p, `${pw.icon} ${pw.name}!`, COLORS.gold, 22);
        const o = other(e.p);
        if (e.id === 'yank') this.popFor(o, 'Brace! Tap tap tap!', seatPop(players[o].color), 17);
        else if (e.id === 'butter') this.popFor(o, '🧈 Slippery rope!', seatPop(players[e.p].color), 17);
        else if (e.id === 'anchor') this.popFor(o, '⚓ Anchored! Hold on!', seatPop(players[e.p].color), 17);
        else this.popFor(o, `${pw.icon} they used ${pw.name}`, seatPop(players[e.p].color), 15);
      } else if (e.type === 'yank') {
        this.snap = 0.35;
        sfx.play('whoosh');
        fx.shake(5 + 10 * e.jump, 0.25);
        const r = this.ribbon();
        fx.burst(W / 2, r, '#ffffff', 12, 200, 3);
      } else if (e.type === 'round') this.onRound(e.result);
      else if (e.type === 'win' && !this.ended) {
        this.ended = true;
        sfx.play('win');
        this.ctx.end({ winner: e.p, score: [...g.score] as [number, number], summary: `${g.score[0]} – ${g.score[1]} rounds`, unit: 'rounds' });
      }
    }
  }

  /**
   * A pop in seat p's half, on the card line (a second pop this step goes a line up).
   * F386: every pop is centred on the rope, and "The lines are closing in!" printed across the
   * red ribbon players watch. It now takes the nearest line whose words, over their bright rise,
   * stay RIBBON_CLEAR off the ribbon, in that seat's half and on a line fx.pop won't move.
   */
  private popFor(p: PlayerIndex, str: string, color: string, size: number): void {
    const home = L.cardY + 30 - 28 * this.pops[p]++;
    const y = this.clearOfRibbon(str, size, home, p);
    const s = toScreen(p, W / 2, y);
    this.ctx.fx.pop(str, s.x, s.y, color, p, size);
  }

  /** F386: the local line nearest `home` where seat p's centred pop stays off the ribbon (home if none). */
  clearOfRibbon(str: string, size: number, home: number, p: PlayerIndex): number {
    const shown = scaledSize(size);
    const ry = p === 0 ? this.ribbon() : H - this.ribbon();
    const g = this.game;
    const line = MID + g.lineNow(p) * LINE_PX;
    // How far the line can slide toward the middle while the pop is still bright.
    const drift = g.phase === 'pull' && g.phaseT < RULES.closeAt + RULES.closeLen ? (g.line[p] * (1 - RULES.closeTo) * LINE_PX * LINE_DRIFT_T) / RULES.closeLen : 0;
    const free = (y: number) => {
      // The pop rises POP_BRIGHT_RISE toward the middle (up, in the seat's own view) while bright.
      const top = y - POP_BRIGHT_RISE - shown * 0.45;
      const bot = y + shown * 0.45;
      if (top < MID + 4 || bot > L.padY - L.padR - 8) return false;
      // The words are centred on the rope, so they always share the ribbon's x (half >= RIBBON_HALF_W).
      if (top < ry + RIBBON_CLEAR && ry - RIBBON_CLEAR < bot) return false;
      // F405: nor across the seat's own chalk line (its flags and "your line" label only
      // where the words are wide enough to reach them), which slides in while closing.
      const [above, below] = this.lineReach(str, shown);
      if (top < line + below && line - above - drift < bot) return false;
      const sc = toScreen(p, W / 2, y);
      return this.ctx.fx.popFits(str, sc.x, sc.y, size, p);
    };
    for (let d = 0; d <= 160; d += 4) {
      for (const y of d ? [home - d, home + d] : [home]) if (free(y)) return y;
    }
    return home;
  }

  /** F405: how far seat p's chalk line reaches above and below its y for a centred pop of `str`. */
  lineReach(str: string, shown: number): [number, number] {
    const half = Math.min(W - 16, [...str].length * shown * 0.55) / 2;
    // The flags stand 18 tall at x 14..26 and W-26..W-14; the label spans about 22..92.
    const flags = W / 2 - half < 30;
    const label = W / 2 - half < 96;
    return [flags ? LINE_BAND.above : 6, label ? LINE_BAND.below : 6];
  }

  private onRound(r: RoundResult): void {
    const { sfx, fx, players } = this.ctx;
    if (r.winner === null) {
      sfx.play('thud');
      return;
    }
    this.finale = { p: r.winner, t: 0 };
    const loser = other(r.winner);
    sfx.play('whoosh');
    sfx.play('score');
    fx.shake(8, 0.3);
    // The loser goes face first into the mud.
    const m = this.hands(loser);
    fx.burst(m.x, m.y, MUD, 26, 220, 5);
    fx.burst(m.x, m.y, '#a87a4a', 12, 160, 3);
    const w = this.hands(r.winner);
    fx.burst(w.x, w.y, players[r.winner].color, 20, 220, 4);
  }

  /** Screen y of the ribbon, with the end-of-round yank carrying it on toward the winner. */
  private ribbon(): number {
    const g = this.game;
    let pos = g.pos;
    if (this.finale) pos += toward(this.finale.p) * 0.35 * easeOut(Math.min(1, this.finale.t / YANK_T));
    return MID + pos * LINE_PX;
  }

  /** How far (screen units, + toward player 0's edge) the rope has slid, finale included. */
  private slide(): number {
    return this.ribbon() - MID;
  }

  /** Local y of p's hands on the rope. */
  private handsY(p: PlayerIndex): number {
    const g = this.game;
    const toMe = this.slide() * toward(p) * L.drag;
    const lean = 6 * g.strain() + (this.jerk[p] > 0 ? 4 : 0);
    // Never back far enough to hide under the PULL! pad.
    let y = Math.min(L.pullerY + toMe + lean, L.pullerY + MAX_BACK);
    // The loser stumbles forward into the mud at the end of a round.
    if (this.finale && this.finale.p !== p) y -= 60 * easeOut(Math.min(1, this.finale.t / YANK_T));
    return y;
  }

  private hands(p: PlayerIndex) {
    return toScreen(p, W / 2, this.handsY(p));
  }

  private feet(p: PlayerIndex) {
    return toScreen(p, W / 2 + 12, this.handsY(p) + 30);
  }

  render(gx: G): void {
    for (const p of PLAYERS) {
      gx.save();
      gx.beginPath();
      gx.rect(0, p === 0 ? MID : 0, W, MID);
      gx.clip();
      facing(gx, p, W / 2, MID, () => this.drawGround(gx, p));
      gx.restore();
    }
    this.drawMud(gx);
    for (const p of PLAYERS) facing(gx, p, W / 2, MID, () => this.drawLine(gx, p));
    this.drawRope(gx);
    for (const p of PLAYERS) facing(gx, p, W / 2, MID, () => this.drawHalf(gx, p));
    seatEdges(gx, this.ctx.players[0].color, this.ctx.players[1].color);
    for (const p of PLAYERS) this.powerBtns[p]?.render(gx, this.game.energy[p], this.t);
  }

  private drawGround(gx: G, p: PlayerIndex): void {
    const c = this.ctx.players[p].color;
    const grass = gx.createLinearGradient(0, MID, 0, H);
    grass.addColorStop(0, GRASS_FAR);
    grass.addColorStop(1, GRASS_NEAR);
    gx.fillStyle = grass;
    gx.fillRect(0, MID, W, MID);
    gx.fillStyle = alpha(c, 0.1);
    gx.fillRect(0, MID, W, MID);
    // Mown stripes and a few tufts.
    for (let i = 0; i < 6; i++) {
      gx.fillStyle = 'rgba(255,255,255,0.035)';
      gx.fillRect(0, MID + 40 + i * 50, W, 24);
    }
    for (const [x, y] of [[40, 70], [318, 150], [62, 250], [300, 288], [24, 168]]) {
      line(gx, x, MID + y, x - 3, MID + y - 7, '#2c6a2a', 2);
      line(gx, x + 4, MID + y, x + 5, MID + y - 8, '#2c6a2a', 2);
    }
  }

  /** The mud pit across the middle, shared. */
  private drawMud(gx: G): void {
    rrect(gx, 8, MID - MUD_H, W - 16, MUD_H * 2, 18, MUD, '#5a3b20', 2);
    for (const [x, y, r] of [[60, -8, 6], [110, 10, 4], [250, -6, 5], [300, 8, 7], [190, 12, 3]]) circle(gx, x, MID + y, r, '#5f3f22');
    circle(gx, 150, MID - 10, 2.5, 'rgba(255,255,255,0.25)');
  }

  /** p's chalk line in their colour; it glows while the lines are closing in. */
  private drawLine(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const y = MID + g.lineNow(p) * LINE_PX;
    const c = this.ctx.players[p].color;
    const closing = g.closing() < 1;
    if (closing) glow(gx, c, 10 + 6 * pulse(this.t));
    gx.save();
    gx.setLineDash(p === 1 ? [10, 6] : []);
    line(gx, 14, y, W - 14, y, '#ffffff', 7);
    line(gx, 14, y, W - 14, y, c, 4);
    gx.restore();
    noGlow(gx);
    // Little flags at each end of the line.
    for (const x of [14, W - 14]) {
      line(gx, x, y, x, y - 18, '#f4efe0', 2);
      gx.beginPath();
      gx.moveTo(x, y - 18);
      gx.lineTo(x + (x < W / 2 ? 12 : -12), y - 13);
      gx.lineTo(x, y - 8);
      gx.closePath();
      gx.fillStyle = c;
      gx.fill();
    }
    if (!silentSeat(this.ctx.players, p) && g.phase !== 'result') text(gx, 'your line', W / 2 - 104, y + 15, { size: 13, color: '#f4efe0', stroke: 'rgba(0,0,0,0.45)' });
  }

  /** The rope from edge to edge, with sway when slack, a hum when taut and the red ribbon. */
  private drawRope(gx: G): void {
    const g = this.game;
    const strain = g.strain();
    const slide = this.slide();
    // Slack rope sways slowly; a taut one barely moves but trembles.
    const sway = (1 - strain) * 7 * Math.sin(this.t * 2.2) + Math.min(8, Math.abs(g.vel) * 30) * Math.sin(this.t * 5.3);
    const hum = strain > 0.5 ? (strain - 0.5) * 3 * Math.sin(this.t * 61) : 0;
    const snap = this.snap > 0 ? Math.sin(this.snap * 40) * this.snap * 18 : 0;
    const bend = sway + hum + snap;
    const x0 = W / 2;
    const path = () => {
      gx.beginPath();
      gx.moveTo(x0, -10);
      gx.quadraticCurveTo(x0 + bend * 2, MID + slide, x0, H + 10);
    };
    gx.lineCap = 'round';
    path();
    gx.strokeStyle = 'rgba(0,0,0,0.25)';
    gx.lineWidth = 12;
    gx.stroke();
    path();
    gx.strokeStyle = '#c8a16a';
    gx.lineWidth = 8;
    gx.stroke();
    // Twists along the rope, sliding with it.
    gx.save();
    path();
    gx.strokeStyle = '#8f6a3a';
    gx.lineWidth = 8;
    gx.setLineDash([3, 9]);
    gx.lineDashOffset = -slide;
    gx.stroke();
    gx.restore();
    // Butter on a player's end of the rope.
    for (const p of PLAYERS) {
      if (!g.active(other(p), 'butter')) continue;
      const y0 = p === 0 ? MID + 40 : MID - 40;
      const y1 = p === 0 ? H : 0;
      gx.save();
      gx.globalAlpha = 0.75;
      line(gx, x0 + bend * 0.6, y0, x0, y1, '#ffe27a', 10);
      gx.restore();
      for (let i = 0; i < 4; i++) {
        const k = (this.t * 1.5 + i / 4) % 1;
        circle(gx, x0 + 7, y0 + (y1 - y0) * (0.2 + 0.6 * ((i * 0.27) % 1)) + k * 8 * (p === 0 ? 1 : -1), 2.5, '#ffd84a');
      }
    }
    // The ribbon: where it is shows who is winning.
    const ry = this.ribbon();
    const rx = x0 + bend * 0.5;
    const yanking = PLAYERS.find((p) => g.yank[p]);
    if (yanking !== undefined) {
      const c = this.ctx.players[yanking].color;
      glow(gx, c, 18);
      circle(gx, rx, ry, 20 + 6 * pulse(this.t, 3), undefined, c, 4);
      noGlow(gx);
    }
    // Anchor: an anchor on the ribbon in the anchoring seat's colour, so both can see it.
    const anchored = PLAYERS.find((p) => g.active(p, 'anchor'));
    if (anchored !== undefined) {
      const c = this.ctx.players[anchored].color;
      circle(gx, rx, ry, 24, undefined, c, 3);
      text(gx, '⚓', rx + 34, ry, { size: 20 });
    }
    gx.save();
    gx.translate(rx, ry);
    gx.rotate(Math.sin(this.t * 6) * 0.15 * (1 - strain) + bend * 0.02);
    gx.beginPath();
    gx.moveTo(0, 0);
    gx.lineTo(-17, -9);
    gx.lineTo(-17, 9);
    gx.closePath();
    gx.moveTo(0, 0);
    gx.lineTo(17, -9);
    gx.lineTo(17, 9);
    gx.closePath();
    gx.fillStyle = '#e8312b';
    gx.fill();
    gx.strokeStyle = '#7a1210';
    gx.lineWidth = 2;
    gx.stroke();
    circle(gx, 0, 0, 5, '#ff5148', '#7a1210', 2);
    gx.restore();
  }

  private drawHalf(gx: G, p: PlayerIndex): void {
    const g = this.game;
    const c = this.ctx.players[p].color;
    this.drawPuller(gx, p, c);
    this.drawPad(gx, p, c);
    for (let i = 0; i < RULES.winRounds; i++) star(gx, L.starX, L.starY + i * 26, 11, i < g.score[p] ? STAR.won : STAR.empty);
    if (silentSeat(this.ctx.players, p)) return;
    if (g.phase === 'ready') {
      text(gx, `Round ${g.round}`, W / 2, L.cardY - 14, { size: 18, color: '#ffffff', stroke: 'rgba(0,0,0,0.45)' });
      text(gx, 'Ready…', W / 2, L.cardY + 12, { size: 24, color: '#ffffff', stroke: 'rgba(0,0,0,0.5)' });
    } else if (g.phase === 'result' && g.last && g.phaseT > CARD_AT) this.drawCard(gx, p, g.last);
    const badges: string[] = [];
    if (g.active(p, 'heave')) badges.push('💪 strong');
    if (g.active(p, 'anchor')) badges.push('⚓ anchor');
    if (g.active(p, 'grip')) badges.push('🧤 steady');
    if (g.active(other(p), 'butter')) badges.push('🧈 slippery');
    if (badges.length) text(gx, badges.join('  '), W / 2 - 104, L.starY + 8, { size: 13, color: '#ffffff', stroke: 'rgba(0,0,0,0.5)' });
  }

  private drawCard(gx: G, p: PlayerIndex, r: RoundResult): void {
    const bot = !!this.ctx.players[other(p)].bot;
    let title: string;
    let sub = '';
    let color = '#3a2a12';
    if (r.winner === null) title = 'Dead even!';
    else if (r.winner === p) {
      title = 'You win the round!';
      color = '#1f7a3a';
      if (r.reason === 'time') sub = 'Ribbon on your side at the whistle';
    } else {
      title = 'Into the mud!';
      color = '#a02a1f';
      sub = bot ? 'Bot wins the round' : 'They win the round';
    }
    const lost = r.winner !== null && r.winner !== p;
    const y = lost ? CARD_Y.lost : CARD_Y.won;
    const box = cardBox(lost);
    const a = Math.min(1, (this.game.phaseT - CARD_AT) / 0.15);
    const a0 = gx.globalAlpha;
    gx.globalAlpha = a0 * a;
    rrect(gx, box.x, y - 30, box.w, sub ? 64 : 48, 16, 'rgba(255,250,236,0.95)', alpha(this.ctx.players[p].color, 0.9), 3);
    text(gx, title, W / 2, y - 8, { size: 22, color });
    if (sub) text(gx, sub, W / 2, y + 18, { size: 14, color: '#4a3412' });
    gx.globalAlpha = a0;
  }

  private drawPuller(gx: G, p: PlayerIndex, c: string): void {
    const g = this.game;
    const x = W / 2;
    const y = this.handsY(p);
    const strain = g.strain();
    const fell = this.finale && this.finale.p !== p ? Math.min(1, this.finale.t / YANK_T) : 0;
    const won = this.finale && this.finale.p === p ? Math.min(1, this.finale.t / YANK_T) : 0;
    const slip = g.active(other(p), 'butter') ? Math.sin(this.t * 25) * 2 : 0;
    const heave = g.active(p, 'heave');
    // Leaning back from the rope: the harder the strain, the further the lean.
    const lean = 10 + strain * 10 - fell * 22 + won * 6;
    gx.save();
    gx.translate(slip, 0);
    // Drawn a size up around the hands, so the pullers read on a phone across the table.
    gx.translate(x, y);
    gx.scale(PULLER_SCALE, PULLER_SCALE);
    gx.translate(-x, -y);
    // Shadow
    gx.beginPath();
    gx.ellipse(x + 16, y + lean + 8, 26, 12, 0, 0, Math.PI * 2);
    gx.fillStyle = 'rgba(0,0,0,0.22)';
    gx.fill();
    // Feet dug in (two shoes behind the body)
    rrect(gx, x + 4, y + lean + 16, 10, 16, 5, '#2b2b3a');
    rrect(gx, x + 20, y + lean + 12, 10, 16, 5, '#2b2b3a');
    // Body in the seat colour
    if (heave) glow(gx, COLORS.gold, 18);
    rrect(gx, x + 2, y + lean - 12, 30, 30, 12, c, shade(c, -0.35), 2);
    noGlow(gx);
    // Arms reach forward to the rope.
    line(gx, x + 6, y + lean - 6, x + 2, y - 4, shade(c, -0.15), 7);
    line(gx, x + 26, y + lean - 6, x + 3, y + 6, shade(c, -0.15), 7);
    circle(gx, x + 1, y - 4, 4.5, '#f5c99b', '#c08a5a', 1.5);
    circle(gx, x + 1, y + 6, 4.5, '#f5c99b', '#c08a5a', 1.5);
    // Head (seen from above), red-faced under strain, a sweat drop near the limit.
    const face = strain > 0.7 ? '#f2a383' : '#f5c99b';
    circle(gx, x + 17, y + lean + 4, 11, face, '#c08a5a', 2);
    rrect(gx, x + 8, y + lean - 2, 18, 6, 3, shade(c, -0.3));
    if (strain > 0.85 && !fell) circle(gx, x + 30, y + lean - 2 + ((this.t * 30) % 8), 2.5, '#9fd8ff');
    if (fell > 0.5) for (let i = 0; i < 3; i++) circle(gx, x + 8 + i * 9, y + lean - 2, 3, '#5f3f22');
    gx.restore();
    if (silentSeat(this.ctx.players, p)) return;
    if (heave) text(gx, '💪', x - 22, y + lean, { size: 20 });
    if (g.active(p, 'grip')) text(gx, '🧤', x - 22, y + lean, { size: 20 });
  }

  private drawPad(gx: G, p: PlayerIndex, c: string): void {
    const g = this.game;
    const x = W / 2;
    const y = L.padY;
    const r = L.padR * (this.press[p] > 0 ? 0.92 : 1);
    const a0 = gx.globalAlpha;
    gx.globalAlpha = a0 * controlsAlpha(this.ctx.players, p);
    const live = g.phase === 'pull';
    circle(gx, x, y + 5, r, 'rgba(0,0,0,0.3)');
    if (live && pulse(this.t, 2) > 0.6) glow(gx, '#ffffff', 14);
    circle(gx, x, y, r, live ? c : shade(c, -0.25), '#ffffff', 4);
    noGlow(gx);
    circle(gx, x, y - r * 0.25, r * 0.7, 'rgba(255,255,255,0.14)');
    text(gx, 'PULL!', x, y, { size: 21, color: '#ffffff', stroke: shade(c, -0.5), weight: 900, pair: true });
    gx.globalAlpha = a0;
    if (!silentSeat(this.ctx.players, p) && live && g.taps[p] < 6) text(gx, 'tap fast!', x, y - r - 14, { size: 14, color: '#ffffff', stroke: 'rgba(0,0,0,0.5)' });
  }
}

/** How far a puller can be pulled back toward their own edge (units). */
const MAX_BACK = 12;
/** How much bigger than its drawn units a puller is. */
const PULLER_SCALE = 1.3;

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

function star(gx: G, x: number, y: number, r: number, fill: string): void {
  gx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    gx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  gx.closePath();
  gx.fillStyle = fill;
  gx.fill();
  gx.strokeStyle = STAR.outline;
  gx.lineWidth = STAR.line;
  gx.stroke();
}

const def: GameDef = { id: 'tugofwar', create: (ctx) => new TugOfWarView(ctx) };
export default def;
