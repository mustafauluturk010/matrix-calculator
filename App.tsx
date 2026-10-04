import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initRewardedAds } from '@/services/rewardedAdManager';
import AppNavigator from '@/navigation/AppNavigator';
import LanguagePickerScreen from '@/screens/LanguagePickerScreen';
import { useAppStore } from '@/store/useAppStore';
import { getTheme } from '@/theme/theme';

export default function App() {
  const loadTheme = useAppStore((s) => s.loadTheme);
  const loadHistory = useAppStore((s) => s.loadHistory);
  const loadSavedMatrices = useAppStore((s) => s.loadSavedMatrices);
  const loadLanguage = useAppStore((s) => s.loadLanguage);
  const loadNumberDisplayMode = useAppStore((s) => s.loadNumberDisplayMode);
  const loadComplexMode = useAppStore((s) => s.loadComplexMode);
  const loadDecimalPlaces = useAppStore((s) => s.loadDecimalPlaces);
  const themeMode = useAppStore((s) => s.themeMode);
  const languageSelected = useAppStore((s) => s.languageSelected);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    // AdMob'u başlatır ve rewarded reklamları önceden yükler. Hata verirse uygulama normal çalışır;
    // dışa aktarmalar reklamsız doğrudan yapılır.
    void initRewardedAds();

    async function bootstrap() {
      await Promise.all([
        loadTheme(),
        loadHistory(),
        loadSavedMatrices(),
        loadLanguage(),
        loadNumberDisplayMode(),
        loadComplexMode(),
        loadDecimalPlaces(),
      ]);
      setBootstrapped(true);
    }
    bootstrap();
  }, []);

  if (!bootstrapped) {
    const theme = getTheme(themeMode);
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        {languageSelected ? <AppNavigator /> : <LanguagePickerScreen />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
