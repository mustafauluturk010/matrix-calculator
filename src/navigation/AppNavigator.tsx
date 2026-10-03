import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTheme } from '@/theme/theme';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n/useTranslation';

import CalculatorScreen from '@/screens/CalculatorScreen';
import SavedMatricesScreen from '@/screens/SavedMatricesScreen';
import HistoryScreen from '@/screens/HistoryScreen';
import SettingsScreen from '@/screens/SettingsScreen';

// Bottom tab navigation. Route names (e.g. "Hesapla") must stay fixed because other screens
// call navigation.navigate('Hesapla'); the visible label is translated separately via tabBarLabel.

const Tab = createBottomTabNavigator();

// Her sekme için aktif (dolu) ve pasif (outline) ikon adları -
// React Navigation `focused` durumuna göre hangisinin kullanılacağını
// bildiriyor, böylece aktif sekme dolu ikonla vurgulanıyor.
const TAB_ICONS: Record<string, { focused: keyof typeof Ionicons.glyphMap; unfocused: keyof typeof Ionicons.glyphMap }> = {
  Hesapla: { focused: 'calculator', unfocused: 'calculator-outline' },
  Matrisler: { focused: 'grid', unfocused: 'grid-outline' },
  Geçmiş: { focused: 'time', unfocused: 'time-outline' },
  Ayarlar: { focused: 'settings', unfocused: 'settings-outline' },
};

export default function AppNavigator() {
  const themeMode = useAppStore((s) => s.themeMode);
  const theme = getTheme(themeMode);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Android'de gesture/navigation çubuğu, sabit yükseklikli bir
  // tabBarStyle kullanıldığında (height/paddingBottom override edildiğinde)
  // React Navigation'ın otomatik alt safe-area davranışını devre dışı
  // bırakır. Bu yüzden alt boşluğu insets.bottom ile burada elle ekliyoruz,
  // aksi halde sekme çubuğu sistem gezinme çubuğunun ARKASINDA kalır.
  const tabBarBottomPadding = Math.max(insets.bottom, 8);

  return (
    <NavigationContainer
      theme={{
        dark: themeMode === 'dark',
        colors: {
          primary: theme.primary,
          background: theme.background,
          card: theme.surface,
          text: theme.text,
          border: theme.border,
          notification: theme.primary,
        },
      }}
    >
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textSecondary,
          tabBarStyle: {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            height: 54 + tabBarBottomPadding,
            paddingBottom: tabBarBottomPadding,
            paddingTop: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 8,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.1 },
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? TAB_ICONS[route.name].focused : TAB_ICONS[route.name].unfocused} size={22} color={color} />
          ),
        })}
      >
        <Tab.Screen name="Hesapla" component={CalculatorScreen} options={{ tabBarLabel: t('tabCalculate') }} />
        <Tab.Screen name="Matrisler" component={SavedMatricesScreen} options={{ tabBarLabel: t('tabMatrices') }} />
        <Tab.Screen name="Geçmiş" component={HistoryScreen} options={{ tabBarLabel: t('tabHistory') }} />
        <Tab.Screen name="Ayarlar" component={SettingsScreen} options={{ tabBarLabel: t('tabSettings') }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
