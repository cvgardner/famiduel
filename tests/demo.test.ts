import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import games from '../content/games.json';
import { besideCountdown, DEMO_MATCHES, demoHelpHtml, demoHtml, firstMatchOf, GESTURES, HelpMemory, howToHalfHtml, isGesture, PLAY_DEMO_MS, PLAY_DEMO_OUT, PLAY_DEMO_OUT_KEEPER, playDemoHtml, playDemoOut, powerStatus, showsDemo } from '../src/app/demo';

describe('ghost finger demo', () => {
  it('every game names a known gesture', () => {
    for (const g of games.games) expect(isGesture((g as { gesture?: string }).gesture), g.id).toBe(true);
    expect(isGesture('wiggle')).toBe(false);
  });

  it('shows for the first matches of a game only, counted per game', () => {
    const rec = (game: string) => ({ game });
    const some = Array.from({ length: DEMO_MATCHES - 1 }, () => rec('sumo'));
    expect(showsDemo([], 'sumo')).toBe(true);
    expect(showsDemo(some, 'sumo')).toBe(true);
    expect(showsDemo([...some, rec('sumo')], 'sumo')).toBe(false);
    expect(showsDemo([...some, rec('sumo')], 'minigolf')).toBe(true);
  });

  it('shows the in-play finger at a game\'s very first match only, per game', () => {
    expect(firstMatchOf([], 'pingpong')).toBe(true);
    expect(firstMatchOf([{ game: 'sumo' }], 'pingpong')).toBe(true);
    expect(firstMatchOf([{ game: 'pingpong' }], 'pingpong')).toBe(false);
    const html = playDemoHtml('slide', 1, false, 0.9);
    expect(html).toContain('class="play-demo p1"');
    expect(html).toContain('data-p="1"');
    expect(html).toContain('--at:0.9');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('g-slide');
    expect(playDemoHtml('drag', 0)).toContain('--at:0.72');
    // F138: Penalty's keeper-first seat starts the loop on the dive.
    expect(playDemoHtml('kick', 0, false, 0.72, true)).toContain('class="play-demo p0 keeper"');
    expect(playDemoHtml('kick', 1)).toContain('class="play-demo p1"');
  });

  it('F152: a finger card at the countdown digit\'s height moves beside it', () => {
    expect(besideCountdown(0.72)).toBe(true);
    expect(besideCountdown(0.9)).toBe(false);
    expect(playDemoHtml('hold', 0)).toContain('--dx:28%');
    expect(playDemoHtml('slide', 1, false, 0.9)).not.toContain('--dx');
  });

  it('a game\'s demoAt keeps the in-play finger on the screen', () => {
    for (const g of games.games) {
      const at = (g as { demoAt?: number }).demoAt;
      if (at !== undefined) expect(at > 0.5 && at < 0.95, g.id).toBe(true);
    }
  });

  it('renders a finger for every gesture, hidden from screen readers', () => {
    for (const g of GESTURES) {
      const html = demoHtml(g);
      expect(html).toContain(`g-${g}`);
      expect(html).toContain('class="f"');
      expect(html).toContain('aria-hidden="true"');
    }
  });

  it('Penalty shows both roles: the shooter swipes the ball, then the keeper taps a dive button', () => {
    expect((games.games.find((g) => g.id === 'penalty') as { gesture?: string }).gesture).toBe('kick');
    const html = demoHtml('kick');
    expect(html).toContain('class="p"');
    expect(html).toContain('class="cell"');
  });

  it('mirrors only the stick for a left-handed player', () => {
    expect(demoHtml('stick', true)).toContain('class="demo lefty g-stick"');
    expect(demoHtml('tap', true)).not.toContain('lefty');
    expect(demoHtml('stick')).not.toContain('lefty');
  });

  it('the "?" that brings the finger back is a labelled button for its seat', () => {
    const html = demoHelpHtml(1);
    expect(html).toMatch(/^<button class="demo-help"/);
    expect(html).toContain('data-p="1"');
    expect(html).toContain('aria-label="Show me how to play"');
  });

  it('remembers a "?" tap for that game, seat and person until a match is played', () => {
    const m = new HelpMemory();
    expect(m.wants('sumo', 0, 'Mia')).toBe(false);
    m.mark('sumo', 0, 'Mia');
    expect(m.wants('sumo', 0, 'Mia')).toBe(true);
    // Only that game, that seat, that person.
    expect(m.wants('minigolf', 0, 'Mia')).toBe(false);
    expect(m.wants('sumo', 1, 'Mia')).toBe(false);
    expect(m.wants('sumo', 0, 'Dad')).toBe(false);
    // Still wanted until a match of it is finished (backing out of the intro keeps it).
    expect(m.wants('sumo', 0, 'Mia')).toBe(true);
    m.played('sumo', 0, 'Mia');
    expect(m.wants('sumo', 0, 'Mia')).toBe(false);
    // Tapping "?" again brings it back again.
    m.mark('sumo', 0, 'Mia');
    expect(m.wants('sumo', 0, 'Mia')).toBe(true);
  });
});

