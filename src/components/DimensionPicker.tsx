import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AppTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n/useTranslation';

// Operations that do not support 1x1 (e.g. eigen) report their own error.

interface DimensionPickerProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  theme: AppTheme;
}

export default function DimensionPicker({
  label,
  value,
  min = 1,
  max = 6,
  onChange,
  theme,
}: DimensionPickerProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={[styles.stepper, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
        <TouchableOpacity
          style={styles.btn}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - 1))}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${t('decreaseA11y')}`}
          accessibilityState={{ disabled: value <= min }}
        >
          <Text style={[styles.btnText, { color: value <= min ? theme.textSecondary : theme.primary }]}>−</Text>
        </TouchableOpacity>
        <Text style={[styles.value, { color: theme.text }]} accessibilityLabel={`${label}: ${value}`}>
          {value}
        </Text>
        <TouchableOpacity
          style={styles.btn}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${t('increaseA11y')}`}
          accessibilityState={{ disabled: value >= max }}
        >
          <Text style={[styles.btnText, { color: value >= max ? theme.textSecondary : theme.primary }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginHorizontal: 8 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  btn: { paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { fontSize: 20, fontWeight: '700' },
  value: { fontSize: 16, fontWeight: '700', minWidth: 28, textAlign: 'center' },
});
