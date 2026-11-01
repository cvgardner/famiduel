// The app shell: home screen with the game grid and family scoreboard, player
// cards, the split-screen "pick your power" intro, the match and the results.
import gamesJson from '../../content/games.json';
import powersJson from '../../content/powers.json';
import { effectiveAssist } from '../core/handicap';
import { hashSeed } from '../core/rng';
import type { BotLevel, GameResult, PlayerIndex, PlayerInfo, PowerDef } from '../core/types';
import { Sfx } from '../engine/sfx';
import { HoldGate } from '../engine/hold';
import { Stage } from '../engine/stage';
import { GAMES } from '../games/registry';
import { demoHelpHtml, demoHtml, HelpMemory, howToHalfHtml, isGesture, showsDemo } from './demo';
import { shownGames } from './catalog';
import { Runner } from './runner';
import { StarterLog } from './starter';
import { homeGroups } from './homegroups';
import { BOT_LEVELS, BOT_NAME, PLAYER_COLORS, Store, botFor, easierOffer, seatName } from './store';

export type GameMeta = (typeof gamesJson.games)[number];
export const META: GameMeta[] = gamesJson.games;
const SHOW_ALL = typeof location !== 'undefined' && new URLSearchParams(location.search).has('all');
const POWERS = powersJson.games as Record<string, PowerDef[]>;

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A bot's half of the intro: its level for this game, where a person's Ready button sits. */
function botRow(p: PlayerIndex, level: BotLevel): string {
  const name = (v: BotLevel) => v[0].toUpperCase() + v.slice(1);
  return `<div class="seg botlvl" data-p="${p}" role="group" aria-label="Bot level for this game">${BOT_LEVELS.map(
    (v) => `<button data-p="${p}" data-v="${v}" class="${v === level ? 'on' : ''}" aria-pressed="${v === level}">${name(v)}</button>`,
  ).join('')}</div>`;
}

