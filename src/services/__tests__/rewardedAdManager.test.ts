// Gerçek AdMob yerine olayları elle tetikleyebildiğimiz sahte RewardedAd kullanılır.
const mockInstances: any[] = [];
let mockCreateImpl: ((unit: string) => any) | null = null;

jest.mock('react-native-google-mobile-ads', () => {
  class FakeAd {
    unit: string;
    listeners: Record<string, Set<(...a: any[]) => void>> = {};
    load = jest.fn();
    show = jest.fn(() => Promise.resolve());
    constructor(unit: string) {
      this.unit = unit;
    }
    addAdEventListener(type: string, handler: (...a: any[]) => void) {
      (this.listeners[type] ??= new Set()).add(handler);
      return () => this.listeners[type].delete(handler);
    }
    emit(type: string, payload?: any) {
      [...(this.listeners[type] ?? [])].forEach((h) => h(payload));
    }
    listenerCount() {
      return Object.values(this.listeners).reduce((n, s) => n + s.size, 0);
    }
  }
  return {
    __esModule: true,
    default: () => ({ initialize: jest.fn(() => Promise.resolve()) }),
    AdEventType: { LOADED: 'loaded', ERROR: 'error', CLOSED: 'closed' },
    RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'rewarded_earned_reward' },
    TestIds: { REWARDED: 'TEST_REWARDED' },
    RewardedAd: {
      createForAdRequest: jest.fn((unit: string) => {
        if (mockCreateImpl) return mockCreateImpl(unit);
        const ad = new FakeAd(unit);
        mockInstances.push(ad);
        return ad;
      }),
    },
  };
});

import { Platform } from 'react-native';
import {
  __resetRewardedAdManagerForTests,
  getAdUnitId,
  initRewardedAds,
  isRewardedAdReady,
  preloadRewardedAd,
  showRewardedAd,
} from '../rewardedAdManager';

const latest = (unit?: string) => [...mockInstances].reverse().find((a) => !unit || a.unit === unit);
const loadAd = (placement: 'pdf' | 'latex') => {
  preloadRewardedAd(placement, true);
  const ad = latest();
  ad.emit('rewarded_loaded');
  return ad;
};

beforeEach(() => {
  jest.useRealTimers();
  mockInstances.length = 0;
  mockCreateImpl = null;
  (global as any).__DEV__ = true;
  __resetRewardedAdManagerForTests();
});

afterEach(() => {
  jest.useRealTimers();
  __resetRewardedAdManagerForTests(); // bekleyen yükleme zaman aşımı sayaçlarını temizler
});

describe('Reklam birimi seçimi', () => {
  test('DEV: her zaman Google test reklam birimi', () => {
    expect(getAdUnitId('pdf')).toBe('TEST_REWARDED');
    expect(getAdUnitId('latex')).toBe('TEST_REWARDED');
  });

  test('PRODUCTION Android: gerçek AdMob Rewarded birimleri', () => {
    (global as any).__DEV__ = false;
    const old = Platform.OS;
    (Platform as any).OS = 'android';
    expect(getAdUnitId('pdf')).toBe('ca-app-pub-6540289804187833/6087665654');
    expect(getAdUnitId('latex')).toBe('ca-app-pub-6540289804187833/3262493088');
    (Platform as any).OS = old;
  });

  test('PRODUCTION iOS: gerçek birim yok -> reklam atlanır (test birimi kullanılmaz)', () => {
    (global as any).__DEV__ = false;
    const old = Platform.OS;
    (Platform as any).OS = 'ios';
    expect(getAdUnitId('pdf')).toBeNull();
    preloadRewardedAd('pdf', true);
    expect(mockInstances).toHaveLength(0);
    expect(isRewardedAdReady('pdf')).toBe(false);
    (Platform as any).OS = old;
  });
});

describe('Yükleme', () => {
  test('initRewardedAds PDF ve LaTeX reklamlarını yükler ve tekrar çağrılınca çoğaltmaz', async () => {
    await initRewardedAds();
    await initRewardedAds();
    expect(mockInstances).toHaveLength(2);
    mockInstances.forEach((a) => expect(a.load).toHaveBeenCalledTimes(1));
  });

  test('yükleme sürerken tekrar preload yeni reklam OLUŞTURMAZ', () => {
    preloadRewardedAd('pdf', true);
    preloadRewardedAd('pdf', true);
    preloadRewardedAd('pdf');
    expect(mockInstances).toHaveLength(1);
  });

  test('LOADED -> hazır; yükleme dinleyicileri temizlenir', () => {
    const ad = loadAd('pdf');
    expect(isRewardedAdReady('pdf')).toBe(true);
    expect(ad.listenerCount()).toBe(0);
  });

  test('yükleme HATASI -> hazır değil, exception yok, dinleyiciler temizlenir', async () => {
    preloadRewardedAd('pdf', true);
    const ad = latest();
    expect(() => ad.emit('error', new Error('no-fill'))).not.toThrow();
    expect(isRewardedAdReady('pdf')).toBe(false);
    expect(ad.listenerCount()).toBe(0);
    await expect(showRewardedAd('pdf')).resolves.toBe('unavailable');
  });

  test('createForAdRequest exception fırlatırsa uygulama çökmez', () => {
    mockCreateImpl = () => {
      throw new Error('native module missing');
    };
    expect(() => preloadRewardedAd('pdf', true)).not.toThrow();
    expect(isRewardedAdReady('pdf')).toBe(false);
  });

  test('load() exception fırlatırsa uygulama çökmez', () => {
    mockCreateImpl = () => ({
      addAdEventListener: jest.fn(() => jest.fn()),
      load: jest.fn(() => {
        throw new Error('boom');
      }),
      show: jest.fn(),
    });
    expect(() => preloadRewardedAd('pdf', true)).not.toThrow();
    expect(isRewardedAdReady('pdf')).toBe(false);
  });

  test('yükleme asılı kalırsa zaman aşımı sonrası reklam yok sayılır ve yeniden denenebilir', () => {
    jest.useFakeTimers();
    preloadRewardedAd('pdf', true);
    const ad = latest();
    jest.advanceTimersByTime(15001);
    expect(isRewardedAdReady('pdf')).toBe(false);
    expect(ad.listenerCount()).toBe(0);
    preloadRewardedAd('pdf', true);
    expect(mockInstances).toHaveLength(2);
  });

  test('kütüphane addAdEventListener için unsubscribe döndürmese bile (undefined) çökmez', () => {
    mockCreateImpl = () => ({ addAdEventListener: jest.fn(), load: jest.fn(), show: jest.fn() });
    expect(() => {
      preloadRewardedAd('pdf', true);
      preloadRewardedAd('latex', true);
    }).not.toThrow();
  });

  test('süresi dolmuş (50 dk+) reklam hazır sayılmaz ve yenisi yüklenir', () => {
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now');
    spy.mockReturnValue(now);
    loadAd('pdf');
    spy.mockReturnValue(now + 51 * 60 * 1000);
    expect(isRewardedAdReady('pdf')).toBe(false);
    expect(mockInstances).toHaveLength(2);
    spy.mockRestore();
  });
});

