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
import { demoHtml, isGesture, showsDemo } from './demo';
import { Runner } from './runner';
import { PLAYER_COLORS, Store } from './store';

export type GameMeta = (typeof gamesJson.games)[number];
export const META: GameMeta[] = gamesJson.games;
const POWERS = powersJson.games as Record<string, PowerDef[]>;

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class App {
  readonly store = new Store();
  readonly sfx = new Sfx();
  readonly stage: Stage;
  runner: Runner | null = null;
  private current: GameMeta | null = null;
  private picks: [PowerDef | null, PowerDef | null] = [null, null];
  /** Seed override from ?seed= (tests and the daily course). */
  private fixedSeed: number | null;
  private matchCount = 0;

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
    const { profiles, night, settings } = this.store.data;
    const played = night.games.length;
    $('#home').innerHTML = `
      <header class="brand">
        <h1 class="logo">Fami<span>Duel</span></h1>
        <p class="tag">Two players. One phone. Super powers.</p>
      </header>
      <section class="players">
        ${[0, 1].map((i) => this.playerChip(i as PlayerIndex)).join('<div class="vs">vs</div>')}
      </section>
      <section class="night" aria-label="Match night">
        <div class="night-score"><b style="color:${profiles[0].color}">${night.wins[0]}</b><span>Match night · ${played} game${played === 1 ? '' : 's'}</span><b style="color:${profiles[1].color}">${night.wins[1]}</b></div>
        ${played ? `<button id="newNightBtn" class="link">New night</button>` : ''}
      </section>
      <section class="grid" aria-label="Games">
        ${META.map((m) => this.card(m)).join('')}
      </section>
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
    return `<button class="player-chip" data-p="${p}" style="--c:${pr.color}"><span class="dot"></span><span class="pname">${esc(pr.name)}</span>${stars}${bot}</button>`;
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
    const modal = $('#modal');
    modal.classList.remove('hidden');
    modal.innerHTML = `<div class="sheet">
      <h2>Player ${p + 1}</h2>
      <label class="field">Name<input id="pName" maxlength="12" value="${esc(pr.name)}"/></label>
      <div class="field">Colour<div class="swatches">${PLAYER_COLORS.map((c) => `<button class="swatch${c === pr.color ? ' on' : ''}" data-c="${c}" style="--sw:${c}" aria-label="${c}"></button>`).join('')}</div></div>
      <div class="field">Head start <small>help for younger players</small>
        <div class="seg" id="pHead">${[0, 1, 2, 3].map((n) => `<button data-v="${n}" class="${n === pr.headStart ? 'on' : ''}">${n ? '★'.repeat(n) : 'None'}</button>`).join('')}</div></div>
      <div class="field">Who plays
        <div class="seg" id="pBot">${(['human', 'easy', 'normal', 'hard'] as const).map((v) => `<button data-v="${v}" class="${(pr.bot ?? 'human') === v ? 'on' : ''}">${v === 'human' ? '🙂 Person' : '🤖 ' + v}</button>`).join('')}</div></div>
      <button id="pDone" class="btn primary">Done</button>
    </div>`;
    let color = pr.color;
    let head = pr.headStart;
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
    seg('pBot', (v) => (bot = v === 'human' ? null : (v as BotLevel)));
    $('#pDone', modal).addEventListener('click', () => {
      pr.name = ($<HTMLInputElement>('#pName', modal).value.trim() || `Player ${p + 1}`).slice(0, 12);
      pr.color = color;
      pr.headStart = head;
      pr.bot = bot;
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
    const demo = isGesture(meta.gesture) && showsDemo(this.store.data.history, id) ? demoHtml(meta.gesture) : '';
    const half = (p: PlayerIndex) => {
      const pr = this.store.data.profiles[p];
      const assist = this.assistFor(p);
      return `<div class="half p${p}" style="--c:${pr.color}">
        <div class="half-inner">
          <div class="intro-head"><div class="intro-title">${meta.icon} ${meta.name}</div>${demo}</div>
          <p class="howto">${meta.howTo}</p>
          ${assist ? `<p class="assist">⚖️ Handicap help ${'★'.repeat(assist)}: ${meta.handicap.toLowerCase()}</p>` : ''}
          ${powers.length ? `<div class="powers">${powers.map((pw) => `<button class="power-card" data-p="${p}" data-id="${pw.id}"><span class="picon">${pw.icon}</span><b>${pw.name}</b><small>${pw.desc}</small></button>`).join('')}</div>` : ''}
          <button class="btn ready" id="ready${p}" data-p="${p}">${powers.length ? 'Pick a power' : 'Ready!'}</button>
          <div class="who">${esc(pr.name)}${pr.bot ? ' 🤖' : ''}</div>
        </div>
      </div>`;
    };
    intro.innerHTML = `${half(1)}<div class="intro-mid"><button id="introBack" class="link">← Back</button><span>${meta.blurb}</span></div>${half(0)}`;
    $('#introBack', intro).addEventListener('click', () => this.showHome());
    const refresh = () => {
      for (const p of [0, 1] as PlayerIndex[]) {
        const btn = $(`#ready${p}`, intro);
        btn.classList.toggle('on', ready[p]);
        btn.textContent = ready[p] ? 'Ready ✓' : powers.length && !this.picks[p] ? 'Pick a power' : 'Ready!';
        (btn as HTMLButtonElement).disabled = !!powers.length && !this.picks[p];
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
    for (const p of [0, 1] as PlayerIndex[]) {
      $(`#ready${p}`, intro).addEventListener('click', () => {
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
    const { profiles, night, settings } = this.store.data;
    return effectiveAssist([profiles[0].headStart, profiles[1].headStart], night.wins, settings.autoHandicap, p);
  }

  // ---------- Match ----------
  startMatch(): void {
    const meta = this.current;
    if (!meta || $('#intro').classList.contains('hidden')) return;
    const def = GAMES[meta.id];
    const players = ([0, 1] as PlayerIndex[]).map((p): PlayerInfo => {
      const pr = this.store.data.profiles[p];
      return { name: pr.name, color: pr.color, assist: this.assistFor(p), power: this.picks[p], bot: pr.bot };
    }) as [PlayerInfo, PlayerInfo];
    const seed = this.fixedSeed !== null ? (this.fixedSeed + this.matchCount++) >>> 0 : (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const powersOn = this.store.data.settings.powers && !!this.picks[0] && !!this.picks[1];
    this.show('play');
    this.runner = new Runner(this.stage, def, seed, players, powersOn, this.sfx, (r) => this.finish(r));
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
    modal.innerHTML = `<div class="sheet"><h2>Paused</h2>
      <button id="resumeBtn" class="btn primary">Resume</button>
      <button id="restartBtn" class="btn">Restart</button>
      <button id="quitBtn" class="btn ghost">Quit to games</button></div>`;
    const close = () => modal.classList.add('hidden');
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

  /** Restart from the pause menu: same picks, new seed. */
  private startMatch2(): void {
    this.show('intro');
    this.startMatch();
  }

  private finish(r: GameResult): void {
    const meta = this.current!;
    this.store.record(meta.id, r, [this.picks[0]?.id ?? null, this.picks[1]?.id ?? null]);
    this.stage.stop();
    this.sfx.play('win');
    const { profiles, night } = this.store.data;
    const half = (p: PlayerIndex) => {
      const won = r.winner === p;
      const draw = r.winner === null;
      const title = draw ? 'Draw!' : won ? 'You win!' : 'So close!';
      return `<div class="half p${p} ${won ? 'won' : ''}" style="--c:${profiles[p].color}"><div class="half-inner">
        <div class="res-title">${title}</div>
        <div class="res-score">${r.score[p]} – ${r.score[p === 0 ? 1 : 0]}</div>
        <div class="who">${esc(profiles[p].name)}${won ? ' 🏆' : ''}</div>
        <div class="res-night">Match night: ${night.wins[p]} – ${night.wins[p === 0 ? 1 : 0]}</div>
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
  }
}
