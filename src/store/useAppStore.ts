import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HistoryEntry,
  NamedMatrix,
  MatrixData,
  ThemeMode,
  LanguageCode,
} from '@/types';
import { NumberDisplayMode, setDecimalPlaces as applyDecimalPlaces } from '@/utils/numberFormat';

const HISTORY_STORAGE_KEY = '@matrix_calculator_history_v1';
const MATRICES_STORAGE_KEY = '@matrix_calculator_saved_matrices_v1';
const THEME_STORAGE_KEY = '@matrix_calculator_theme_v1';
const LANGUAGE_STORAGE_KEY = '@matrix_calculator_language_v1';
const NUMBER_FORMAT_STORAGE_KEY = '@matrix_calculator_number_format_v1';
const COMPLEX_MODE_STORAGE_KEY = '@matrix_calculator_complex_mode_v1';
const DECIMAL_PLACES_STORAGE_KEY = '@matrix_calculator_decimal_places_v1';

interface AppState {
  themeMode: ThemeMode;
  toggleTheme: () => void;
  loadTheme: () => Promise<void>;

  language: LanguageCode;
  languageSelected: boolean;
  setLanguage: (lang: LanguageCode) => void;
  loadLanguage: () => Promise<void>;

  numberDisplayMode: NumberDisplayMode;
  setNumberDisplayMode: (mode: NumberDisplayMode) => void;
  loadNumberDisplayMode: () => Promise<void>;

  /** Karmaşık sayı modu: hücrelere `3+2i` gibi girişler yazılabilir. */
  complexMode: boolean;
  setComplexMode: (on: boolean) => void;
  loadComplexMode: () => Promise<void>;

  /** Ondalık modda gösterilecek basamak sayısı (0-12, varsayılan 6). */
  decimalPlaces: number;
  setDecimalPlaces: (n: number) => void;
  loadDecimalPlaces: () => Promise<void>;

  pendingLoadEntry: HistoryEntry | null;
  pendingLoadMatrix: { target: 'A' | 'B'; matrix: NamedMatrix } | null;
  requestLoadHistoryEntry: (entry: HistoryEntry) => void;
  requestLoadSavedMatrix: (target: 'A' | 'B', matrix: NamedMatrix) => void;
  clearPendingLoad: () => void;

  savedMatrices: NamedMatrix[];
  addSavedMatrix: (name: string, rows: number, cols: number, data: MatrixData, texts?: string[][]) => void;
  updateSavedMatrix: (id: string, rows: number, cols: number, data: MatrixData, texts?: string[][]) => void;
  removeSavedMatrix: (id: string) => void;
  loadSavedMatrices: () => Promise<void>;

  history: HistoryEntry[];
  addHistoryEntry: (entry: HistoryEntry) => void;
  removeHistoryEntry: (id: string) => void;
  removeHistoryEntries: (ids: string[]) => void;
  clearHistory: () => void;
  loadHistory: () => Promise<void>;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useAppStore = create<AppState>((set, get) => ({
  themeMode: 'light',
  toggleTheme: () => {
    const next: ThemeMode = get().themeMode === 'light' ? 'dark' : 'light';
    set({ themeMode: next });
    AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
  },
  loadTheme: async () => {
    try {
      const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') set({ themeMode: stored });
    } catch {}
  },

  language: 'tr',
  languageSelected: false,
  setLanguage: (lang) => {
    set({ language: lang, languageSelected: true });
    AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang).catch(() => {});
  },
  loadLanguage: async () => {
    try {
      const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored === 'tr' || stored === 'en') set({ language: stored, languageSelected: true });
    } catch {}
  },

  numberDisplayMode: 'decimal',
  setNumberDisplayMode: (mode) => {
    set({ numberDisplayMode: mode });
    AsyncStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, mode).catch(() => {});
  },
  loadNumberDisplayMode: async () => {
    try {
      const stored = await AsyncStorage.getItem(NUMBER_FORMAT_STORAGE_KEY);
      if (stored === 'decimal' || stored === 'fraction') set({ numberDisplayMode: stored });
    } catch {}
  },

