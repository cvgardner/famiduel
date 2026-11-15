import type { CapacitorConfig } from '@capacitor/cli';

// iOS store wrapper (Capacitor). The web build in dist/ is copied into ios/ by
// `npx cap sync ios`; see docs/release-checklist.md.
//
// CHRIS TO CONFIRM: appId is the App Store bundle ID. It is a placeholder until it
// matches the one you register in App Store Connect, and it can't change after the
// first upload. Change it here and in ios/App/App.xcodeproj (PRODUCT_BUNDLE_IDENTIFIER),
// or run scripts/ios-set-ids.sh.
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
};

export default config;
