import { useAppStore } from '@/store/useAppStore';
import { translations, TranslationKey } from './translations';

export function useTranslation() {
  const language = useAppStore((s) => s.language);

  function t(key: TranslationKey): string {
    return translations[language][key] ?? translations.tr[key] ?? key;
  }

  return { t, language };
}
