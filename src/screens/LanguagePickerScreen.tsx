import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useAppStore } from '@/store/useAppStore';
import { getTheme } from '@/theme/theme';

// Full-screen language selection shown on first launch. Once a language is chosen,
// `languageSelected` becomes true in the store and App.tsx switches to normal navigation.

export default function LanguagePickerScreen() {
  const themeMode = useAppStore((s) => s.themeMode);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const theme = getTheme(themeMode);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🌐</Text>
        <Text style={[styles.title, { color: theme.text }]}>Dil Seçin{'\n'}Choose Language</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Uygulama dilini seçerek devam edin{'\n'}Select your app language to continue
        </Text>

        <TouchableOpacity accessibilityRole="button"
          style={[styles.optionBtn, { backgroundColor: theme.primary }]}
          onPress={() => setLanguage('tr')}
        >
          <Text style={styles.optionEmoji}>🇹🇷</Text>
          <Text style={styles.optionText}>Türkçe</Text>
        </TouchableOpacity>

        <TouchableOpacity accessibilityRole="button"
          style={[styles.optionBtn, { backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border }]}
          onPress={() => setLanguage('en')}
        >
          <Text style={styles.optionEmoji}>🇬🇧</Text>
          <Text style={[styles.optionText, { color: theme.text }]}>English</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emoji: { fontSize: 56, marginBottom: 18 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center', lineHeight: 32, marginBottom: 10 },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 36 },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    paddingVertical: 18,
    marginBottom: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  optionEmoji: { fontSize: 24 },
  optionText: { fontSize: 17, fontWeight: '800', color: '#fff' },
});