describe('Gösterme', () => {
  test('hazır -> göster -> ödül + kapanış => earned; dinleyiciler temizlenir; yeni reklam yüklenir', async () => {
    jest.useFakeTimers();
    const ad = loadAd('pdf');
    const p = showRewardedAd('pdf');
    expect(ad.show).toHaveBeenCalledTimes(1);
    ad.emit('rewarded_earned_reward', { type: 'x', amount: 1 });
    ad.emit('closed');
    await expect(p).resolves.toBe('earned');
    expect(ad.listenerCount()).toBe(0);
    jest.runOnlyPendingTimers();
    expect(mockInstances).toHaveLength(2); // sonraki dışa aktarma için yeni reklam
  });

  test('ödül kazanılmadan kapatılırsa => dismissed', async () => {
    const ad = loadAd('pdf');
    const p = showRewardedAd('pdf');
    ad.emit('closed');
    await expect(p).resolves.toBe('dismissed');
    expect(ad.listenerCount()).toBe(0);
  });

  test('gösterme sırasında ERROR (ödül yok) => unavailable', async () => {
    const ad = loadAd('pdf');
    const p = showRewardedAd('pdf');
    ad.emit('error', new Error('show failed'));
    await expect(p).resolves.toBe('unavailable');
    expect(ad.listenerCount()).toBe(0);
  });

  test('ödül kazanıldıktan sonra ERROR gelirse yine earned', async () => {
    const ad = loadAd('pdf');
    const p = showRewardedAd('pdf');
    ad.emit('rewarded_earned_reward');
    ad.emit('error', new Error('late'));
    await expect(p).resolves.toBe('earned');
  });

  test('ad.show() senkron exception fırlatırsa => unavailable, kilit açılır', async () => {
    const ad = loadAd('pdf');
    ad.show.mockImplementation(() => {
      throw new Error('sync throw');
    });
    await expect(showRewardedAd('pdf')).resolves.toBe('unavailable');
    const ad2 = loadAd('latex');
    const p = showRewardedAd('latex');
    ad2.emit('closed');
    await expect(p).resolves.toBe('dismissed'); // kilit takılı kalmadı
  });

  test('ad.show() reject ederse (unhandled rejection olmadan) => unavailable', async () => {
    const ad = loadAd('pdf');
    ad.show.mockImplementation(() => Promise.reject(new Error('async reject')));
    await expect(showRewardedAd('pdf')).resolves.toBe('unavailable');
  });

  test('reklam hazır değilken show => unavailable (exception yok)', async () => {
    await expect(showRewardedAd('pdf')).resolves.toBe('unavailable');
  });

  test('aynı anda ikinci reklam AÇILMAZ (busy)', async () => {
    const pdfAd = loadAd('pdf');
    const latexAd = loadAd('latex');
    const first = showRewardedAd('pdf');
    expect(isRewardedAdReady('latex')).toBe(false);
    await expect(showRewardedAd('latex')).resolves.toBe('busy');
    expect(latexAd.show).not.toHaveBeenCalled();
    pdfAd.emit('rewarded_earned_reward');
    pdfAd.emit('closed');
    await expect(first).resolves.toBe('earned');
  });

  test('aynı reklam için ikinci show çağrısı busy döner, ad.show yalnızca bir kez çağrılır', async () => {
    const ad = loadAd('pdf');
    const first = showRewardedAd('pdf');
    await expect(showRewardedAd('pdf')).resolves.toBe('busy');
    expect(ad.show).toHaveBeenCalledTimes(1);
    ad.emit('closed');
    await first;
  });

  test('CLOSED ve ERROR birlikte gelse bile promise yalnızca bir kez çözülür', async () => {
    const ad = loadAd('pdf');
    const p = showRewardedAd('pdf');
    ad.emit('rewarded_earned_reward');
    ad.emit('closed');
    ad.emit('error', new Error('after close'));
    await expect(p).resolves.toBe('earned');
  });
});
