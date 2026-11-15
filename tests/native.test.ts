import { describe, expect, it } from 'vitest';
import { HAPTICS } from '../src/engine/haptics';
import { feelFor, isNativeApp, nativeVibrate, onAppPause } from '../src/engine/native';
import type { SoundName } from '../src/engine/sfx';

describe('iOS app bridge (engine/native.ts)', () => {
  it('is off outside the app, so the web build is unchanged', () => {
    expect(isNativeApp()).toBe(false);
    expect(nativeVibrate()).toBeNull();
    let paused = 0;
    onAppPause(() => paused++);
    expect(paused).toBe(0);
  });

  it('maps every haptic pattern to the Taptic feel it should have', () => {
    const feel = (n: SoundName) => feelFor(HAPTICS[n]!);
    expect(feel('hit')).toEqual({ kind: 'impact', style: 'light' });
    expect(feel('chop')).toEqual({ kind: 'impact', style: 'light' });
    expect(feel('power')).toEqual({ kind: 'impact', style: 'medium' });
    expect(feel('thud')).toEqual({ kind: 'impact', style: 'medium' });
    expect(feel('splash')).toEqual({ kind: 'impact', style: 'heavy' });
    expect(feel('score')).toEqual({ kind: 'impact', style: 'heavy' });
    expect(feel('buzz')).toEqual({ kind: 'notification', type: 'warning' });
    expect(feel('win')).toEqual({ kind: 'notification', type: 'success' });
  });

  it('gives every sound that buzzes on Android a feel on iPhone', () => {
    for (const [name, p] of Object.entries(HAPTICS)) expect(feelFor(p!), name).toBeTruthy();
  });
});
