// Fits the W × H world into the canvas (letterboxed), turns DOM pointer and
// key events into world-space Input, and runs a fixed-step loop.
import { COLORS, type G } from './draw';
import { Input } from './input';
import { H, W } from './world';

export const STEP = 1 / 60;

export class Stage {
  readonly g: G;
  readonly input = new Input();
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private acc = 0;
  /** Called every fixed step and every frame. Set by the runner. */
  onStep: ((dt: number) => void) | null = null;
  onRender: ((g: G) => void) | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    const pos = (e: PointerEvent) => this.toWorld(e.clientX, e.clientY);
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic pointers (tests) have no capture target.
      }
      const p = pos(e);
      this.input.down(e.pointerId, p.x, p.y);
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e);
      this.input.move(e.pointerId, p.x, p.y);
    });
    const up = (e: PointerEvent) => this.input.up(e.pointerId);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (!this.raf) return;
      if (!this.input.keys.has(e.code)) this.input.keysPressed.add(e.code);
      this.input.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.input.keys.delete(e.code));
    window.addEventListener('blur', () => this.input.keys.clear());
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.scale = Math.min(rect.width / W, rect.height / H);
    this.ox = (rect.width - W * this.scale) / 2;
    this.oy = (rect.height - H * this.scale) / 2;
  }

  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left - this.ox) / this.scale, y: (clientY - rect.top - this.oy) / this.scale };
  }

  start(): void {
    this.stop();
    this.input.reset();
    this.resize();
    this.last = performance.now();
    this.acc = 0;
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      this.acc += Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      while (this.acc >= STEP) {
        this.step();
        this.acc -= STEP;
      }
      this.draw();
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  get running(): boolean {
    return this.raf !== 0;
  }

  step(): void {
    this.onStep?.(STEP);
    this.input.endFrame();
  }

  draw(): void {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b0918';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.scale * this.dpr;
    g.setTransform(s, 0, 0, s, this.ox * this.dpr, this.oy * this.dpr);
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, W, H);
    this.onRender?.(g);
    g.restore();
  }
}
