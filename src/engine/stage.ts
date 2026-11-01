// Fits the W × H world into the canvas (letterboxed), turns DOM pointer and
// key events into world-space Input, and runs a fixed-step loop.
import { COLORS, type G } from './draw';
import { Input } from './input';
import { currentTurn, unturn } from './portrait';
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
    // Layout size, not the bounding box: the app may be counter-rotated (portrait.ts).
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.max(1, Math.round(cw * this.dpr));
    this.canvas.height = Math.max(1, Math.round(ch * this.dpr));
    this.scale = Math.min(cw / W, ch / H);
    this.ox = (cw - W * this.scale) / 2;
    this.oy = (ch - H * this.scale) / 2;
  }

  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const l = unturn(currentTurn(), clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2));
    const x = l.x + this.canvas.clientWidth / 2;
    const y = l.y + this.canvas.clientHeight / 2;
    return { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale };
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
    this.fillBars();
  }

  /**
   * Tall (or wide) phones leave bars around the fixed world. Instead of black,
   * stretch the world's own edge pixels out to the screen edge, so each game's
   * table seems to run off the phone, then fade them a little so the play area
   * still reads as the play area.
   */
  private fillBars(): void {
    const g = this.g;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const x0 = Math.ceil(this.ox * this.dpr);
    const y0 = Math.ceil(this.oy * this.dpr);
    const x1 = Math.floor((this.ox + W * this.scale) * this.dpr);
    const y1 = Math.floor((this.oy + H * this.scale) * this.dpr);
    const top = y0 >= 2;
    const side = x0 >= 2;
    if ((!top && !side) || x1 - x0 < 4 || y1 - y0 < 4) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const bw = x1 - x0;
    if (top) {
      this.bar([x0, y0 + 1, bw, 1], [x0, 0, bw, y0], [0, y0, 0, 0]);
      this.bar([x0, y1 - 2, bw, 1], [x0, y1, bw, ch - y1], [0, y1, 0, ch]);
    }
    if (side) {
      this.bar([x0 + 1, 0, 1, ch], [0, 0, x0, ch], [x0, 0, 0, 0]);
      this.bar([x1 - 2, 0, 1, ch], [x1, 0, cw - x1, ch], [x1, 0, cw, 0]);
    }
  }

  /**
   * Stretches one edge strip of the canvas (`src`, device px) over a bar
   * (`dst`), then darkens it along `fade` (x0, y0 → x1, y1): 15% at the
   * world's edge, 55% at the screen edge.
   */
  private bar(src: number[], dst: number[], fade: number[]): void {
    const g = this.g;
    const [sx, sy, sw, sh] = src;
    const [dx, dy, dw, dh] = dst;
    g.save();
    g.beginPath();
    g.rect(dx, dy, dw, dh);
    g.clip();
    g.imageSmoothingEnabled = false;
    // Soften whatever touches the edge (a power button's shadow, a goal post)
    // into a glow instead of a hard streak. Browsers without canvas filters
    // get the sharp version. Overdraw by the blur radius so the blur has no
    // see-through rim; the clip keeps it inside the bar.
    const r = 'filter' in g ? Math.round(10 * this.dpr) : 0;
    if (r) g.filter = `blur(${r}px)`;
    g.drawImage(this.canvas, sx, sy, sw, sh, dx - r, dy - r, dw + 2 * r, dh + 2 * r);
    g.filter = 'none';
    const grad = g.createLinearGradient(fade[0], fade[1], fade[2], fade[3]);
    grad.addColorStop(0, 'rgba(11,9,24,0.15)');
    grad.addColorStop(1, 'rgba(11,9,24,0.55)');
    g.fillStyle = grad;
    g.fillRect(dx, dy, dw, dh);
    g.restore();
  }
}