export class App {
  readonly store = new Store();
  readonly sfx = new Sfx();
  readonly stage: Stage;
  runner: Runner | null = null;
  private current: GameMeta | null = null;
  private picks: [PowerDef | null, PowerDef | null] = [null, null];
  /** Seats that tapped "?" get the finger again next time (see HelpMemory). */
  private readonly help = new HelpMemory();
  /** Seats whose finger came back by itself in this intro (who sat there). */
  private helpShown: { p: PlayerIndex; who: string }[] = [];
  /** Seed override from ?seed= (tests and the daily course). */
  private fixedSeed: number | null;
  private matchCount = 0;
  /** Starting takes turns: a rematch hands the first move to the other seat. */
  private readonly starters = new StarterLog();

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = `
      <section id="home" class="screen"></section>
      <section id="intro" class="screen hidden"></section>
      <section id="play" class="screen hidden">
        <canvas id="stage" aria-label="Game"></canvas>
        <button id="pauseBtn" class="pause-btn" aria-label="Pause (press and hold)">II</button>
        <div id="pauseHint" class="pause-hint hidden" aria-hidden="true"><span class="p1">Hold to pause</span><span class="p0">Hold to pause</span></div>
      </section>
      <section id="result" class="screen hidden"></section>
      <div id="modal" class="modal hidden" role="dialog" aria-modal="true"></div>`;
    this.stage = new Stage($<HTMLCanvasElement>('#stage', root));
    this.sfx.muted = !this.store.data.settings.sound;
    this.sfx.haptics.enabled = this.store.data.settings.haptics;
    const seedParam = new URLSearchParams(location.search).get('seed');
    this.fixedSeed = seedParam ? hashSeed(seedParam) : null;
    root.addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
    this.wirePauseButton($<HTMLButtonElement>('#pauseBtn', root), $('#pauseHint', root));
    this.showHome();
  }

  private show(id: string): void {
    for (const el of this.root.querySelectorAll('.screen')) el.classList.toggle('hidden', el.id !== id);
    if (id !== 'play') this.stage.stop();
  }

  // ---------- Home ----------
  showHome(): void {
    this.show('home');
    const { profiles, settings } = this.store.data;
    const night = this.store.night;
    const solo = this.store.solo;
    const played = night.games.length;
    $('#home').innerHTML = `
      <header class="brand">
        <h1 class="logo">Fami<span>Duel</span></h1>
        <p class="tag">Two players. One phone. Super powers.</p>
      </header>
      <div class="seg mode" id="modeSeg" role="group" aria-label="Who is playing">
        <button data-v="together" class="${solo ? '' : 'on'}" aria-pressed="${!solo}">👫 Play together</button>
        <button data-v="solo" class="${solo ? 'on' : ''}" aria-pressed="${solo}">🤖 Play the bot</button>
      </div>
      <section class="players">
        ${[0, 1].map((i) => this.playerChip(i as PlayerIndex)).join('<div class="vs">vs</div>')}
      </section>
      <section class="night" aria-label="${solo ? 'You vs the bot' : 'Match night'}">
        <div class="night-score"><b style="color:${profiles[0].color}">${night.wins[0]}</b><span>${solo ? 'You vs the bot' : 'Match night'} · ${played} game${played === 1 ? '' : 's'}</span><b style="color:${profiles[1].color}">${night.wins[1]}</b></div>
        ${played ? `<button id="newNightBtn" class="link">${solo ? 'Start over' : 'New night'}</button>` : ''}
      </section>
      <div class="games">
        ${homeGroups(shownGames(SHOW_ALL)).map((g) => `<section class="group" data-group="${g.id}" aria-labelledby="grp-${g.id}">
          <h2 class="group-title" id="grp-${g.id}">${g.title}</h2>
          <div class="grid">${g.games.map((m) => this.card(m)).join('')}</div>
        </section>`).join('')}
      </div>
      <section class="settings">
        ${this.toggle('powers', '⚡ Super powers', settings.powers)}
        ${this.toggle('autoHandicap', '⚖️ Auto handicap', settings.autoHandicap)}
        ${this.toggle('sound', '🔊 Sound', settings.sound)}
        ${this.sfx.haptics.supported ? this.toggle('haptics', '📳 Vibration', settings.haptics) : ''}
      </section>
      <footer class="foot">Prototype · no ads, no accounts · everything stays on this device</footer>`;
    for (const el of document.querySelectorAll<HTMLElement>('.game-card[data-ready="1"]')) {
      el.addEventListener('click', () => this.openGame(el.dataset.id!));
    }
    for (const el of document.querySelectorAll<HTMLElement>('#modeSeg button')) {
      el.addEventListener('click', () => {
        const on = el.dataset.v === 'solo';
        if (on === this.store.solo) return;
        this.store.setSolo(on);
        this.sfx.play('tap');
        this.showHome();
      });
    }
    for (const el of document.querySelectorAll<HTMLElement>('.player-chip')) {
      el.addEventListener('click', () => this.editPlayer(Number(el.dataset.p) as PlayerIndex));
    }
    for (const el of document.querySelectorAll<HTMLInputElement>('.settings input')) {
      el.addEventListener('change', () => {
        const k = el.dataset.k as keyof typeof settings;
        settings[k] = el.checked;
        this.sfx.muted = !settings.sound;
        this.sfx.haptics.enabled = settings.haptics;
        this.store.save();
      });
    }
    document.querySelector('#newNightBtn')?.addEventListener('click', () => {
      this.store.newNight();
      this.showHome();
    });
  }

  private playerChip(p: PlayerIndex): string {
    const pr = this.store.data.profiles[p];
    const stars = pr.headStart ? `<small>${'★'.repeat(pr.headStart)}</small>` : '';
    const bot = pr.bot ? `<small class="botlbl">🤖 ${pr.bot}</small>` : '';
    return `<button class="player-chip" data-p="${p}" style="--c:${pr.color}"><span class="dot"></span><span class="pname">${esc(seatName(this.store.data.profiles, p))}</span>${stars}${bot}</button>`;
  }

  private card(m: GameMeta): string {
    const ready = m.id in GAMES;
    return `<button class="game-card${ready ? '' : ' soon'}" data-id="${m.id}" data-ready="${ready ? 1 : 0}" style="--c:${m.color}" ${ready ? '' : 'aria-disabled="true"'}>
      <span class="gicon">${m.icon}</span>
      <span class="gname">${m.name}</span>
      <span class="gkind">${ready ? m.kind : 'Coming soon'}</span>
    </button>`;
  }

  private toggle(k: string, label: string, on: boolean): string {
    return `<label class="toggle"><input type="checkbox" data-k="${k}" ${on ? 'checked' : ''}/><span>${label}</span></label>`;
  }

  private editPlayer(p: PlayerIndex): void {
    const pr = this.store.data.profiles[p];
    const other = this.store.data.profiles[p === 0 ? 1 : 0];
    const modal = $('#modal');
    modal.classList.remove('hidden', 'help');
    modal.innerHTML = `<div class="sheet">
      <h2>Player ${p + 1}</h2>
      <label class="field">Name<input id="pName" maxlength="12" value="${esc(seatName(this.store.data.profiles, p))}"/></label>
      <div class="field">Colour <small>easy to tell apart, colour-blind eyes too</small><div class="swatches">${PLAYER_COLORS.map((c) => {
        const taken = c.hex === other.color;
        return `<button class="swatch${c.hex === pr.color ? ' on' : ''}${taken ? ' taken' : ''}" data-c="${c.hex}" style="--sw:${c.hex}" aria-label="${taken ? `${c.name}, taken by ${esc(seatName(this.store.data.profiles, p === 0 ? 1 : 0))}` : c.name}" ${taken ? 'disabled' : ''}></button>`;
      }).join('')}</div></div>
      <div class="field">Head start <small>help for younger players</small>
        <div class="seg" id="pHead">${[0, 1, 2, 3].map((n) => `<button data-v="${n}" class="${n === pr.headStart ? 'on' : ''}">${n ? '★'.repeat(n) : 'None'}</button>`).join('')}</div></div>
      <div class="field">Hand <small>swaps the stick and FIRE in Tank Duel</small>
        <div class="seg" id="pHand">${(['right', 'left'] as const).map((v) => `<button data-v="${v}" class="${(pr.lefty ? 'left' : 'right') === v ? 'on' : ''}">${v === 'right' ? 'Right-handed' : 'Left-handed'}</button>`).join('')}</div></div>
      <div class="field">Who plays
        <div class="seg" id="pBot">${(['human', 'easy', 'normal', 'hard'] as const).map((v) => `<button data-v="${v}" class="${(pr.bot ?? 'human') === v ? 'on' : ''}">${v === 'human' ? '🙂 Person' : '🤖 ' + v}</button>`).join('')}</div></div>
      <button id="pDone" class="btn primary">Done</button>
    </div>`;
    let color = pr.color;
    let head = pr.headStart;
    let lefty = !!pr.lefty;
    let bot: BotLevel | null = pr.bot;
    for (const b of modal.querySelectorAll<HTMLElement>('.swatch')) b.addEventListener('click', () => {
      color = b.dataset.c!;
      modal.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b));
    });
    const seg = (id: string, fn: (v: string) => void) => {
      for (const b of modal.querySelectorAll<HTMLElement>(`#${id} button`)) b.addEventListener('click', () => {
        fn(b.dataset.v!);
        modal.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle('on', x === b));
      });
    };
    seg('pHead', (v) => (head = Number(v)));
    seg('pHand', (v) => (lefty = v === 'left'));
    // Switching between a person and a bot swaps the name field to that one's name,
    // unless it was just typed.
    const nameOf = (b: BotLevel | null) => (b ? pr.botName || BOT_NAME : pr.name);
    seg('pBot', (v) => {
      const next = v === 'human' ? null : (v as BotLevel);
      const field = $<HTMLInputElement>('#pName', modal);
      if (!!next !== !!bot && field.value.trim() === nameOf(bot)) field.value = nameOf(next);
      bot = next;
    });
    $('#pDone', modal).addEventListener('click', () => {
      const typed = $<HTMLInputElement>('#pName', modal).value.trim().slice(0, 12);
      if (!bot) pr.name = typed || `Player ${p + 1}`;
      else if (typed && typed !== BOT_NAME) pr.botName = typed;
      else delete pr.botName;
      pr.color = color;
      pr.headStart = head;
      if (lefty) pr.lefty = true;
      else delete pr.lefty;
      this.store.setBot(p, bot);
      this.store.save();
      modal.classList.add('hidden');
      this.showHome();
    });
  }

  // ---------- Intro: how to play + pick a power, one half per player ----------
  openGame(id: string): void {
    const meta = META.find((m) => m.id === id);
    if (!meta || !GAMES[id]) return;
    this.current = meta;
    this.picks = [null, null];
    const powers = this.store.data.settings.powers ? (POWERS[id] ?? []) : [];
    const ready: [boolean, boolean] = [false, false];
    const intro = $('#intro');
    this.show('intro');
    // Ghost finger for the first few matches of this game on this phone.
    // After that, a person's half gets a "?" that brings it back.
    const gesture = isGesture(meta.gesture) ? meta.gesture : null;
    const firstMatches = showsDemo(this.store.data.history, id);
    this.helpShown = [];
    const half = (p: PlayerIndex) => {
      const pr = this.store.data.profiles[p];
      const assist = this.assistFor(p);
      const bot = botFor(pr, id);
      const again = !!gesture && !firstMatches && !bot && this.help.wants(id, p, pr.name);
      if (again) this.helpShown.push({ p, who: pr.name });
      return `<div class="half p${p}${bot ? ' bot' : ''}" style="--c:${pr.color}">
        <div class="half-inner">
          <div class="intro-head"><div class="intro-title">${meta.icon} ${meta.name}</div>${!gesture ? '' : firstMatches || again ? demoHtml(gesture, !!pr.lefty && !bot) : bot ? '' : demoHelpHtml(p)}</div>
          <p class="howto">${meta.howTo}</p>
          ${assist ? `<p class="assist">⚖️ Handicap help ${'★'.repeat(assist)}: ${meta.handicap.toLowerCase()}</p>` : ''}
          ${powers.length ? `<div class="powers">${powers.map((pw) => `<button class="power-card" data-p="${p}" data-id="${pw.id}"><span class="picon">${pw.icon}</span><b>${pw.name}</b><small>${pw.desc}</small></button>`).join('')}</div>` : ''}
          ${bot ? botRow(p, bot) : `<button class="btn ready" id="ready${p}" data-p="${p}">${powers.length ? 'Pick a power' : 'Ready!'}</button>`}
          <div class="who">${esc(seatName(this.store.data.profiles, p))}${bot ? ' 🤖' : ''}</div>
        </div>
      </div>`;
    };
    intro.innerHTML = `${half(1)}<div class="intro-mid"><button id="introBack" class="link">← Back</button><span>${meta.blurb}</span></div>${half(0)}`;
    $('#introBack', intro).addEventListener('click', () => this.showHome());
    for (const b of intro.querySelectorAll<HTMLElement>('.demo-help')) {
      b.addEventListener('click', () => {
        if (!gesture) return;
        const p = Number(b.dataset.p) as PlayerIndex;
        b.outerHTML = demoHtml(gesture, !!this.store.data.profiles[p].lefty);
        this.help.mark(id, p, this.store.data.profiles[p].name);
        this.sfx.play('tap');
      });
    }
    const refresh = () => {
      for (const p of [0, 1] as PlayerIndex[]) {
        const btn = intro.querySelector<HTMLButtonElement>(`#ready${p}`);
        if (!btn) continue; // a bot's half has its level row instead
        btn.classList.toggle('on', ready[p]);
        btn.textContent = ready[p] ? 'Ready ✓' : powers.length && !this.picks[p] ? 'Pick a power' : 'Ready!';
        btn.disabled = !!powers.length && !this.picks[p];
      }
      if (ready[0] && ready[1]) setTimeout(() => this.startMatch(), 250);
    };
    for (const card of intro.querySelectorAll<HTMLElement>('.power-card')) {
      card.addEventListener('click', () => {
        const p = Number(card.dataset.p) as PlayerIndex;
        if (ready[p]) return;
        this.picks[p] = powers.find((pw) => pw.id === card.dataset.id) ?? null;
        intro.querySelectorAll<HTMLElement>(`.power-card[data-p="${p}"]`).forEach((c) => c.classList.toggle('on', c === card));
        this.sfx.play('tap');
        refresh();
      });
    }
    // A bot's level for this game can be changed right here, and is remembered.
    for (const b of intro.querySelectorAll<HTMLElement>('.botlvl button')) {
      b.addEventListener('click', () => {
        const p = Number(b.dataset.p) as PlayerIndex;
        this.store.setBotLevel(p, id, b.dataset.v as BotLevel);
        intro.querySelectorAll<HTMLElement>(`.botlvl[data-p="${p}"] button`).forEach((x) => {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-pressed', String(x === b));
        });
        this.sfx.play('tap');
      });
    }
    for (const p of [0, 1] as PlayerIndex[]) {
      intro.querySelector(`#ready${p}`)?.addEventListener('click', () => {
        if (powers.length && !this.picks[p]) return;
        ready[p] = true;
        this.sfx.play('click');
        refresh();
      });
      // Bots pick at random and are ready at once.
      if (this.store.data.profiles[p].bot) {
        if (powers.length) this.picks[p] = powers[Math.floor(Math.random() * powers.length)];
        ready[p] = true;
        const chosen = this.picks[p];
        if (chosen) intro.querySelector<HTMLElement>(`.power-card[data-p="${p}"][data-id="${chosen.id}"]`)?.classList.add('on');
      }
    }
    refresh();
  }

  private assistFor(p: PlayerIndex): number {
    const { profiles, settings } = this.store.data;
    const night = this.store.night;
    return effectiveAssist([profiles[0].headStart, profiles[1].headStart], night.wins, settings.autoHandicap, p);
  }

  // ---------- Match ----------
  startMatch(): void {
    const meta = this.current;
    if (!meta || $('#intro').classList.contains('hidden')) return;
    const def = GAMES[meta.id];
    const players = ([0, 1] as PlayerIndex[]).map((p): PlayerInfo => {
      const pr = this.store.data.profiles[p];
      return { name: seatName(this.store.data.profiles, p), color: pr.color, assist: this.assistFor(p), power: this.picks[p], bot: botFor(pr, meta.id), lefty: !!pr.lefty };
    }) as [PlayerInfo, PlayerInfo];
    const seed = this.fixedSeed !== null ? (this.fixedSeed + this.matchCount++) >>> 0 : (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const powersOn = this.store.data.settings.powers && !!this.picks[0] && !!this.picks[1];
    this.show('play');
    this.runner = new Runner(this.stage, def, seed, players, powersOn, this.sfx, (r) => this.finish(r), false, this.starters.next(meta.id));
    this.stage.start();
  }

  /**
   * The pause button sits on the centre line, where both players' hands rest,
   * so a finger has to stay on it for HOLD_MS (a ring fills) before the game
   * pauses. A quick tap only shows "Hold to pause". Keyboard activation and
   * Escape pause at once: they can't happen by accident.
   */
  private wirePauseButton(btn: HTMLButtonElement, hint: HTMLElement): void {
    const gate = new HoldGate();
    let raf = 0;
    let hintTimer = 0;
    const paint = () => btn.style.setProperty('--hold', String(gate.progress(performance.now())));
    const stop = () => {
      cancelAnimationFrame(raf);
      btn.style.setProperty('--hold', '0');
    };
    const fire = () => {
      stop();
      hint.classList.add('hidden');
      this.pause();
    };
    const tick = () => {
      if (gate.update(performance.now()) === 'fired') return fire();
      paint();
      if (gate.holding) raf = requestAnimationFrame(tick);
    };
    btn.addEventListener('pointerdown', (e) => {
      if (!this.runner || this.runner.paused) return;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer (tests): no capture needed */
      }
      gate.press(performance.now());
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    });
    btn.addEventListener('pointerup', () => {
      const ev = gate.release(performance.now());
      if (ev === 'fired') return fire();
      stop();
      if (ev === 'tooShort') {
        this.pauseTaps++;
        hint.classList.remove('hidden');
        clearTimeout(hintTimer);
        hintTimer = window.setTimeout(() => hint.classList.add('hidden'), 1400);
      }
    });
    for (const t of ['pointercancel', 'lostpointercapture'] as const)
      btn.addEventListener(t, () => {
        gate.cancel();
        stop();
      });
    btn.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press menu on Android
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) this.pause(); // Enter / Space from a keyboard or switch control
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#play', this.root).classList.contains('hidden') && $('#modal').classList.contains('hidden')) this.pause();
    });
  }

  /** Quick taps on the pause button that did not pause (playtest counts them). */
  pauseTaps = 0;

  private pause(): void {
    if (!this.runner || this.runner.paused) return;
    this.runner.paused = true;
    const modal = $('#modal');
    modal.classList.remove('hidden');
    modal.classList.remove('help');
    modal.innerHTML = `<div class="sheet"><h2>Paused</h2>
      <button id="resumeBtn" class="btn primary">Resume</button>
      <button id="howBtn" class="btn">❓ How to play</button>
      <button id="restartBtn" class="btn">Restart</button>
      <button id="quitBtn" class="btn ghost">Quit to games</button></div>`;
    const close = () => modal.classList.add('hidden');
    $('#howBtn', modal).addEventListener('click', () => {
      this.sfx.play('tap');
      this.showHowTo();
    });
    $('#resumeBtn', modal).addEventListener('click', () => {
      close();
      if (this.runner) this.runner.paused = false;
    });
    $('#restartBtn', modal).addEventListener('click', () => {
      close();
      this.runner = null;
      this.startMatch2();
    });
    $('#quitBtn', modal).addEventListener('click', () => {
      close();
      this.runner = null;
      this.showHome();
    });
  }

  /**
   * "How to play" from the pause menu: each player's half (facing them) shows the
   * ghost finger, the how-to line and the power they picked. The match stays paused.
   */
  private showHowTo(): void {
    const meta = this.current;
    if (!meta || !this.runner) return;
    const modal = $('#modal');
    const players = this.runner.players;
    const seat = (p: PlayerIndex) => {
      const pl = players[p];
      return howToHalfHtml({ p, name: pl.name, color: pl.color, bot: !!pl.bot, lefty: !!pl.lefty, power: pl.power }, meta);
    };
    modal.classList.add('help');
    modal.innerHTML = `<div class="pause-help">${seat(1)}<div class="intro-mid"><button id="helpBack" class="link">← Menu</button><button id="helpResume" class="btn primary">Resume</button></div>${seat(0)}</div>`;
    $('#helpBack', modal).addEventListener('click', () => {
      if (this.runner) this.runner.paused = false;
      this.pause();
    });
    $('#helpResume', modal).addEventListener('click', () => {
      modal.classList.add('hidden');
      modal.classList.remove('help');
      if (this.runner) this.runner.paused = false;
    });
  }

  /** Restart from the pause menu: same picks, new seed. */
  private startMatch2(): void {
    this.show('intro');
    this.startMatch();
  }

  private finish(r: GameResult): void {
    const meta = this.current!;
    const seats = this.runner?.players;
    this.starters.record(meta.id, this.runner?.game.firstMover?.());
    for (const h of this.helpShown) this.help.played(meta.id, h.p, h.who);
    this.helpShown = [];
    this.store.record(
      meta.id,
      r,
      [this.picks[0]?.id ?? null, this.picks[1]?.id ?? null],
      seats ? [seats[0].bot, seats[1].bot] : undefined,
    );
    this.stage.stop();
    this.sfx.play('win');
    const { profiles, history } = this.store.data;
    const night = this.store.night;
    const solo = this.store.solo;
    // Lost twice in a row to this bot: offer an easier one, on the person's half.
    const offer = easierOffer(history, meta.id, profiles);
    const level = (v: string) => v[0].toUpperCase() + v.slice(1);
    const half = (p: PlayerIndex) => {
      const won = r.winner === p;
      const draw = r.winner === null;
      // In solo play the bot's half speaks about the bot, not to it.
      const botHalf = solo && !!seats?.[p].bot;
      const title = draw ? 'Draw!' : botHalf ? (won ? 'Bot wins' : 'Bot lost') : won ? 'You win!' : 'So close!';
      return `<div class="half p${p} ${won ? 'won' : ''}" style="--c:${profiles[p].color}"><div class="half-inner">
        <div class="res-title">${title}</div>
        <div class="res-score">${r.score[p]} – ${r.score[p === 0 ? 1 : 0]}</div>
        <div class="who">${esc(seatName(profiles, p))}${won ? ' 🏆' : ''}</div>
        <div class="res-night">${solo ? (botHalf ? 'Bot' : 'You vs the bot') : 'Match night'}: ${night.wins[p]} – ${night.wins[p === 0 ? 1 : 0]}</div>
        ${offer?.person === p ? `<button class="btn easier" id="easierBtn" data-v="${offer.to}" aria-label="Make the bot easier: ${level(offer.from)} to ${level(offer.to)}">🤖 Make the bot easier?</button>` : ''}
      </div></div>`;
    };
    const res = $('#result');
    res.innerHTML = `${half(1)}<div class="intro-mid">
        <button id="homeBtn" class="btn ghost">Games</button>
        <button id="rematchBtn" class="btn primary">Rematch</button>
      </div>${half(0)}`;
    this.show('result');
    $('#homeBtn', res).addEventListener('click', () => this.showHome());
    $('#rematchBtn', res).addEventListener('click', () => this.openGame(meta.id));
    const easier = res.querySelector<HTMLButtonElement>('#easierBtn');
    if (offer && easier) {
      easier.addEventListener('click', () => {
        this.store.setBotLevel(offer.bot, meta.id, offer.to);
        easier.textContent = `🤖 Bot is ${level(offer.to)} now ✓`;
        easier.removeAttribute('aria-label');
        easier.disabled = true;
        easier.classList.add('on');
        this.sfx.play('tap');
      });
    }
  }
}
