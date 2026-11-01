import { describe, expect, it } from 'vitest';
import { text, type G } from '../src/engine/draw';
import { Button, PowerButton } from '../src/engine/widgets';
import { Energy } from '../src/core/energy';

/** A canvas stand-in that records the opacity every word is drawn at. */
function fakeCanvas(): { g: G; drawn: { str: string; alpha: number }[] } {
  const drawn: { str: string; alpha: number }[] = [];
  const stack: number[] = [];
  const g = {
    globalAlpha: 1,
    save(this: { globalAlpha: number }) { stack.push(this.globalAlpha); },
    restore(this: { globalAlpha: number }) { this.globalAlpha = stack.pop() ?? 1; },
    translate() {}, rotate() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, roundRect() {},
    strokeText() {},
    fillText(this: { globalAlpha: number }, str: string) { drawn.push({ str, alpha: this.globalAlpha }); },
    measureText: (s: string) => ({ width: s.length * 8 }),
  } as unknown as G;
  return { g, drawn };
}

describe('text opacity', () => {
  it('draws at full opacity by default', () => {
    const { g, drawn } = fakeCanvas();
    text(g, 'Ready', 0, 0);
    expect(drawn[0].alpha).toBe(1);
  });

  it("multiplies the caller's fade with its own alpha, and leaves the canvas as it was", () => {
    const { g, drawn } = fakeCanvas();
    g.globalAlpha = 0.4;
    text(g, 'Fading', 0, 0);
    text(g, 'Half of fading', 0, 0, { alpha: 0.5 });
    expect(drawn[0].alpha).toBeCloseTo(0.4);
    expect(drawn[1].alpha).toBeCloseTo(0.2);
    expect(g.globalAlpha).toBeCloseTo(0.4);
  });

  it('a disabled button draws its label dimmed', () => {
    const { g, drawn } = fakeCanvas();
    new Button(50, 50, 22, 0, 'GO').render(g, { disabled: true });
    expect(drawn.find((d) => d.str === 'GO')!.alpha).toBeCloseTo(0.35);
    expect(g.globalAlpha).toBe(1);
  });

  it("a power button keeps the caller's dimming (Penalty's unusable power)", () => {
    const power = { id: 'x', name: 'Test', icon: '⚡', desc: '' } as never;
    const charged = new Energy(0);
    charged.value = 1;
    const { g, drawn } = fakeCanvas();
    g.globalAlpha = 0.45;
    new PowerButton(50, 50, 0, power, '#4f8cff').render(g, charged, 0);
    expect(drawn[0].alpha).toBeCloseTo(0.45);
    expect(g.globalAlpha).toBeCloseTo(0.45);
  });
});
