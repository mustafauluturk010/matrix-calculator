import React from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTheme } from '@/theme/theme';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n/useTranslation';
import DimensionPicker from '@/components/DimensionPicker';

export default function SettingsScreen() {
  const themeMode = useAppStore((s) => s.themeMode);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const numberDisplayMode = useAppStore((s) => s.numberDisplayMode);
  const setNumberDisplayMode = useAppStore((s) => s.setNumberDisplayMode);
  const complexMode = useAppStore((s) => s.complexMode);
  const setComplexMode = useAppStore((s) => s.setComplexMode);
  const decimalPlaces = useAppStore((s) => s.decimalPlaces);
  const setDecimalPlaces = useAppStore((s) => s.setDecimalPlaces);
  const { t } = useTranslation();
  const theme = getTheme(themeMode);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingTop: 18 + insets.top, paddingHorizontal: 18, paddingBottom: 34 + insets.bottom }}
    >
      <Text style={[styles.header, { color: theme.text }]}>{t('settingsTitle')}</Text>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.rowTitle, { color: theme.text, marginBottom: 4 }]}>{t('language')}</Text>
        <Text style={[styles.rowDesc, { color: theme.textSecondary, marginBottom: 14 }]}>{t('languageDesc')}</Text>
        <View style={[styles.langSwitch, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
          <TouchableOpacity accessibilityRole="button"
            accessibilityState={{ selected: language === 'tr' }}
            onPress={() => setLanguage('tr')}
            style={[styles.langOption, language === 'tr' && { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.langText, { color: language === 'tr' ? '#fff' : theme.text }]}>🇹🇷 Türkçe</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button"
            accessibilityState={{ selected: language === 'en' }}
            onPress={() => setLanguage('en')}
            style={[styles.langOption, language === 'en' && { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.langText, { color: language === 'en' ? '#fff' : theme.text }]}>🇬🇧 English</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.rowTitle, { color: theme.text, marginBottom: 4 }]}>{t('numberDisplay')}</Text>
        <Text style={[styles.rowDesc, { color: theme.textSecondary, marginBottom: 14 }]}>{t('numberDisplayDesc')}</Text>
        <View style={[styles.langSwitch, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
          <TouchableOpacity accessibilityRole="button"
            accessibilityState={{ selected: numberDisplayMode === 'decimal' }}
            onPress={() => setNumberDisplayMode('decimal')}
            style={[styles.langOption, numberDisplayMode === 'decimal' && { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.langText, { color: numberDisplayMode === 'decimal' ? '#fff' : theme.text }]}>
              {t('numberDisplayDecimal')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button"
            accessibilityState={{ selected: numberDisplayMode === 'fraction' }}
            onPress={() => setNumberDisplayMode('fraction')}
            style={[styles.langOption, numberDisplayMode === 'fraction' && { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.langText, { color: numberDisplayMode === 'fraction' ? '#fff' : theme.text }]}>
              {t('numberDisplayFraction')}
            </Text>
          </TouchableOpacity>
        </View>
        {numberDisplayMode === 'decimal' && (
          <View style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={[styles.rowDesc, { color: theme.textSecondary, marginBottom: 10, textAlign: 'center' }]}>
              {t('decimalPlacesDesc')}
            </Text>
            <DimensionPicker label={t('decimalPlaces')} value={decimalPlaces} min={0} max={12} onChange={setDecimalPlaces} theme={theme} />
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{t('complexMode')}</Text>
            <Text style={[styles.rowDesc, { color: theme.textSecondary }]}>{t('complexModeDesc')}</Text>
          </View>
          <Switch value={complexMode} onValueChange={setComplexMode} trackColor={{ true: theme.primary }} accessibilityLabel={t('complexMode')} accessibilityRole="switch" />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{t('darkTheme')}</Text>
            <Text style={[styles.rowDesc, { color: theme.textSecondary }]}>{t('darkThemeDesc')}</Text>
          </View>
          <Switch value={themeMode === 'dark'} onValueChange={toggleTheme} trackColor={{ true: theme.primary }} accessibilityLabel={t('darkTheme')} accessibilityRole="switch" />
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
        <Text style={[styles.infoText, { color: theme.textSecondary }]}>{t('aboutApp')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { fontSize: 25, fontWeight: '800', marginBottom: 18, letterSpacing: -0.3 },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 17,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  rowDesc: { fontSize: 12, lineHeight: 17 },
  langSwitch: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  langOption: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  langText: { fontSize: 14, fontWeight: '700' },
  infoCard: { borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 2, marginBottom: 20 },
  infoText: { fontSize: 12, lineHeight: 18 },
});