  complexMode: false,
  setComplexMode: (on) => {
    set({ complexMode: on });
    AsyncStorage.setItem(COMPLEX_MODE_STORAGE_KEY, on ? '1' : '0').catch(() => {});
  },
  loadComplexMode: async () => {
    try {
      const stored = await AsyncStorage.getItem(COMPLEX_MODE_STORAGE_KEY);
      if (stored === '1') set({ complexMode: true });
    } catch {}
  },

  decimalPlaces: 6,
  setDecimalPlaces: (n) => {
    const clamped = Math.min(12, Math.max(0, Math.round(n)));
    // Önce modül-seviyesi ayar uygulanır, SONRA store güncellenir: abone bileşenlerin
    // (CalculatorScreen yeniden hesaplama etkisi) tetiklendiği anda biçimlendirme
    // zaten yeni basamak sayısını görmeli; ters sırada eski hassasiyette donabilirdi.
    applyDecimalPlaces(clamped);
    set({ decimalPlaces: clamped });
    AsyncStorage.setItem(DECIMAL_PLACES_STORAGE_KEY, String(clamped)).catch(() => {});
  },
  loadDecimalPlaces: async () => {
    try {
      const stored = await AsyncStorage.getItem(DECIMAL_PLACES_STORAGE_KEY);
      if (stored !== null) {
        const n = parseInt(stored, 10);
        if (Number.isFinite(n)) {
          applyDecimalPlaces(n);
          set({ decimalPlaces: n });
        }
      }
    } catch {}
  },

  pendingLoadEntry: null,
  pendingLoadMatrix: null,
  requestLoadHistoryEntry: (entry) => set({ pendingLoadEntry: entry, pendingLoadMatrix: null }),
  requestLoadSavedMatrix: (target, matrix) => set({ pendingLoadMatrix: { target, matrix }, pendingLoadEntry: null }),
  clearPendingLoad: () => set({ pendingLoadEntry: null, pendingLoadMatrix: null }),

  savedMatrices: [],
  addSavedMatrix: (name, rows, cols, data, texts) => {
    const newMatrix: NamedMatrix = {
      id: generateId(),
      name,
      rows,
      cols,
      data,
      ...(texts ? { texts } : {}),
      createdAt: Date.now(),
    };
    const updated = [newMatrix, ...get().savedMatrices];
    set({ savedMatrices: updated });
    AsyncStorage.setItem(MATRICES_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },
  updateSavedMatrix: (id, rows, cols, data, texts) => {
    // Eski ham metinler (karmaşık giriş) yeni verilerle çelişmesin diye HER ZAMAN atılır;
    // yalnızca yeni `texts` verildiyse (karmaşık girişli düzenleme) yazılır.
    const updated = get().savedMatrices.map((m) => {
      if (m.id !== id) return m;
      const { texts: _oldTexts, ...rest } = m;
      return { ...rest, rows, cols, data, ...(texts ? { texts } : {}) };
    });
    set({ savedMatrices: updated });
    AsyncStorage.setItem(MATRICES_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },
  removeSavedMatrix: (id) => {
    const updated = get().savedMatrices.filter((m) => m.id !== id);
    set({ savedMatrices: updated });
    AsyncStorage.setItem(MATRICES_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },
  loadSavedMatrices: async () => {
    try {
      const stored = await AsyncStorage.getItem(MATRICES_STORAGE_KEY);
      if (stored) set({ savedMatrices: JSON.parse(stored) });
    } catch {}
  },

  history: [],
  addHistoryEntry: (entry) => {
    const updated = [entry, ...get().history].slice(0, 100);
    set({ history: updated });
    AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },
  removeHistoryEntry: (id) => {
    const updated = get().history.filter((h) => h.id !== id);
    set({ history: updated });
    AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },
  removeHistoryEntries: (ids) => {
    const idSet = new Set(ids);
    const updated = get().history.filter((h) => !idSet.has(h.id));
    set({ history: updated });
    AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  },
  clearHistory: () => {
    set({ history: [] });
    AsyncStorage.removeItem(HISTORY_STORAGE_KEY).catch(() => {});
  },
  loadHistory: async () => {
    try {
      const stored = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) set({ history: JSON.parse(stored) });
    } catch {}
  },
}));
