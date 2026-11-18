import type { CapacitorConfig } from '@capacitor/cli';

// iOS store wrapper (Capacitor). The web build in dist/ is copied into ios/ by
// `npx cap sync ios`; see docs/release-checklist.md.
//
// appId is the App Store bundle ID (Chris confirmed com.gardenogames.famiduel, 18 Nov 2026).
// It can't change after the first upload. It also lives in ios/App/App.xcodeproj
// (PRODUCT_BUNDLE_IDENTIFIER); scripts/ios-set-ids.sh changes both.
const config: CapacitorConfig = {
  appId: 'com.gardenogames.famiduel',
  appName: 'FamiDuel',
  webDir: 'dist',
  // Same dark background as the app, so launch and rubber-band edges never flash white.
  backgroundColor: '#110e26',
  ios: {
    // The web view fills the whole screen; the game letterboxes itself and the menus
    // pad with env(safe-area-inset-*).
    contentInset: 'never',
    backgroundColor: '#110e26',
    // No pinch zoom, no link previews: this is a game board, not a page.
    allowsLinkPreview: false,
    scrollEnabled: false,
  },
  plugins: {
    // Hides the status bar and lets the home indicator fade out while nobody touches it
    // (Capacitor 8 owns prefersHomeIndicatorAutoHidden, so GameViewController can't).
    SystemBars: { hidden: true },
  },
};

export default config;
