import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, Modal, useWindowDimensions, Alert } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { AppTheme } from '@/theme/theme';
import { HistoryEntry, MatrixData } from '@/types';
import { useTranslation } from '@/i18n/useTranslation';
import { useAppStore } from '@/store/useAppStore';
import { formatNumber, formatNumberWithRadical, parseFractionalInput, parseComplexRealPart } from '@/utils/numberFormat';
import { formatComplexInputs } from '@/utils/complexOps';
import { buildHtmlReport, openPdf, sharePdf, downloadPdf } from '@/utils/pdfExport';
import { useExportAdGate } from '@/hooks/useExportAdGate';
import { runOperation } from '@/screens/CalculatorScreen';
import { getOperationConfig } from './OperationSelector';
import StepsModal from './StepsModal';
import PdfOptionsModal from './PdfOptionsModal';
import MathText, { MathList } from './MathText';

interface Props {
  visible: boolean;
  entry: HistoryEntry | null;
  onClose: () => void;
  onEdit: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  theme: AppTheme;
}

export default function HistoryDetailModal({ visible, entry, onClose, onEdit, onDelete, theme }: Props) {
  const { t } = useTranslation();
  const numberDisplayMode = useAppStore((s) => s.numberDisplayMode);
  const decimalPlaces = useAppStore((s) => s.decimalPlaces);
  const language = useAppStore((s) => s.language);
  const [stepsVisible, setStepsVisible] = useState(false);
  const [pdfOptionsVisible, setPdfOptionsVisible] = useState(false);
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const { requestExport, adGateElement } = useExportAdGate(theme);

  // Re-run the operation from entry.inputs with the current numberDisplayMode so an old
  // entry follows the display setting instead of the mode it was saved in. entry.result and
  // the history list are not modified.
  // This hook must run before the `if (!entry) return null` below (Rules of Hooks), so
  // entry is null-checked inside.
  const r = useMemo(() => {
    if (!entry) return null;
    const parseNum = entry.inputs.complex ? parseComplexRealPart : parseFractionalInput;
    const vectorB = entry.inputs.vectorB.map((tVal) => parseNum(tVal));
    const scalarNum = parseNum(entry.inputs.scalar);
    const exponentNum = parseInt(entry.inputs.exponent, 10) || 0;
    return runOperation(
      entry.operation,
      entry.inputs.matrixA,
      entry.inputs.matrixB,
      scalarNum,
      exponentNum,
      vectorB,
      entry.inputs.linearMethod,
      language,
      numberDisplayMode,
      {
        A: entry.inputs.matrixAText,
        B: entry.inputs.matrixBText,
        scalar: entry.inputs.scalar,
        b: entry.inputs.vectorB,
        exponent: exponentNum,
        method: entry.inputs.linearMethod,
        complex: entry.inputs.complex,
      }
    );
  }, [entry, language, numberDisplayMode, decimalPlaces]);

  if (!entry || !r) return null;
  const fmtR = (v: number) => formatNumberWithRadical(v, numberDisplayMode);

  function renderMatrix(m: MatrixData, labels?: string[][]) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.matrixScroll} contentContainerStyle={{ flexGrow: 0 }}>
        <View style={[styles.matrixBox, { borderColor: theme.border }]}>
          {m.map((row, i) => (
            <View key={i} style={styles.matrixRow}>
              {row.map((v, j) => (
                <View key={j} style={[styles.matrixCell, { backgroundColor: theme.cellBackground }]}>
                  <MathText text={labels?.[i]?.[j] ?? formatNumber(v, numberDisplayMode)} color={theme.text} fontSize={13} fontWeight="600" />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  function confirmDelete() {
    Alert.alert(t('deleteEntry'), '', [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => { onDelete(entry!.id); onClose(); } },
    ]);
  }

  async function handleOpenPdf() {
    try {
      await openPdf(buildHtmlReport(r!, entry!.operationLabel, numberDisplayMode));
    } catch {
      Alert.alert(t('pdfSaveFailedTitle'), t('pdfSaveFailedDesc'));
    }
  }

  async function handleSharePdf() {
    try {
      await sharePdf(buildHtmlReport(r!, entry!.operationLabel, numberDisplayMode));
    } catch {
      Alert.alert(t('pdfSaveFailedTitle'), t('pdfSaveFailedDesc'));
    }
  }

  async function handleDownloadPdf() {
    try {
      const outcome = await downloadPdf(buildHtmlReport(r!, entry!.operationLabel, numberDisplayMode), 'matris-gecmis');
      if (outcome === 'saved') Alert.alert(t('pdfSavedTitle'), t('pdfSavedDesc'));
      else if (outcome === 'shared') Alert.alert(t('pdfSavedTitle'), t('pdfSharedDesc'));
      else if (outcome === 'cancelled') Alert.alert(t('pdfSaveFailedTitle'), t('pdfSaveCancelled'));
    } catch {
      Alert.alert(t('pdfSaveFailedTitle'), t('pdfSaveFailedDesc'));
    }
  }

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
              <Text style={[styles.title, { color: theme.text }]}>{t('historyDetailTitle')}</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{entry.operationLabel}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.surfaceAlt }]}>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            bounces
            nestedScrollEnabled
          >
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{t('inputMatrices')}</Text>
            <Text style={[styles.matrixCaption, { color: theme.text }]}>A</Text>
            {renderMatrix(entry.inputs.matrixA, entry.inputs.complex && entry.inputs.matrixAText ? formatComplexInputs(entry.inputs.matrixAText, numberDisplayMode) : undefined)}
            {getOperationConfig(entry.operation).needsTwoMatrices && (
              <>
                <Text style={[styles.matrixCaption, { color: theme.text }]}>B</Text>
                {renderMatrix(entry.inputs.matrixB, entry.inputs.complex && entry.inputs.matrixBText ? formatComplexInputs(entry.inputs.matrixBText, numberDisplayMode) : undefined)}
              </>
            )}

            <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 16 }]}>{t('resultTitle')}</Text>
            {!r.success ? (
              <Text style={{ color: theme.danger, fontWeight: '600' }}>⚠ {r.errorMessage}</Text>
            ) : (
              <View>
                {r.matrixResult && renderMatrix(r.matrixResult, r.matrixResultLabels)}
                {r.scalarResult !== undefined && (
                  <MathText text={r.scalarResultLabel ?? formatNumber(r.scalarResult, numberDisplayMode)} color={theme.primary} fontSize={26} fontWeight="800" />
                )}
                {r.vectorResult && (
                  <MathList
                    items={r.vectorResult.map((v, i) => r.vectorResultLabels?.[i] ?? formatNumber(v, numberDisplayMode))}
                    color={theme.text}
                    fontSize={16}
                    fontWeight="700"
                  />
                )}
                {r.eigenResult && (
                  <View>
                    <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 4 }]}>{t('eigenvalues')}</Text>
                    <MathList
                      items={r.eigenResult.eigenvalues.map((v, i) => r.eigenResult!.radicalExpressions?.[i] ?? fmtR(v))}
                      color={theme.text}
                      fontSize={15}
                    />
                    <Text style={[styles.sectionLabel, { color: theme.textSecondary, marginTop: 10 }]}>{t('eigenvectors')}</Text>
                    {r.eigenResult.eigenvectors.map((v, i) => (
                      <MathList
                        key={i}
                        prefix={`v${i + 1} = `}
                        items={r.eigenResult!.eigenvectorRadicals?.[i] ?? v.map(fmtR)}
                        color={theme.text}
                        fontSize={15}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}

            {r.steps?.length > 0 && (
              <TouchableOpacity accessibilityRole="button"
                onPress={() => setStepsVisible(true)}
                style={[styles.stepsBtn, { backgroundColor: theme.primary }]}
              >
                <Text style={styles.stepsBtnText}>🔍 {t('viewStepsFullscreen')} ({r.steps.length})</Text>
              </TouchableOpacity>
            )}

            {/* PDF aksiyonu */}
            <TouchableOpacity accessibilityRole="button" onPress={() => requestExport('pdf', () => setPdfOptionsVisible(true))} style={[styles.pdfBtn, { borderColor: theme.border, marginTop: 10 }]}>
              <Text style={[styles.pdfBtnText, { color: theme.text }]}>📄 PDF</Text>
            </TouchableOpacity>

            <View style={{ height: 8 }} />
          </ScrollView>

          <View style={[styles.footer, { borderColor: theme.border }]}>
            <TouchableOpacity accessibilityRole="button" style={[styles.footerBtnOutline, { borderColor: theme.danger }]} onPress={confirmDelete}>
              <Text style={{ color: theme.danger, fontWeight: '700' }}>{t('deleteEntry')}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={[styles.footerBtnPrimary, { backgroundColor: theme.primary }]} onPress={() => onEdit(entry)}>
              <Text style={styles.footerBtnPrimaryText}>✎ {t('reEditInCalculator')}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      {r.steps?.length > 0 && (
        <StepsModal
          visible={stepsVisible}
          onClose={() => setStepsVisible(false)}
          result={r}
          operationLabel={entry.operationLabel}
          theme={theme}
        />
      )}

      <PdfOptionsModal
        visible={pdfOptionsVisible}
        onClose={() => setPdfOptionsVisible(false)}
        onOpen={handleOpenPdf}
        onShare={handleSharePdf}
        onDownload={handleDownloadPdf}
        theme={theme}
      />

      {adGateElement}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { borderWidth: 1, borderRadius: 20, overflow: 'hidden', flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, flexShrink: 0 },
  scrollArea: { flexGrow: 1, flexShrink: 1 },
  scrollContent: { padding: 18, paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  matrixCaption: { fontSize: 13, fontWeight: '700', marginTop: 6, marginBottom: 2 },
  matrixScroll: { alignSelf: 'flex-start', maxWidth: '100%' },
  matrixBox: { borderWidth: 1, borderRadius: 10, padding: 6, alignSelf: 'flex-start', marginBottom: 6 },
  matrixRow: { flexDirection: 'row' },
  matrixCell: { minWidth: 44, minHeight: 38, margin: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  matrixCellText: { fontSize: 13, fontWeight: '600' },
  stepsBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  stepsBtnText: { color: '#fff', fontWeight: '700' },
  pdfActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pdfBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  pdfBtnText: { fontSize: 12, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, flexShrink: 0 },
  footerBtnOutline: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  footerBtnPrimary: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  footerBtnPrimaryText: { color: '#fff', fontWeight: '700' },
});
