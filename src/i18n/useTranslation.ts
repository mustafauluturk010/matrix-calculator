import { useAppStore } from '@/store/useAppStore';
import { translations, TranslationKey } from './translations';

// Returns a simple t(key) function. The active language comes from useAppStore, so changing
// it in Settings re-renders every screen.

export function useTranslation() {
  const language = useAppStore((s) => s.language);

  function t(key: TranslationKey): string {
    return translations[language][key] ?? translations.tr[key] ?? key;
  }

  return { t, language };
}