describe('how to play, from the pause menu', () => {
  const tanks = games.games.find((g) => g.id === 'tanks')!;
  const person = { p: 0, name: 'Mia', color: '#3fa9ff', bot: false };

  it("shows a person the finger, the how-to line and their power, in their seat's half", () => {
    const power = { icon: '⚡', name: 'Turbo', desc: 'Drive twice as fast for 3 s.' };
    const html = howToHalfHtml({ ...person, p: 1, power }, tanks);
    expect(html).toContain('class="half p1"');
    expect(html).toContain('data-gesture="stick"');
    expect(html).toContain(tanks.howTo);
    expect(html).toContain('Your power: Turbo');
    expect(html).toContain(power.desc);
  });

  it('mirrors the stick finger for a left-handed seat, and leaves out a power not picked', () => {
    const html = howToHalfHtml({ ...person, lefty: true, power: null }, tanks);
    expect(html).toContain('demo lefty g-stick');
    expect(html).not.toContain('my-power');
  });

  it("gives a bot's half no finger and no how-to", () => {
    const html = howToHalfHtml({ ...person, bot: true }, tanks);
    expect(html).toContain('half p0 bot');
    expect(html).not.toContain('class="demo');
    expect(html).not.toContain(tanks.howTo);
  });

  it("shows how full the picked power's meter is, or that it is ready or on", () => {
    const power = { icon: '⚡', name: 'Turbo', desc: 'Drive twice as fast for 3 s.' };
    const at = (value: number, active = 0) => howToHalfHtml({ ...person, power, charge: { value, active } }, tanks);
    expect(at(0.6)).toContain('Charging: 60%');
    expect(at(0.6)).toContain('width:60%');
    expect(at(0)).toContain('Charging: 0%');
    expect(at(0.999)).toContain('Charging: 99%');
    expect(at(1)).toContain('charge ready');
    expect(at(1)).toContain('Ready! Tap your power button');
    expect(at(0, 2)).toContain('On now!');
    // No meter when the shell has none to show (classic mode, or no power picked).
    expect(howToHalfHtml({ ...person, power }, tanks)).not.toContain('class="charge');
    expect(powerStatus({ value: 0.25, active: 0 }).cls).toBe('charging');
  });

  it('escapes the player name', () => {
    expect(howToHalfHtml({ ...person, name: '<b>Al' }, tanks)).toContain('&#60;b&#62;Al');
  });

  it('has a finger for every game', () => {
    for (const g of games.games) expect(howToHalfHtml(person, g), g.id).toContain('class="demo');
  });
});

describe('energyOf (the meter the pause help reads)', () => {
  it("finds a game's power meter through its view, and nothing for a game without one", async () => {
    const { energyOf } = await import('../src/engine/game');
    const { Energy } = await import('../src/core/energy');
    const e = new Energy(0);
    e.charge(0.4);
    const withMeter = { update() {}, render() {}, game: { energy: [new Energy(0), e] } };
    expect(energyOf(withMeter, 1)?.value).toBeCloseTo(0.4);
    expect(energyOf({ update() {}, render() {}, game: {} }, 0)).toBeNull();
    expect(energyOf({ update() {}, render() {} }, 0)).toBeNull();
  });
});

describe('F214: the in-play finger card fades out with its finger', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  /** [last time the finger is fully shown, time it is gone] in its first loop, from the CSS. */
  const fingerOut = (g: string, loop: number, from = 0): [number, number] => {
    const m = css.match(new RegExp(`@keyframes d-${g}-f \\{(.*)\\}\\s*$`, 'm'));
    expect(m, `d-${g}-f keyframes`).toBeTruthy();
    const stops: { t: number; o: number }[] = [];
    for (const k of m![1].matchAll(/((?:\d+%(?:,\s*)?)+)\s*\{([^}]*)\}/g)) {
      const o = k[2].match(/opacity:\s*([\d.]+)/);
      if (!o) continue;
      for (const pct of k[1].split(',')) stops.push({ t: (parseFloat(pct) / 100) * loop, o: Number(o[1]) });
    }
    stops.sort((a, b) => a.t - b.t);
    let shown = -1;
    for (const s of stops) {
      if (s.t < from) continue;
      if (s.o >= 1) shown = s.t;
      else if (s.o === 0 && shown >= 0) return [round(shown - from), round(s.t - from)];
    }
    throw new Error(`${g}: the finger never fades`);
  };
  const round = (x: number) => Math.round(x * 100) / 100;

  it('each gesture\'s card fade matches its finger\'s fade in style.css', () => {
    for (const g of GESTURES) {
      if (g === 'kick') continue;
      expect(PLAY_DEMO_OUT[g], g).toEqual(fingerOut(g, 2.6));
    }
    expect(PLAY_DEMO_OUT.kick, 'penalty shooter').toEqual(fingerOut('kick', 5.2));
    expect(PLAY_DEMO_OUT_KEEPER, 'penalty keeper').toEqual(fingerOut('kick', 5.2, 2.6));
  });

  it('the card is gone before PLAY_DEMO_MS removes it, and shows through the countdown start', () => {
    for (const g of GESTURES) {
      for (const keeper of [false, true]) {
        const [out, gone] = playDemoOut(g, keeper);
        expect(gone * 1000, g).toBeLessThanOrEqual(PLAY_DEMO_MS);
        expect(out, g).toBeGreaterThan(0.8);
        const html = playDemoHtml(g, 0, false, 0.72, keeper);
        expect(html).toContain(`--out:${out}s`);
        expect(html).toContain(`--fade:${round(gone - out)}s`);
      }
    }
  });

  it('the card\'s CSS uses those times, not a fixed 2.8 s fade', () => {
    const rule = css.match(/\.play-demo \{[^}]*\}/)![0];
    expect(rule).toContain('var(--out');
    expect(rule).toContain('var(--fade');
  });
});
