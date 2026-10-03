// PDF ve LaTeX dışa aktarma için Rewarded reklam "soft gate" davranışının uçtan uca testi.
// Gerçek ResultDisplay + gerçek reklam yöneticisi; yalnızca AdMob kütüphanesi ve dosya yazan
// fonksiyonlar sahte.
const mockInstances: any[] = [];
let mockCreateImpl: ((unit: string) => any) | null = null;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(() => Promise.resolve(false)), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({}));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('@/utils/latexExport', () => ({
  ...jest.requireActual('@/utils/latexExport'),
  saveStepsLatex: jest.fn(() => Promise.resolve('saved')),
}));
jest.mock('@/utils/pdfExport', () => ({
  buildPlainTextSummary: jest.fn(() => 'summary'),
  buildHtmlReport: jest.fn(() => '<html/>'),
  openPdf: jest.fn(() => Promise.resolve()),
  sharePdf: jest.fn(() => Promise.resolve()),
  downloadPdf: jest.fn(() => Promise.resolve('saved')),
}));
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

import React from 'react';
import { Alert } from 'react-native';
const renderer: any = require('react-test-renderer');
const { act } = renderer;
import ResultDisplay from '../ResultDisplay';
import AdGateModal from '../AdGateModal';
import PdfOptionsModal from '../PdfOptionsModal';
import { lightTheme } from '@/theme/theme';
import { translations } from '@/i18n/translations';
import { saveStepsLatex } from '@/utils/latexExport';
import { downloadPdf } from '@/utils/pdfExport';
import { __resetRewardedAdManagerForTests, initRewardedAds } from '@/services/rewardedAdManager';

const result: any = {
  success: true,
  steps: [{ title: 'Adım 1', description: 'Açıklama' }],
  scalarResult: 5,
  latexResult: '5',
};

const latexLabel = translations.tr.saveStepsLatex;
const pressByLabel = async (tree: any, label: string) => {
  const node = tree.root.findAll((n: any) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  await act(async () => {
    node.props.onPress();
  });
};
const gate = (tree: any) => tree.root.findByType(AdGateModal);
const pdfModal = (tree: any) => tree.root.findByType(PdfOptionsModal);
const flush = () => act(async () => { await Promise.resolve(); });

let alertSpy: jest.SpyInstance;
let tree: any;

async function mount(adState: 'ready' | 'loadError' | 'neverLoads' | 'createThrows') {
  mockInstances.length = 0;
  mockCreateImpl = null;
  __resetRewardedAdManagerForTests();
  if (adState === 'createThrows') {
    mockCreateImpl = () => {
      throw new Error('native module missing');
    };
  }
  await initRewardedAds();
  if (adState === 'ready') mockInstances.forEach((a) => a.emit('rewarded_loaded'));
  if (adState === 'loadError') mockInstances.forEach((a) => a.emit('error', new Error('no-fill')));
  await act(async () => {
    tree = renderer.create(<ResultDisplay result={result} operationLabel="Determinant" theme={lightTheme} />);
  });
}
const adFor = (n: number) => mockInstances[n]; // 0: pdf, 1: latex

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  if (tree) act(() => tree.unmount());
  __resetRewardedAdManagerForTests();
  alertSpy.mockRestore();
});

