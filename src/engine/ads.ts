// Fair ads and the "Remove ads" purchase, for the store build only. A browser gets no ads
// and no purchase row: `makeMoney()` returns null there. `?fakeads` in a browser swaps in
// a stand-in ad (a grey sheet with a close button) and a purchase that always succeeds, so
// e2e tests and a person at a desk can walk the whole flow without a phone.
//
// AdMob settings, chosen for a family app (docs/ads.md):
// - every request is tagged child-directed and under the age of consent, and asks for
//   non-personalized ads rated General (G). No tracking, so no App Tracking Transparency
//   prompt and no IDFA.
// - interstitials only; `core/adpolicy.ts` decides when.
import { AdMob, InterstitialAdPluginEvents, MaxAdContentRating } from '@capacitor-community/admob';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { isNativeApp } from './native';

/**
 * Ad unit and product IDs. The defaults are Google's public TEST interstitial (always fills,
 * labelled "Test Ad") until Chris's AdMob account gives the real one; `scripts/ios-set-ads.sh`
 * writes the real IDs into `.env.production` (Vite reads VITE_*).
 */
export const GOOGLE_TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910';
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const AD_UNIT_IOS = env.VITE_ADMOB_INTERSTITIAL_IOS || GOOGLE_TEST_INTERSTITIAL_IOS;
/** The App Store Connect non-consumable product. Create it with exactly this ID. */
export const REMOVE_ADS_ID = 'famiduel.removeads';

/** What the app needs from an ad network. */
export interface AdBackend {
  /** Load the next ad in the background. Never throws. */
  preload(): void;
  /** True when an ad is loaded and can show at once (nobody ever waits for one). */
  ready(): boolean;
  /** Show the loaded ad; resolves when it closes (or failed to show). */
  show(): Promise<void>;
}

/** What the app needs from the store. */
export interface PurchaseBackend {
  /** The local price, e.g. "$4.99", or null if the store didn't answer. */
  price(): Promise<string | null>;
  /** Buy "Remove ads". True when the phone now owns it. */
  buy(): Promise<boolean>;
  /** Ask the store again (the Restore button). True when owned. */
  restore(): Promise<boolean>;
  /** Owned according to the store right now, or null when it couldn't be asked (offline). */
  owned(): Promise<boolean | null>;
}

export type Money = { ads: AdBackend; purchases: PurchaseBackend; fake: boolean };

/** The store build's backends, the `?fakeads` stand-ins, or null in a plain browser. */
export function makeMoney(search = typeof location !== 'undefined' ? location.search : ''): Money | null {
  if (new URLSearchParams(search).has('fakeads')) return { ads: new FakeAds(), purchases: new FakePurchases(), fake: true };
  if (!isNativeApp()) return null;
  return { ads: new AdMobAds(), purchases: new StorePurchases(), fake: false };
}

// ---------- AdMob ----------

class AdMobAds implements AdBackend {
  private started: Promise<void> | null = null;
  private loaded = false;
  private loading = false;

  private start(): Promise<void> {
    this.started ??= AdMob.initialize({
      tagForChildDirectedTreatment: true,
      tagForUnderAgeOfConsent: true,
      maxAdContentRating: MaxAdContentRating.General,
    }).catch(() => undefined);
    return this.started;
  }

  preload(): void {
    if (this.loaded || this.loading) return;
    this.loading = true;
    this.start()
      .then(() => AdMob.prepareInterstitial({ adId: AD_UNIT_IOS, isTesting: AD_UNIT_IOS === GOOGLE_TEST_INTERSTITIAL_IOS, npa: true }))
      .then(() => (this.loaded = true))
      .catch(() => (this.loaded = false))
      .finally(() => (this.loading = false));
  }

  ready(): boolean {
    return this.loaded;
  }

  async show(): Promise<void> {
    if (!this.loaded) return;
    this.loaded = false;
    await new Promise<void>((resolve) => {
      let done = false;
      const handles: Promise<{ remove: () => Promise<void> }>[] = [];
      const finish = () => {
        if (done) return;
        done = true;
        for (const h of handles) h.then((x) => x.remove()).catch(() => undefined);
        resolve();
      };
      handles.push(AdMob.addListener(InterstitialAdPluginEvents.Dismissed, finish));
      handles.push(AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, finish));
      AdMob.showInterstitial().catch(finish);
    });
    this.preload();
  }
}

// ---------- StoreKit ----------

class StorePurchases implements PurchaseBackend {
  async price(): Promise<string | null> {
    try {
      const { products } = await NativePurchases.getProducts({ productIdentifiers: [REMOVE_ADS_ID], productType: PURCHASE_TYPE.INAPP });
      return products[0]?.priceString ?? null;
    } catch {
      return null;
    }
  }

  async buy(): Promise<boolean> {
    try {
      await NativePurchases.purchaseProduct({ productIdentifier: REMOVE_ADS_ID, productType: PURCHASE_TYPE.INAPP });
    } catch {
      // Cancelled, Ask to Buy pending, or a store error: check what the phone owns anyway.
    }
    return (await this.owned()) === true;
  }

  async restore(): Promise<boolean> {
    try {
      await NativePurchases.restorePurchases();
    } catch {
      // Fall through to what the phone owns.
    }
    return (await this.owned()) === true;
  }

  async owned(): Promise<boolean | null> {
    try {
      const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP, onlyCurrentEntitlements: true });
      return purchases.some((p) => p.productIdentifier === REMOVE_ADS_ID && !p.revocationDate);
    } catch {
      return null;
    }
  }
}

// ---------- ?fakeads stand-ins (browser tests) ----------

/** A grey full-screen sheet with a close button, shown like an interstitial. */
export class FakeAds implements AdBackend {
  shown = 0;
  preload(): void {}
  ready(): boolean {
    return true;
  }
  show(): Promise<void> {
    this.shown++;
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.id = 'fakeAd';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Test ad');
      el.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#444;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font:20px sans-serif';
      el.innerHTML = '<div>Test ad</div><button id="fakeAdClose" style="font:18px sans-serif;padding:10px 18px">Close ✕</button>';
      document.body.appendChild(el);
      el.querySelector('#fakeAdClose')!.addEventListener('click', () => {
        el.remove();
        resolve();
      });
    });
  }
}

export class FakePurchases implements PurchaseBackend {
  private has = false;
  async price(): Promise<string | null> {
    return '$4.99';
  }
  async buy(): Promise<boolean> {
    this.has = true;
    return true;
  }
  async restore(): Promise<boolean> {
    return this.has;
  }
  async owned(): Promise<boolean | null> {
    return null;
  }
}
