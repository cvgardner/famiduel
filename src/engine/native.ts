// The iOS store build wraps this same web build in Capacitor (capacitor.config.ts,
// ios/). Everything native goes through here, so the web build behaves exactly as
// before: every function is a no-op unless the page runs inside the app.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { App } from '@capacitor/app';
import type { Vibrate } from './haptics';

/** True inside the iOS (or a future Android) app, false in any browser. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** The kind of native buzz a vibration pattern from HAPTICS becomes. */
export type NativeFeel =
  | { kind: 'impact'; style: 'light' | 'medium' | 'heavy' }
  | { kind: 'notification'; type: 'success' | 'warning' };

/**
 * Pure rule. iPhones have no vibration *patterns*, only Taptic "feels", so each
 * pattern maps to the nearest one: short taps by length (hit/chop light, power and
 * wall thuds medium, splash and goals heavy), a long multi-pulse pattern (the win)
 * to "success", a short multi-pulse one (the "can't do that" double tick) to "warning".
 */
export function feelFor(pattern: number | number[]): NativeFeel {
  if (Array.isArray(pattern)) {
    const total = pattern.reduce((a, b) => a + b, 0);
    return { kind: 'notification', type: total >= 200 ? 'success' : 'warning' };
  }
  if (pattern <= 20) return { kind: 'impact', style: 'light' };
  if (pattern <= 30) return { kind: 'impact', style: 'medium' };
  return { kind: 'impact', style: 'heavy' };
}

const IMPACT = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy } as const;
const NOTE = { success: NotificationType.Success, warning: NotificationType.Warning } as const;

/** A `Vibrate` that plays Taptic feels, or null outside the app. */
export function nativeVibrate(): Vibrate | null {
  if (!isNativeApp()) return null;
  return (pattern) => {
    const f = feelFor(pattern);
    const done = f.kind === 'impact' ? Haptics.impact({ style: IMPACT[f.style] }) : Haptics.notification({ type: NOTE[f.type] });
    done.catch(() => undefined);
    return true;
  };
}

/**
 * Calls `onPause` when the app leaves the screen (home swipe, app switcher, a call).
 * The page's own visibilitychange pause covers browsers; inside a web view that event
 * can come late or not at all, so the native pause event is the one to trust.
 */
export function onAppPause(onPause: () => void): void {
  if (!isNativeApp()) return;
  App.addListener('pause', onPause).catch(() => undefined);
}