describe('1) PDF: reklam hazır -> göster -> tamamla -> PDF', () => {
  test('onay kutusu açılır, reklam izlenince PDF seçenekleri açılır ve PDF oluşur', async () => {
    await mount('ready');
    await pressByLabel(tree, 'PDF');
    expect(gate(tree).props.visible).toBe(true);
    expect(pdfModal(tree).props.visible).toBe(false); // henüz izlemedi

    await act(async () => { gate(tree).props.onConfirm(); });
    expect(adFor(0).show).toHaveBeenCalledTimes(1);
    expect(pdfModal(tree).props.visible).toBe(false); // reklam sürerken yok

    await act(async () => {
      adFor(0).emit('rewarded_earned_reward');
      adFor(0).emit('closed');
    });
    expect(gate(tree).props.visible).toBe(false);
    expect(pdfModal(tree).props.visible).toBe(true);

    await act(async () => { await pdfModal(tree).props.onDownload(); });
    expect(downloadPdf).toHaveBeenCalledTimes(1);
  });

  test('reklam izlenmeden kapatılırsa PDF seçenekleri AÇILMAZ ve kullanıcı bilgilendirilir', async () => {
    await mount('ready');
    await pressByLabel(tree, 'PDF');
    await act(async () => { gate(tree).props.onConfirm(); });
    await act(async () => { adFor(0).emit('closed'); });
    expect(pdfModal(tree).props.visible).toBe(false);
    expect(alertSpy).toHaveBeenCalledWith(translations.tr.adNotCompletedTitle, translations.tr.adNotCompletedDesc);
    // Kilit açıldı ve tüketilen reklamın yerine yenisi yükleniyor; yeni reklam hazır olunca tekrar denenebilir
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    const fresh = mockInstances[mockInstances.length - 1];
    expect(fresh).not.toBe(adFor(0));
    await act(async () => { fresh.emit('rewarded_loaded'); });
    await pressByLabel(tree, 'PDF');
    expect(gate(tree).props.visible).toBe(true);
  });

  test('onay kutusunda "İptal" -> PDF açılmaz, tekrar denenebilir', async () => {
    await mount('ready');
    await pressByLabel(tree, 'PDF');
    await act(async () => { gate(tree).props.onDecline(); });
    expect(gate(tree).props.visible).toBe(false);
    expect(pdfModal(tree).props.visible).toBe(false);
    expect(adFor(0).show).not.toHaveBeenCalled();
    await pressByLabel(tree, 'PDF');
    expect(gate(tree).props.visible).toBe(true);
  });
});

