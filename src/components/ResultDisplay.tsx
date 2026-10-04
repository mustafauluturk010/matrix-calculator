import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { AppTheme } from '@/theme/theme';
import { OperationResult, MatrixData } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n/useTranslation';
import { formatNumber, formatNumberWithRadical } from '@/utils/numberFormat';
import { buildPlainTextSummary, buildHtmlReport, openPdf, sharePdf, downloadPdf } from '@/utils/pdfExport';
import { buildStepsLatexDocument, saveStepsLatex } from '@/utils/latexExport';
import { resultToLatex } from '@/utils/matrixUtils';
import { useExportAdGate } from '@/hooks/useExportAdGate';
import StepsModal from './StepsModal';
import MathText, { MathList } from './MathText';
import PdfOptionsModal from './PdfOptionsModal';

interface ResultDisplayProps {
  result: OperationResult | null;
  operationLabel: string;
  theme: AppTheme;
}

export default function ResultDisplay({ result, operationLabel, theme }: ResultDisplayProps) {
  const { t } = useTranslation();
  const numberDisplayMode = useAppStore((s) => s.numberDisplayMode);
  // Ondalık basamak ayarına abone: ayar değişince (üst bileşen yeniden hesaplamasa bile)
  // canlı biçimlendirilen sayılar (fmtR/formatNumber) yeni basamakla yeniden çizilir.
  useAppStore((s) => s.decimalPlaces);
  const [stepsModalVisible, setStepsModalVisible] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [latexFeedback, setLatexFeedback] = useState(false);
  const [pdfOptionsVisible, setPdfOptionsVisible] = useState(false);
  const { requestExport, adGateElement } = useExportAdGate(theme);

  if (!result) return null;

  async function handleCopy() {
    await Clipboard.setStringAsync(buildPlainTextSummary(result!, operationLabel, numberDisplayMode));
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  }

  async function handleCopyLatex() {
    const latex = result!.latexResult ?? resultToLatex(result!, operationLabel, numberDisplayMode);
    await Clipboard.setStringAsync(latex);
    setLatexFeedback(true);
    setTimeout(() => setLatexFeedback(false), 1500);
  }

  async function handleSaveStepsLatex() {
    try {
      const doc = buildStepsLatexDocument(result!, operationLabel, numberDisplayMode);
      const outcome = await saveStepsLatex(doc, 'matris-cozum-adimlari');
      if (outcome === 'saved') {
        Alert.alert(t('stepsLatexSavedTitle'), t('stepsLatexSavedDesc'));
      } else if (outcome === 'shared') {
        Alert.alert(t('stepsLatexSavedTitle'), t('stepsLatexSharedDesc'));
      } else if (outcome === 'cancelled') {
        Alert.alert(t('stepsLatexSaveFailedTitle'), t('stepsLatexSaveCancelled'));
      }
    } catch {
      Alert.alert(t('stepsLatexSaveFailedTitle'), t('stepsLatexSaveFailedDesc'));
    }
  }

  async function handleOpenPdf() {
    try {
      await openPdf(buildHtmlReport(result!, operationLabel, numberDisplayMode));
    } catch {
      Alert.alert(t('pdfSaveFailedTitle'), t('pdfSaveFailedDesc'));
    }
  }

  async function handleSharePdf() {
    try {
      await sharePdf(buildHtmlReport(result!, operationLabel, numberDisplayMode));
    } catch {
      Alert.alert(t('pdfSaveFailedTitle'), t('pdfSaveFailedDesc'));
    }
  }

  async function handleDownloadPdf() {
    try {
      const outcome = await downloadPdf(buildHtmlReport(result!, operationLabel, numberDisplayMode), 'matris-cozumu');
      if (outcome === 'saved') Alert.alert(t('pdfSavedTitle'), t('pdfSavedDesc'));
      else if (outcome === 'shared') Alert.alert(t('pdfSavedTitle'), t('pdfSharedDesc'));
      else if (outcome === 'cancelled') Alert.alert(t('pdfSaveFailedTitle'), t('pdfSaveCancelled'));
    } catch {
      Alert.alert(t('pdfSaveFailedTitle'), t('pdfSaveFailedDesc'));
    }
  }

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

  const fmtR = (v: number) => formatNumberWithRadical(v, numberDisplayMode);

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>{operationLabel}</Text>

      {!result.success ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '20', borderColor: theme.danger }]}>
          <Text style={[styles.errorText, { color: theme.danger }]}>⚠ {result.errorMessage}</Text>
        </View>
      ) : (
        <View>
          {result.matrixResult && renderMatrix(result.matrixResult, result.matrixResultLabels)}

          {result.scalarResult !== undefined && (
            <MathText text={result.scalarResultLabel ?? formatNumber(result.scalarResult, numberDisplayMode)} color={theme.primary} fontSize={34} fontWeight="800" style={styles.scalarText} />
          )}

          {result.vectorResult && (
            <MathList
              items={result.vectorResult.map((v, i) => result.vectorResultLabels?.[i] ?? formatNumber(v, numberDisplayMode))}
              color={theme.text}
              fontSize={18}
            />
          )}

          {result.eigenResult && (
            <View>
              <Text style={[styles.subheading, { color: theme.textSecondary }]}>{t('eigenvalues')}</Text>
              <MathList
                items={result.eigenResult.eigenvalues.map((v, i) => result.eigenResult!.radicalExpressions?.[i] ?? fmtR(v))}
                color={theme.text}
                fontSize={18}
              />
              <Text style={[styles.subheading, { color: theme.textSecondary }]}>{t('eigenvectors')}</Text>
              {result.eigenResult.eigenvectors.map((v, i) => (
                <MathList
                  key={i}
                  prefix={`v${i + 1} = `}
                  items={result.eigenResult!.eigenvectorRadicals?.[i] ?? v.map(fmtR)}
                  color={theme.text}
                  fontSize={18}
                />
              ))}
            </View>
          )}

          {result.luResult && (
            <View>
              {result.luResult.P && (
                <>
                  <Text style={[styles.subheading, { color: theme.textSecondary }]}>{t('permutationMatrix')}</Text>
                  {renderMatrix(result.luResult.P)}
                </>
              )}
              <Text style={[styles.subheading, { color: theme.textSecondary }]}>{t('lowerTriangular')}</Text>
              {renderMatrix(result.luResult.L, result.luResultLabels?.L)}
              <Text style={[styles.subheading, { color: theme.textSecondary }]}>{t('upperTriangular')}</Text>
              {renderMatrix(result.luResult.U, result.luResultLabels?.U)}
            </View>
          )}

        </View>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={handleCopy}
          style={[styles.actionBtn, { borderColor: theme.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('copy')}
        >
          <Text style={[styles.actionText, { color: theme.text }]}>{copyFeedback ? t('copied') : `📋 ${t('copy')}`}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleCopyLatex}
          style={[styles.actionBtn, { borderColor: theme.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('copyLatex')}
        >
          <Text style={[styles.actionText, { color: theme.text }]}>{latexFeedback ? t('latexCopied') : `🔢 ${t('copyLatex')}`}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => requestExport('pdf', () => setPdfOptionsVisible(true))}
          style={[styles.actionBtn, { borderColor: theme.border }]}
          accessibilityRole="button"
          accessibilityLabel="PDF"
        >
          <Text style={[styles.actionText, { color: theme.text }]}>📄 PDF</Text>
        </TouchableOpacity>
        {result.success && result.steps?.length > 0 && (
          <TouchableOpacity
            onPress={() => requestExport('latex', handleSaveStepsLatex)}
            style={[styles.actionBtn, { borderColor: theme.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('saveStepsLatex')}
          >
            <Text style={[styles.actionText, { color: theme.text }]}>🧾 {t('saveStepsLatex')}</Text>
          </TouchableOpacity>
        )}
        {result.steps?.length > 0 && (
          <TouchableOpacity
            onPress={() => setStepsModalVisible(true)}
            style={[styles.actionBtnPrimary, { backgroundColor: theme.primary }]}
            accessibilityRole="button"
            accessibilityLabel={t('viewStepsFullscreen')}
          >
            <Text style={styles.actionTextPrimary}>🔍 {t('viewStepsFullscreen')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {result.steps?.length > 0 && (
        <StepsModal
          visible={stepsModalVisible}
          onClose={() => setStepsModalVisible(false)}
          result={result}
          operationLabel={operationLabel}
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 14, letterSpacing: 0.1 },
  errorBox: { borderWidth: 1, borderRadius: 12, padding: 14 },
  errorText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  scalarText: { letterSpacing: -0.5 },
  vectorText: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  subheading: { fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },
  matrixScroll: { alignSelf: 'flex-start', maxWidth: '100%' },
  matrixBox: { borderWidth: 1, borderRadius: 12, padding: 6, alignSelf: 'flex-start', marginVertical: 6 },
  matrixRow: { flexDirection: 'row' },
  matrixCell: { minWidth: 42, minHeight: 36, margin: 2, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  matrixCellText: { fontSize: 13, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  actionBtn: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9 },
  actionText: { fontSize: 12, fontWeight: '600' },
  actionBtnPrimary: { borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9 },
  actionTextPrimary: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
