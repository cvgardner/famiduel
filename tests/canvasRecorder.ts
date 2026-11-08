import type { G } from '../src/engine/draw';

type M = { a: number; b: number; c: number; d: number; e: number; f: number };

/** A canvas that follows transforms and records where words land (anything else is a no-op). */
export function recorder() {
  let m: M = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack: M[] = [];
  const words: { str: string; x: number; y: number; upright: boolean; color: unknown }[] = [];
  const mul = (n: M) => {
    m = { a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b, c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d, e: m.a * n.e + m.c * n.f + m.e, f: m.b * n.e + m.d * n.f + m.f };
  };
  const noop = () => {};
  const base: Record<string, unknown> = {
    globalAlpha: 1,
    save: () => stack.push({ ...m }),
    restore: () => (m = stack.pop() ?? m),
    translate: (x: number, y: number) => mul({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }),
    rotate: (t: number) => mul({ a: Math.cos(t), b: Math.sin(t), c: -Math.sin(t), d: Math.cos(t), e: 0, f: 0 }),
    scale: (x: number, y: number) => mul({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 }),
    getTransform: () => ({ ...m }),
    measureText: (s: string) => ({ width: s.length * 10 }),
    fillText: (str: string, x: number, y: number) => words.push({ str, x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, upright: m.a > 0, color: base.fillStyle }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  };
  const g = new Proxy(base, {
    get: (t, k: string) => (k in t ? t[k] : noop),
    set: (t, k: string, v) => ((t[k] = v), true),
  });
  return { g: g as unknown as G, words };
}