describe('2) PDF: reklam yüklenemiyor -> PDF doğrudan', () => {
  test.each(['loadError', 'neverLoads', 'createThrows'] as const)('%s: reklam kutusu açılmaz, PDF seçenekleri hemen açılır', async (state) => {
    await mount(state);
    await pressByLabel(tree, 'PDF');
    expect(gate(tree).props.visible).toBe(false);
    expect(pdfModal(tree).props.visible).toBe(true);
    expect(alertSpy).not.toHaveBeenCalled();
    await act(async () => { await pdfModal(tree).props.onDownload(); });
    expect(downloadPdf).toHaveBeenCalledTimes(1);
  });

  test('reklam hazır görünüyor ama show() patlıyor -> kullanıcı beklemeden PDF açılır', async () => {
    await mount('ready');
    adFor(0).show.mockImplementation(() => { throw new Error('show crashed'); });
    await pressByLabel(tree, 'PDF');
    await act(async () => { gate(tree).props.onConfirm(); });
    expect(gate(tree).props.visible).toBe(false);
    expect(pdfModal(tree).props.visible).toBe(true);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test('gösterim sırasında AdMob ERROR -> PDF açılır', async () => {
    await mount('ready');
    await pressByLabel(tree, 'PDF');
    await act(async () => { gate(tree).props.onConfirm(); });
    await act(async () => { adFor(0).emit('error', new Error('internal')); });
    expect(pdfModal(tree).props.visible).toBe(true);
  });
});

describe('3) LaTeX: reklam hazır -> göster -> tamamla -> .tex kaydedilir', () => {
  test('reklam izlenince saveStepsLatex çağrılır (öncesinde çağrılmaz)', async () => {
    await mount('ready');
    await pressByLabel(tree, latexLabel);
    expect(gate(tree).props.visible).toBe(true);
    expect(gate(tree).props.placement).toBe('latex');
    expect(saveStepsLatex).not.toHaveBeenCalled();

    await act(async () => { gate(tree).props.onConfirm(); });
    expect(adFor(1).show).toHaveBeenCalledTimes(1); // LaTeX kendi reklam biriminden
    expect(adFor(0).show).not.toHaveBeenCalled();

    await act(async () => {
      adFor(1).emit('rewarded_earned_reward');
      adFor(1).emit('closed');
    });
    expect(saveStepsLatex).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(translations.tr.stepsLatexSavedTitle, translations.tr.stepsLatexSavedDesc);
  });

  test('reklam izlenmeden kapatılırsa LaTeX KAYDEDİLMEZ', async () => {
    await mount('ready');
    await pressByLabel(tree, latexLabel);
    await act(async () => { gate(tree).props.onConfirm(); });
    await act(async () => { adFor(1).emit('closed'); });
    expect(saveStepsLatex).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(translations.tr.adNotCompletedTitle, translations.tr.adNotCompletedDescLatex);
  });
});

describe('4) LaTeX: reklam yüklenemiyor -> .tex doğrudan', () => {
  test.each(['loadError', 'neverLoads', 'createThrows'] as const)('%s: reklam kutusu açılmaz, saveStepsLatex hemen çağrılır', async (state) => {
    await mount(state);
    await pressByLabel(tree, latexLabel);
    expect(gate(tree).props.visible).toBe(false);
    expect(saveStepsLatex).toHaveBeenCalledTimes(1);
  });

  test('reklam show() patlarsa LaTeX yine kaydedilir', async () => {
    await mount('ready');
    adFor(1).show.mockImplementation(() => Promise.reject(new Error('rejected')));
    await pressByLabel(tree, latexLabel);
    await act(async () => { gate(tree).props.onConfirm(); });
    await flush();
    expect(saveStepsLatex).toHaveBeenCalledTimes(1);
  });
});

describe('5-7) Çökme yok, çift tetikleme yok, aynı anda iki reklam yok', () => {
  test('reklam yokken LaTeX düğmesine art arda basmak yalnızca BİR kayıt başlatır', async () => {
    await mount('loadError');
    let release: (v: string) => void = () => {};
    (saveStepsLatex as jest.Mock).mockImplementationOnce(() => new Promise((r) => { release = r; }));
    await pressByLabel(tree, latexLabel);
    await pressByLabel(tree, latexLabel);
    await pressByLabel(tree, latexLabel);
    expect(saveStepsLatex).toHaveBeenCalledTimes(1);
    await act(async () => { release('saved'); });
    await pressByLabel(tree, latexLabel); // işlem bitince tekrar mümkün
    expect(saveStepsLatex).toHaveBeenCalledTimes(2);
  });

  test('onay kutusu açıkken ikinci dokunuş ikinci kutu/reklam başlatmaz', async () => {
    await mount('ready');
    await pressByLabel(tree, latexLabel);
    await pressByLabel(tree, 'PDF');
    await pressByLabel(tree, latexLabel);
    expect(tree.root.findAllByType(AdGateModal)).toHaveLength(1);
    expect(gate(tree).props.placement).toBe('latex');
    expect(adFor(0).show).not.toHaveBeenCalled();
    expect(adFor(1).show).not.toHaveBeenCalled();
  });

  test('"Reklamı İzle"ye çift basmak ad.show()\'u yalnızca bir kez çağırır', async () => {
    await mount('ready');
    await pressByLabel(tree, 'PDF');
    const confirm = gate(tree).props.onConfirm;
    await act(async () => { confirm(); confirm(); });
    expect(adFor(0).show).toHaveBeenCalledTimes(1);
  });

  test('reklam gösterilirken geri tuşu (onDecline) akışı bozmaz', async () => {
    await mount('ready');
    await pressByLabel(tree, 'PDF');
    await act(async () => { gate(tree).props.onConfirm(); });
    await act(async () => { gate(tree).props.onDecline(); });
    expect(gate(tree).props.visible).toBe(true); // hâlâ reklam akışında
    await act(async () => { adFor(0).emit('rewarded_earned_reward'); adFor(0).emit('closed'); });
    expect(pdfModal(tree).props.visible).toBe(true);
  });

  test('saveStepsLatex hata verse bile uygulama çökmez ve kilit açılır', async () => {
    await mount('loadError');
    (saveStepsLatex as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('disk full')));
    await pressByLabel(tree, latexLabel);
    expect(alertSpy).toHaveBeenCalledWith(translations.tr.stepsLatexSaveFailedTitle, translations.tr.stepsLatexSaveFailedDesc);
    await pressByLabel(tree, latexLabel);
    expect(saveStepsLatex).toHaveBeenCalledTimes(2);
  });

  test('unmount sonrası reklam olayları gelse bile hata/sızıntı yok', async () => {
    await mount('ready');
    await pressByLabel(tree, 'PDF');
    await act(async () => { gate(tree).props.onConfirm(); });
    act(() => tree.unmount());
    tree = null;
    expect(() => {
      adFor(0).emit('rewarded_earned_reward');
      adFor(0).emit('closed');
    }).not.toThrow();
    await flush();
    expect(adFor(0).listenerCount()).toBe(0);
  });
});
