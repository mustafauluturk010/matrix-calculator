import { Platform } from 'react-native';
import mobileAds, { AdEventType, RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';

// Uygulama genelinde TEK bir yerden yönetilen Rewarded reklam servisi.
//
// Kural (soft gate):
//   reklam hazır  -> göster -> ödül kazanılırsa dışa aktar
//   reklam hazır değil / yüklenemedi / gösterilemedi -> reklamı atla, doğrudan dışa aktar
//
// Bu dosya hiçbir koşulda exception fırlatmaz; her AdMob çağrısı try/catch içindedir.
// Reklam dinleyicileri (listener) component'lerde değil burada tutulur ve her reklam
// yaşam döngüsü bittiğinde (loaded / error / closed / timeout) eksiksiz temizlenir.

export type AdPlacement = 'pdf' | 'latex';

export type ShowOutcome =
  | 'earned' // kullanıcı ödülü kazandı -> dışa aktarmaya devam et
  | 'dismissed' // reklam gösterildi ama ödül kazanılmadan kapatıldı -> dışa aktarma
  | 'unavailable' // reklam hazır değil / gösterilemedi / AdMob hatası -> doğrudan dışa aktar
  | 'busy'; // başka bir reklam zaten gösteriliyor -> bu isteği yok say

// Production Android Rewarded reklam birimleri (AdMob hesabındaki mevcut birimler).
// DEV ortamında (__DEV__) her zaman Google'ın test reklam birimi kullanılır.
const PROD_AD_UNIT_ID_ANDROID: Record<AdPlacement, string> = {
  pdf: 'ca-app-pub-6540289804187833/6087665654', // Matrix_PDF_Reward
  latex: 'ca-app-pub-6540289804187833/3262493088', // Pdf_reward
};

/** Bu yerleşim için kullanılacak reklam birimi; yoksa null (reklam atlanır, dışa aktarma çalışır). */
export function getAdUnitId(placement: AdPlacement): string | null {
  if (__DEV__) return TestIds.REWARDED;
  if (Platform.OS === 'android') return PROD_AD_UNIT_ID_ANDROID[placement];
  // iOS için henüz gerçek bir Rewarded reklam birimi tanımlı değil. Production'da Google'ın
  // test birimini kullanmak AdMob politikasına aykırı olduğundan reklam atlanır.
  return null;
}

const LOAD_TIMEOUT_MS = 15000; // yükleme bu sürede bitmezse reklam yok sayılır
const RELOAD_COOLDOWN_MS = 20000; // başarısız yüklemeden sonra art arda istek atma
const AD_EXPIRY_MS = 50 * 60 * 1000; // Rewarded reklamlar ~1 saat sonra geçersiz olur

type SlotStatus = 'idle' | 'loading' | 'ready' | 'showing';

interface Slot {
  status: SlotStatus;
  ad: RewardedAd | null;
  unsubs: Array<() => void>;
  loadTimer: ReturnType<typeof setTimeout> | null;
  loadedAt: number;
  lastAttemptAt: number;
}

const slots: Record<AdPlacement, Slot> = {
  pdf: newSlot(),
  latex: newSlot(),
};

let showLock = false; // aynı anda yalnızca tek reklam gösterilir
const pendingReloadTimers = new Set<ReturnType<typeof setTimeout>>();

function newSlot(): Slot {
  return { status: 'idle', ad: null, unsubs: [], loadTimer: null, loadedAt: 0, lastAttemptAt: 0 };
}

function safeUnsub(fn: unknown) {
  try {
    if (typeof fn === 'function') fn();
  } catch {
    // dinleyici zaten kaldırılmış olabilir
  }
}

function clearSlot(slot: Slot) {
  slot.unsubs.forEach(safeUnsub);
  slot.unsubs = [];
  if (slot.loadTimer) {
    clearTimeout(slot.loadTimer);
    slot.loadTimer = null;
  }
  slot.ad = null;
  slot.status = 'idle';
}

function addListener(slot: Slot, ad: RewardedAd, type: any, handler: (...args: any[]) => void) {
  const unsub = ad.addAdEventListener(type, handler);
  slot.unsubs.push(() => safeUnsub(unsub));
}

let initPromise: Promise<void> | null = null;

/** AdMob SDK'sını bir kez başlatır ve reklamları önceden yükler. Asla reject etmez. */
export function initRewardedAds(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await mobileAds().initialize();
      } catch {
        // SDK başlatılamasa bile uygulama ve dışa aktarma normal çalışır.
      }
      preloadRewardedAd('pdf', true);
      preloadRewardedAd('latex', true);
    })();
  }
  return initPromise;
}

