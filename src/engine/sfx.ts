// Tiny synthesized sound effects (WebAudio oscillators), so there are no audio
// files. Silent until the first user gesture unlocks audio.
export type SoundName =
  | 'tap' | 'hit' | 'bounce' | 'score' | 'win' | 'power' | 'count' | 'go'
  | 'whoosh' | 'chop' | 'splash' | 'buzz' | 'pop' | 'coin' | 'thud' | 'click';

type Note = { f: number; f2?: number; t: number; type?: OscillatorType; vol?: number; delay?: number; noise?: boolean };

const SOUNDS: Record<SoundName, Note[]> = {
  tap: [{ f: 660, t: 0.05, type: 'square', vol: 0.12 }],
  click: [{ f: 900, t: 0.03, type: 'square', vol: 0.08 }],
  hit: [{ f: 320, f2: 180, t: 0.08, type: 'square', vol: 0.18 }],
  bounce: [{ f: 220, f2: 160, t: 0.06, type: 'triangle', vol: 0.18 }],
  thud: [{ f: 120, f2: 60, t: 0.14, type: 'sine', vol: 0.35 }],
  score: [{ f: 523, t: 0.09, type: 'square', vol: 0.14 }, { f: 784, t: 0.16, type: 'square', vol: 0.14, delay: 0.09 }],
  win: [523, 659, 784, 1047].map((f, i) => ({ f, t: 0.18, type: 'square' as OscillatorType, vol: 0.14, delay: i * 0.12 })),
  power: [{ f: 200, f2: 1200, t: 0.35, type: 'sawtooth', vol: 0.12 }],
  count: [{ f: 440, t: 0.12, type: 'sine', vol: 0.2 }],
  go: [{ f: 880, t: 0.25, type: 'sine', vol: 0.22 }],
  whoosh: [{ f: 800, f2: 200, t: 0.2, noise: true, vol: 0.15 }],
  chop: [{ f: 300, f2: 90, t: 0.07, noise: true, vol: 0.25 }],
  splash: [{ f: 600, f2: 100, t: 0.4, noise: true, vol: 0.18 }],
  buzz: [{ f: 110, t: 0.25, type: 'sawtooth', vol: 0.14 }],
  pop: [{ f: 500, f2: 900, t: 0.06, type: 'sine', vol: 0.2 }],
  coin: [{ f: 988, t: 0.06, type: 'square', vol: 0.12 }, { f: 1319, t: 0.14, type: 'square', vol: 0.12, delay: 0.06 }],
};

export class Sfx {
  muted = false;
  private ac: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;

  /** Call from a user gesture (first tap) so browsers allow audio. */
  unlock(): void {
    if (this.ac || typeof window === 'undefined' || !('AudioContext' in window)) return;
    try {
      this.ac = new AudioContext();
      const len = this.ac.sampleRate * 0.5;
      this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ac = null;
    }
  }

  play(name: SoundName): void {
    const ac = this.ac;
    if (!ac || this.muted) return;
    const now = ac.currentTime;
    for (const n of SOUNDS[name]) {
      const start = now + (n.delay ?? 0);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(n.vol ?? 0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + n.t);
      gain.connect(ac.destination);
      if (n.noise && this.noiseBuf) {
        const src = ac.createBufferSource();
        src.buffer = this.noiseBuf;
        const filter = ac.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(n.f, start);
        if (n.f2) filter.frequency.exponentialRampToValueAtTime(n.f2, start + n.t);
        src.connect(filter).connect(gain);
        src.start(start);
        src.stop(start + n.t);
      } else {
        const osc = ac.createOscillator();
        osc.type = n.type ?? 'sine';
        osc.frequency.setValueAtTime(n.f, start);
        if (n.f2) osc.frequency.exponentialRampToValueAtTime(n.f2, start + n.t);
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + n.t + 0.02);
      }
    }
  }
}
