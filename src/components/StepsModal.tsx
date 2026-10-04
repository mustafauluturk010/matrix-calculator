import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, Modal, Platform, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { AppTheme } from '@/theme/theme';
import { OperationResult, MatrixData } from '@/types';
import { useTranslation } from '@/i18n/useTranslation';
import { useAppStore } from '@/store/useAppStore';
import { formatNumber } from '@/utils/numberFormat';
import MathText from './MathText';
import { classifyStep, parseDescription, changedCells, StepKind } from '@/utils/stepFormat';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// The dimmed backdrop is a separate absolutely positioned Pressable behind the content, not a
// wrapper around it: a wrapping touchable conflicts with the inner ScrollView's gesture
// handling and blocks scrolling. As siblings, tap-outside-to-close and free scrolling both work.

interface StepsModalProps {
  visible: boolean;
  onClose: () => void;
  result: OperationResult;
  operationLabel: string;
  theme: AppTheme;
}

export default function StepsModal({ visible, onClose, result, operationLabel, theme }: StepsModalProps) {
  const { t } = useTranslation();
  const numberDisplayMode = useAppStore((s) => s.numberDisplayMode);
  // useWindowDimensions (Dimensions.get yerine): cihaz döndürüldüğünde
  // (dikey <-> yatay) otomatik olarak yeniden hesaplanır, böylece
  // pencere yeni ekran boyutuna doğru uyum sağlar.
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();

  function renderMatrix(m: MatrixData, labels?: string[][], changed?: boolean[][] | null, hl?: string) {
    // Geniş matrisler (5x5, 6x6 vb.) modal genişliğini aşabilir.
    // Yatay ScrollView ile sarmalayarak, taşan sütunlara sağa
    // kaydırarak ulaşılabilmesini sağlıyoruz.
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.matrixScroll} contentContainerStyle={{ flexGrow: 0 }}>
        <View style={[styles.matrixBox, { borderColor: theme.border }]}>
          {m.map((row, i) => (
            <View key={i} style={styles.matrixRow}>
              {row.map((v, j) => (
                <View
                  key={j}
                  style={[
                    styles.matrixCell,
                    { backgroundColor: changed?.[i]?.[j] && hl ? hl + '33' : theme.cellBackground },
                    changed?.[i]?.[j] && hl ? { borderWidth: 1.5, borderColor: hl } : null,
                  ]}
                >
                  <MathText text={labels?.[i]?.[j] ?? formatNumber(v, numberDisplayMode)} color={theme.text} fontSize={13} fontWeight="600" />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  const kindColor: Record<StepKind, string> = {
    setup: theme.textSecondary,
    swap: '#F59E0B',
    normalize: theme.accent,
    eliminate: theme.primary,
    compute: theme.primary,
    verify: theme.success,
    result: theme.success,
  };
  const kindLabel: Record<StepKind, string> = {
    setup: t('stepKindSetup'),
    swap: t('stepKindSwap'),
    normalize: t('stepKindNormalize'),
    eliminate: t('stepKindEliminate'),
    compute: t('stepKindCompute'),
    verify: t('stepKindVerify'),
    result: t('stepKindResult'),
  };

  const total = result.steps.length;
  let prevIdx = -1;
  let anyHighlight = false;
  const meta = result.steps.map((step, idx) => {
    const kind = classifyStep(step, idx, total);
    let changed: boolean[][] | null = null;
    if (step.matrixSnapshot && prevIdx >= 0 && kind !== 'result') {
      const prev = result.steps[prevIdx];
      changed = changedCells(prev.matrixSnapshot!, step.matrixSnapshot, prev.matrixSnapshotLabels, step.matrixSnapshotLabels);
      if (changed && changed.some((r) => r.some(Boolean))) anyHighlight = true;
    }
    if (step.matrixSnapshot) prevIdx = idx;
    return { kind, changed, blocks: parseDescription(step.description) };
  });

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          entering={FadeInUp.duration(250)}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              maxHeight: SCREEN_HEIGHT * 0.88,
              width: Math.min(SCREEN_WIDTH * 0.94, 720),
            },
          ]}
        >
          <View style={[styles.header, { borderColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.text }]}>{t('stepByStepSolution')}</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{operationLabel}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.surfaceAlt }]}>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.stepCountBadgeRow}>
            <Text style={[styles.stepCountText, { color: theme.textSecondary }]}>
              {result.steps.length} {t('stepsWord')}
            </Text>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            bounces
            nestedScrollEnabled
          >
            {anyHighlight && (
              <Text style={[styles.legend, { color: theme.textSecondary }]}>🟧 {t('stepChangedLegend')}</Text>
            )}
            {result.steps.map((step, idx) => {
              const { kind, changed, blocks } = meta[idx];
              const color = kindColor[kind];
              return (
                <Animated.View
                  key={idx}
                  entering={FadeIn.delay(Math.min(idx, 15) * 25).duration(200)}
                  style={[styles.stepCard, { borderColor: theme.border, backgroundColor: theme.surfaceAlt, borderLeftColor: color }]}
                >
                  <View style={styles.stepHead}>
                    <View style={[styles.stepBadge, { backgroundColor: color }]}>
                      <Text style={styles.stepBadgeText}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.kindChip, { color }]}>{kindLabel[kind]}</Text>
                      <Text style={[styles.stepTitle, { color: theme.text }]}>{step.title}</Text>
                    </View>
                  </View>
                  {blocks.map((b, bi) =>
                    b.type === 'formula' ? (
                      <View key={bi} style={[styles.formulaBox, { backgroundColor: theme.cellBackground, borderColor: color }]}>
                        <Text selectable style={[styles.formulaText, { color: theme.text }]}>{b.text}</Text>
                      </View>
                    ) : (
                      <Text key={bi} style={[styles.stepDesc, { color: theme.textSecondary }]}>{b.text}</Text>
                    )
                  )}
                  {step.matrixSnapshot && (
                    <>
                      {idx > 0 && kind !== 'result' && <Text style={[styles.after, { color: theme.textSecondary }]}>{t('stepMatrixAfter')}</Text>}
                      {renderMatrix(step.matrixSnapshot, step.matrixSnapshotLabels, changed, color)}
                    </>
                  )}
                </Animated.View>
              );
            })}
            {/* Son elemanın alt aksiyon çubuğunun arkasında kalmaması için ekstra boşluk */}
            <View style={{ height: 8 }} />
          </ScrollView>

          <TouchableOpacity accessibilityRole="button" style={[styles.footerBtn, { backgroundColor: theme.primary }]} onPress={onClose}>
            <Text style={styles.footerBtnText}>{t('close')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexShrink: 0,
  },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  stepCountBadgeRow: { paddingHorizontal: 18, paddingTop: 10, flexShrink: 0 },
  stepCountText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  scrollArea: { flexGrow: 1, flexShrink: 1 },
  scrollContent: { padding: 18, paddingTop: 8, paddingBottom: 28 },
  legend: { fontSize: 12, marginBottom: 10 },
  stepCard: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 12, padding: 12, marginBottom: 12 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  kindChip: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  formulaBox: { borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginTop: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  formulaText: { fontFamily: MONO, fontSize: 14, lineHeight: 20 },
  after: { fontSize: 12, fontWeight: '600', marginTop: 10 },
  stepBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  stepTitle: { fontSize: 15, fontWeight: '700' },
  stepDesc: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  matrixScroll: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: 8 },
  matrixBox: { borderWidth: 1, borderRadius: 10, padding: 6, alignSelf: 'flex-start' },
  matrixRow: { flexDirection: 'row' },
  matrixCell: { minWidth: 44, minHeight: 38, margin: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  matrixCellText: { fontSize: 13, fontWeight: '600' },
  footerBtn: { margin: 16, marginTop: 0, borderRadius: 12, paddingVertical: 13, alignItems: 'center', flexShrink: 0 },
  footerBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