/** Reklamı arka planda yükler. Zaten yükleniyor/hazır/gösteriliyorsa hiçbir şey yapmaz. */
export function preloadRewardedAd(placement: AdPlacement, force = false): void {
  try {
    const slot = slots[placement];
    if (slot.status !== 'idle') return;
    if (!force && Date.now() - slot.lastAttemptAt < RELOAD_COOLDOWN_MS) return;

    const adUnitId = getAdUnitId(placement);
    if (!adUnitId) return;

    slot.lastAttemptAt = Date.now();
    slot.status = 'loading';

    const ad = RewardedAd.createForAdRequest(adUnitId, { requestNonPersonalizedAdsOnly: false });
    slot.ad = ad;

    // Yükleme süresince yalnızca LOADED ve ERROR dinlenir; ikisinden biri gelince hepsi temizlenir.
    addListener(slot, ad, RewardedAdEventType.LOADED, () => {
      if (slot.ad !== ad) return;
      slot.unsubs.forEach(safeUnsub);
      slot.unsubs = [];
      if (slot.loadTimer) {
        clearTimeout(slot.loadTimer);
        slot.loadTimer = null;
      }
      slot.status = 'ready';
      slot.loadedAt = Date.now();
    });
    addListener(slot, ad, AdEventType.ERROR, () => {
      if (slot.ad !== ad) return;
      clearSlot(slot);
    });

    slot.loadTimer = setTimeout(() => {
      if (slot.ad === ad && slot.status === 'loading') clearSlot(slot);
    }, LOAD_TIMEOUT_MS);

    ad.load();
  } catch {
    clearSlot(slots[placement]);
  }
}

/** Reklam şu anda gösterilmeye hazır mı? (hazır değilse dışa aktarma doğrudan yapılmalı) */
export function isRewardedAdReady(placement: AdPlacement): boolean {
  const slot = slots[placement];
  if (slot.status !== 'ready' || !slot.ad || showLock) return false;
  if (Date.now() - slot.loadedAt > AD_EXPIRY_MS) {
    clearSlot(slot); // süresi dolmuş reklamı at; bir sonraki istek için yenisini yükle
    preloadRewardedAd(placement, true);
    return false;
  }
  return true;
}

/**
 * Hazır reklamı gösterir. Promise asla reject etmez; sonuç ShowOutcome olarak döner.
 * Reklam kapandığında ya da hata verdiğinde tüm dinleyiciler kaldırılır ve yeni reklam önceden yüklenir.
 */
export function showRewardedAd(placement: AdPlacement): Promise<ShowOutcome> {
  return new Promise<ShowOutcome>((resolve) => {
    if (showLock) {
      resolve('busy');
      return;
    }
    const slot = slots[placement];
    const ad = slot.ad;
    if (slot.status !== 'ready' || !ad) {
      resolve('unavailable');
      return;
    }

    showLock = true;
    slot.status = 'showing';

    let earned = false;
    let settled = false;
    const finish = (outcome: ShowOutcome) => {
      if (settled) return;
      settled = true;
      clearSlot(slot);
      showLock = false;
      // Bir sonraki dışa aktarma için yeni reklamı hazırla (yan etkisi olmayan, hata yutan çağrı).
      const timer = setTimeout(() => {
        pendingReloadTimers.delete(timer);
        preloadRewardedAd(placement, true);
      }, 0);
      pendingReloadTimers.add(timer);
      resolve(outcome);
    };

    try {
      addListener(slot, ad, RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      });
      addListener(slot, ad, AdEventType.CLOSED, () => finish(earned ? 'earned' : 'dismissed'));
      addListener(slot, ad, AdEventType.ERROR, () => finish(earned ? 'earned' : 'unavailable'));

      const maybePromise: any = ad.show();
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => finish(earned ? 'earned' : 'unavailable'));
      }
    } catch {
      finish(earned ? 'earned' : 'unavailable');
    }
  });
}

/** Yalnızca testler için: modül durumunu sıfırlar. */
export function __resetRewardedAdManagerForTests() {
  (Object.keys(slots) as AdPlacement[]).forEach((p) => {
    clearSlot(slots[p]);
    slots[p].lastAttemptAt = 0;
  });
  pendingReloadTimers.forEach(clearTimeout);
  pendingReloadTimers.clear();
  showLock = false;
  initPromise = null;
}
