import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTheme } from '@/theme/theme';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n/useTranslation';
import MatrixInput from '@/components/MatrixInput';
import DimensionPicker from '@/components/DimensionPicker';
import OperationSelector, { getOperationConfig } from '@/components/OperationSelector';
import ResultDisplay from '@/components/ResultDisplay';
import SavedMatrixPickerModal from '@/components/SavedMatrixPickerModal';
import SaveMatrixModal from '@/components/SaveMatrixModal';
import { MatrixData, OperationResult, OperationType, HistoryEntry, NamedMatrix, LanguageCode } from '@/types';
import { NumberDisplayMode, sanitizeFractionalInputText, parseFractionalInput, parseComplexRealPart } from '@/utils/numberFormat';
import { hasImaginaryUnit } from '@/utils/symbolic';
import { createEmptyMatrix, resizeMatrix } from '@/utils/matrixUtils';
import { runOperation } from '@/utils/runOperation';

// runOperation saf (React Native'den bağımsız) bir modüle taşındı ki test
// edilebilsin; HistoryDetailModal gibi mevcut içe aktarmalar bozulmasın diye
// buradan da dışa aktarılmaya devam ediyor.
export { runOperation };

export default function CalculatorScreen() {
  const themeMode = useAppStore((s) => s.themeMode);
  const language = useAppStore((s) => s.language);
  const numberDisplayMode = useAppStore((s) => s.numberDisplayMode);
  const decimalPlaces = useAppStore((s) => s.decimalPlaces);
  const complexMode = useAppStore((s) => s.complexMode);
  const setComplexMode = useAppStore((s) => s.setComplexMode);
  const addHistoryEntry = useAppStore((s) => s.addHistoryEntry);
  const savedMatrices = useAppStore((s) => s.savedMatrices);
  const addSavedMatrix = useAppStore((s) => s.addSavedMatrix);
  const pendingLoadMatrix = useAppStore((s) => s.pendingLoadMatrix);
  const pendingLoadEntry = useAppStore((s) => s.pendingLoadEntry);
  const clearPendingLoad = useAppStore((s) => s.clearPendingLoad);
  const theme = getTheme(themeMode);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  // Skaler / b vektörü / matris hücrelerinin sayısal değeri: karmaşık modda GERÇEL kısım.
  const parseNum = complexMode ? parseComplexRealPart : parseFractionalInput;

  const [rowsA, setRowsA] = useState(2);
  const [colsA, setColsA] = useState(2);
  const [rowsB, setRowsB] = useState(2);
  const [colsB, setColsB] = useState(2);

  const [matrixA, setMatrixA] = useState<MatrixData>(createEmptyMatrix(2, 2));
  const [matrixB, setMatrixB] = useState<MatrixData>(createEmptyMatrix(2, 2));
  // Hücrelerin ham giriş metni (MatrixInput bildirir) - sembolik motor için.
  const [textsA, setTextsA] = useState<string[][]>();
  const [textsB, setTextsB] = useState<string[][]>();
  // Kayıtlı matris / geçmişten yüklenirken karmaşık girişlerin ham metni (sanal kısım yalnız metinde).
  const [loadTextsA, setLoadTextsA] = useState<string[][]>();
  const [loadTextsB, setLoadTextsB] = useState<string[][]>();
  const [scalar, setScalar] = useState('2');
  const [exponent, setExponent] = useState('2');
  const [vectorBText, setVectorBText] = useState<string[]>(['0', '0']);
  const [linearMethod, setLinearMethod] = useState<'cramer' | 'gauss'>('gauss');

  const [operation, setOperation] = useState<OperationType>('determinant');
  const [result, setResult] = useState<OperationResult | null>(null);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'A' | 'B'>('A');
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveTarget, setSaveTarget] = useState<'A' | 'B'>('A');
  const [savedFeedback, setSavedFeedback] = useState<'A' | 'B' | null>(null);
  const [resetFeedbackA, setResetFeedbackA] = useState(false);
  const [resetFeedbackB, setResetFeedbackB] = useState(false);

  const [syncCounterA, setSyncCounterA] = useState(0);
  const [syncCounterB, setSyncCounterB] = useState(0);

  const config = useMemo(() => getOperationConfig(operation), [operation]);

  useEffect(() => {
    if (pendingLoadMatrix) {
      const { target, matrix } = pendingLoadMatrix;
      if (matrix.texts && matrix.texts.flat().some(hasImaginaryUnit)) setComplexMode(true);
      if (target === 'A') {
        setRowsA(matrix.rows);
        setColsA(matrix.cols);
        setMatrixA(matrix.data);
        setLoadTextsA(matrix.texts);
        setSyncCounterA((c) => c + 1);
      } else {
        setRowsB(matrix.rows);
        setColsB(matrix.cols);
        setMatrixB(matrix.data);
        setLoadTextsB(matrix.texts);
        setSyncCounterB((c) => c + 1);
      }
      clearPendingLoad();
    }
  }, [pendingLoadMatrix]);

  useEffect(() => {
    if (pendingLoadEntry) {
      const entry = pendingLoadEntry;
      setOperation(entry.operation);
      setRowsA(entry.inputs.matrixA.length);
      setColsA(entry.inputs.matrixA[0]?.length ?? 2);
      setMatrixA(entry.inputs.matrixA);
      setRowsB(entry.inputs.matrixB.length);
      setColsB(entry.inputs.matrixB[0]?.length ?? 2);
      setMatrixB(entry.inputs.matrixB);
      setScalar(entry.inputs.scalar);
      setExponent(entry.inputs.exponent);
      setVectorBText(entry.inputs.vectorB);
      setLinearMethod(entry.inputs.linearMethod);
      setResult(entry.result);
      if (entry.inputs.complex) {
        setComplexMode(true);
        setLoadTextsA(entry.inputs.matrixAText);
        setLoadTextsB(entry.inputs.matrixBText);
      } else {
        setLoadTextsA(undefined);
        setLoadTextsB(undefined);
      }
      setSyncCounterA((c) => c + 1);
      setSyncCounterB((c) => c + 1);
      clearPendingLoad();
    }
  }, [pendingLoadEntry]);

  function handleRowsAChange(v: number) {
    setRowsA(v);
    setMatrixA((prev) => resizeMatrix(prev, v, colsA));
    setVectorBText(Array.from({ length: v }, (_, i) => vectorBText[i] ?? '0'));
  }
  function handleColsAChange(v: number) {
    setColsA(v);
    setMatrixA((prev) => resizeMatrix(prev, rowsA, v));
  }
  function handleRowsBChange(v: number) {
    setRowsB(v);
    setMatrixB((prev) => resizeMatrix(prev, v, colsB));
  }
  function handleColsBChange(v: number) {
    setColsB(v);
    setMatrixB((prev) => resizeMatrix(prev, rowsB, v));
  }

  function handleResetMatrix(target: 'A' | 'B') {
    if (target === 'A') {
      setRowsA(2);
      setColsA(2);
      setMatrixA(createEmptyMatrix(2, 2));
      setLoadTextsA(undefined);
      setSyncCounterA((c) => c + 1);
      setResetFeedbackA(true);
      setTimeout(() => setResetFeedbackA(false), 1200);
    } else {
      setRowsB(2);
      setColsB(2);
      setMatrixB(createEmptyMatrix(2, 2));
      setLoadTextsB(undefined);
      setSyncCounterB((c) => c + 1);
      setResetFeedbackB(true);
      setTimeout(() => setResetFeedbackB(false), 1200);
    }
  }

  function openPicker(target: 'A' | 'B') {
    setPickerTarget(target);
    setPickerVisible(true);
  }

  function openSaveModal(target: 'A' | 'B') {
    setSaveTarget(target);
    setSaveModalVisible(true);
  }

  function handleSaveCurrentMatrix(name: string) {
    // Karmaşık girişli matrisin sanal kısmı yalnızca ham metinde durur: metni de kaydet.
    const keepTexts = (texts?: string[][]) => (texts && texts.flat().some(hasImaginaryUnit) ? texts : undefined);
    if (saveTarget === 'A') {
      addSavedMatrix(name, rowsA, colsA, matrixA, keepTexts(textsA));
    } else {
      addSavedMatrix(name, rowsB, colsB, matrixB, keepTexts(textsB));
    }
    setSavedFeedback(saveTarget);
    setTimeout(() => setSavedFeedback(null), 1500);
  }

  function handlePickMatrix(matrix: NamedMatrix) {
    if (matrix.texts && matrix.texts.flat().some(hasImaginaryUnit)) setComplexMode(true);
    if (pickerTarget === 'A') {
      setRowsA(matrix.rows);
      setColsA(matrix.cols);
      setMatrixA(matrix.data);
      setLoadTextsA(matrix.texts);
      setSyncCounterA((c) => c + 1);
    } else {
      setRowsB(matrix.rows);
      setColsB(matrix.cols);
      setMatrixB(matrix.data);
      setLoadTextsB(matrix.texts);
      setSyncCounterB((c) => c + 1);
    }
  }

  // Step descriptions are turned into text at computation time using the display mode, language
  // and decimal places in effect then. When any of these change and a result is on screen,
  // re-run the operation silently (without adding a history entry) so the steps and result
  // follow the new settings.
  useEffect(() => {
    if (!result) return;
    const vectorB = vectorBText.map((tVal) => parseNum(tVal));
    const scalarNum = parseNum(scalar);
    const exponentNum = parseInt(exponent, 10) || 0;
    setResult(
      runOperation(operation, matrixA, matrixB, scalarNum, exponentNum, vectorB, linearMethod, language, numberDisplayMode, {
        A: textsA,
        B: textsB,
        scalar,
        b: vectorBText,
        exponent: exponentNum,
        method: linearMethod,
        complex: complexMode,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  // complexMode is intentionally not a dependency: loading a complex history entry turns the
  // mode on, and this effect would overwrite the result using cell texts that are not updated yet.
  }, [numberDisplayMode, decimalPlaces, language]);

  // When complex mode is turned off, cells may still hold text with an imaginary unit (e.g.
  // "3+2i"). The real parser would silently turn it into 0 on the next edit, so clear those
  // fields right away and notify the user instead.
  const prevComplexMode = useRef(complexMode);
  useEffect(() => {
    const wasOn = prevComplexMode.current;
    prevComplexMode.current = complexMode;
    if (!wasOn || complexMode) return;
    const hasI = (texts?: string[][]) => !!texts?.flat().some(hasImaginaryUnit);
    const aHasI = hasI(textsA);
    const bHasI = hasI(textsB);
    const scalarHasI = hasImaginaryUnit(scalar);
    const vecHasI = vectorBText.some(hasImaginaryUnit);
    if (!aHasI && !bHasI && !scalarHasI && !vecHasI) return;
    if (aHasI) {
      setMatrixA(createEmptyMatrix(rowsA, colsA));
      setTextsA(undefined);
      setLoadTextsA(undefined);
      setSyncCounterA((c) => c + 1);
    }
    if (bHasI) {
      setMatrixB(createEmptyMatrix(rowsB, colsB));
      setTextsB(undefined);
      setLoadTextsB(undefined);
      setSyncCounterB((c) => c + 1);
    }
    if (scalarHasI) setScalar('2');
    if (vecHasI) setVectorBText(vectorBText.map(() => '0'));
    Alert.alert(t('complexClearedTitle'), t('complexClearedDesc'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complexMode]);

  function handleCalculate() {
    const vectorB = vectorBText.map((tVal) => parseNum(tVal));
    const scalarNum = parseNum(scalar);
    const exponentNum = parseInt(exponent, 10) || 0;

    const opResult = runOperation(
      operation,
      matrixA,
      matrixB,
      scalarNum,
      exponentNum,
      vectorB,
      linearMethod,
      language,
      numberDisplayMode,
      { A: textsA, B: textsB, scalar, b: vectorBText, exponent: exponentNum, method: linearMethod, complex: complexMode }
    );
    setResult(opResult);

    // Unique id (timestamp + random part, same pattern as generateId in useAppStore);
    // Date.now() alone can collide on rapid successive calls.
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      operation,
      operationLabel: t(config.labelKey),
      inputSummary: `A: ${rowsA}x${colsA}${config.needsTwoMatrices ? `, B: ${rowsB}x${colsB}` : ''}`,
      result: opResult,
      inputs: { matrixA, matrixB, scalar, exponent, vectorB: vectorBText, linearMethod, matrixAText: textsA, matrixBText: textsB, complex: complexMode || undefined },
    };
    addHistoryEntry(entry);
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, { paddingTop: 18 + insets.top }]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.header, { color: theme.text }]}>{t('appTitle')}</Text>
      </View>

      <TouchableOpacity
        accessibilityRole="switch"
        accessibilityState={{ checked: complexMode }}
        accessibilityLabel={t('complexModeButton')}
        activeOpacity={0.75}
        onPress={() => setComplexMode(!complexMode)}
        style={[
          styles.complexBtn,
          {
            backgroundColor: complexMode ? theme.primary : theme.surface,
            borderColor: theme.primary,
            shadowColor: theme.primary,
          },
        ]}
      >
        <View style={[styles.complexBtnIcon, { backgroundColor: complexMode ? '#FFFFFF33' : theme.primary + '1A' }]}>
          <Text style={[styles.complexBtnIconText, { color: complexMode ? '#FFFFFF' : theme.primary }]}>ℂ</Text>
        </View>
        <Text style={[styles.complexBtnLabel, { color: complexMode ? '#FFFFFF' : theme.primary }]} numberOfLines={1}>
          {t('complexModeButton')}
        </Text>
        <View style={[styles.complexBtnBadge, { backgroundColor: complexMode ? '#FFFFFF' : theme.primary + '1A' }]}>
          <Text style={[styles.complexBtnBadgeText, { color: theme.primary }]}>
            {complexMode ? `✓ ${t('complexBtnOn')}` : t('complexBtnOff')}
          </Text>
        </View>
      </TouchableOpacity>
      {complexMode && <Text style={[styles.complexHintText, { color: theme.textSecondary }]}>{t('complexHint')}</Text>}

      <OperationSelector selected={operation} onSelect={setOperation} theme={theme} complexMode={complexMode} />

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('matrixA')}</Text>
          <View style={[styles.opBadge, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}>
            <Text style={[styles.opBadgeText, { color: theme.primary }]} numberOfLines={1}>
              {t('currentOperation')}: {t(config.labelKey)}
            </Text>
          </View>
        </View>
        <View style={[styles.cardHeaderRow, { marginTop: -2 }]}>
          <View style={styles.cardHeaderActions}>
            <TouchableOpacity accessibilityRole="button" onPress={() => handleResetMatrix('A')} style={[styles.pickBtn, { borderColor: theme.danger + '80' }]}>
              <Text style={[styles.pickBtnText, { color: theme.danger }]}>
                {resetFeedbackA ? t('matrixReset') : `🗑 ${t('resetMatrix')}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => openSaveModal('A')} style={[styles.pickBtn, { borderColor: theme.border }]}>
              <Text style={[styles.pickBtnText, { color: theme.text }]}>
                {savedFeedback === 'A' ? t('matrixSaved') : `💾 ${t('save')}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => openPicker('A')} style={[styles.pickBtn, { borderColor: theme.primary }]}>
              <Text style={[styles.pickBtnText, { color: theme.primary }]}>📂 {t('useSaved')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.dimRow}>
          <DimensionPicker label={t('rows')} value={rowsA} onChange={handleRowsAChange} theme={theme} />
          <DimensionPicker label={t('cols')} value={colsA} onChange={handleColsAChange} theme={theme} />
          <TouchableOpacity
            onPress={() => Alert.alert(t('syntaxHelpTitle'), t('syntaxHelpBody'), [{ text: t('syntaxHelpClose') }])}
            style={styles.helpBtn}
            accessibilityRole="button"
            accessibilityLabel={t('syntaxHelpTitle')}
          >
            <Text style={[styles.helpBtnText, { color: theme.primary, borderColor: theme.primary }]}>?</Text>
          </TouchableOpacity>
        </View>
        <MatrixInput label={t('values')} rows={rowsA} cols={colsA} value={matrixA} onChange={setMatrixA} onTextsChange={setTextsA} theme={theme} syncKey={syncCounterA} complexMode={complexMode} syncTexts={loadTextsA} />
      </View>

      {config.needsTwoMatrices && (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('matrixB')}</Text>
            <View style={styles.cardHeaderActions}>
              <TouchableOpacity accessibilityRole="button" onPress={() => handleResetMatrix('B')} style={[styles.pickBtn, { borderColor: theme.danger + '80' }]}>
                <Text style={[styles.pickBtnText, { color: theme.danger }]}>
                  {resetFeedbackB ? t('matrixReset') : `🗑 ${t('resetMatrix')}`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => openSaveModal('B')} style={[styles.pickBtn, { borderColor: theme.border }]}>
                <Text style={[styles.pickBtnText, { color: theme.text }]}>
                  {savedFeedback === 'B' ? t('matrixSaved') : `💾 ${t('save')}`}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => openPicker('B')} style={[styles.pickBtn, { borderColor: theme.primary }]}>
                <Text style={[styles.pickBtnText, { color: theme.primary }]}>📂 {t('useSaved')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.dimRow}>
            <DimensionPicker label={t('rows')} value={rowsB} onChange={handleRowsBChange} theme={theme} />
            <DimensionPicker label={t('cols')} value={colsB} onChange={handleColsBChange} theme={theme} />
          </View>
          <MatrixInput label={t('values')} rows={rowsB} cols={colsB} value={matrixB} onChange={setMatrixB} onTextsChange={setTextsB} theme={theme} syncKey={syncCounterB} complexMode={complexMode} syncTexts={loadTextsB} />
        </View>
      )}

      {config.needsScalar && (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('scalarValue')}</Text>
          <TextInput
            style={[styles.simpleInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.cellBackground }]}
            keyboardType="default"
            value={scalar}
            onChangeText={(txt) => setScalar(sanitizeFractionalInputText(txt, complexMode))}
          />
        </View>
      )}

      {config.needsExponent && (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('exponentValue')}</Text>
          <TextInput
            style={[styles.simpleInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.cellBackground }]}
            keyboardType="numbers-and-punctuation"
            value={exponent}
            onChangeText={setExponent}
          />
        </View>
      )}

      {config.needsLinearSystem && (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('vectorB')}</Text>
          <View style={styles.vectorRow}>
            {Array.from({ length: rowsA }).map((_, i) => (
              <TextInput
                key={i}
                style={[styles.vectorCell, complexMode && styles.vectorCellWide, { color: theme.text, borderColor: theme.border, backgroundColor: theme.cellBackground }]}
                keyboardType="default"
                selectTextOnFocus
                accessibilityLabel={`${t('vectorB')} ${i + 1}`}
                value={vectorBText[i] ?? '0'}
                onChangeText={(txt) => {
                  const copy = [...vectorBText];
                  copy[i] = sanitizeFractionalInputText(txt, complexMode);
                  setVectorBText(copy);
                }}
              />
            ))}
          </View>
          <View style={styles.methodRow}>
            <TouchableOpacity accessibilityRole="button"
              accessibilityState={{ selected: linearMethod === 'gauss' }}
              onPress={() => setLinearMethod('gauss')}
              style={[styles.methodBtn, { borderColor: theme.border, backgroundColor: linearMethod === 'gauss' ? theme.primary : 'transparent' }]}
            >
              <Text style={{ color: linearMethod === 'gauss' ? '#fff' : theme.text, fontWeight: '600' }}>{t('gaussMethod')}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button"
              accessibilityState={{ selected: linearMethod === 'cramer' }}
              onPress={() => setLinearMethod('cramer')}
              style={[styles.methodBtn, { borderColor: theme.border, backgroundColor: linearMethod === 'cramer' ? theme.primary : 'transparent' }]}
            >
              <Text style={{ color: linearMethod === 'cramer' ? '#fff' : theme.text, fontWeight: '600' }}>{t('cramerMethod')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity accessibilityRole="button" style={[styles.calculateBtn, { backgroundColor: theme.primary }]} onPress={handleCalculate}>
        <Text style={styles.calculateBtnText}>{t('calculate')}</Text>
      </TouchableOpacity>

      <ResultDisplay result={result} operationLabel={t(config.labelKey)} theme={theme} />

      <SavedMatrixPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        matrices={savedMatrices}
        onSelect={handlePickMatrix}
        theme={theme}
      />

      <SaveMatrixModal
        visible={saveModalVisible}
        onClose={() => setSaveModalVisible(false)}
        onSave={handleSaveCurrentMatrix}
        theme={theme}
      />

      <View style={{ height: 76 + insets.bottom }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 18 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  header: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, flex: 1 },
  complexBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  complexBtnIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  complexBtnIconText: { fontSize: 18, fontWeight: '800' },
  complexBtnLabel: { flex: 1, fontSize: 14, fontWeight: '800' },
  complexBtnBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  complexBtnBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  complexHintText: { fontSize: 12, marginTop: -4, marginBottom: 12 },
  opBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '62%' },
  opBadgeText: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardHeaderActions: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1, marginLeft: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 0.1 },
  pickBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  pickBtnText: { fontSize: 11, fontWeight: '700' },
  dimRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  helpBtn: { marginLeft: 10, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  helpBtnText: { fontSize: 14, fontWeight: '700', borderWidth: 1.5, width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 20 },
  simpleInput: { borderWidth: 1, borderRadius: 11, padding: 13, fontSize: 16, fontWeight: '600' },
  vectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  vectorCell: { width: 48, height: 38, borderWidth: 1, borderRadius: 8, textAlign: 'center', fontSize: 14 },
  // Karmaşık modda "3+2i", "(1+i)/2" gibi girişler 48 px'e sığmaz (MatrixInput hücreleri de aynı sebeple 72 px).
  vectorCellWide: { width: 72 },
  methodRow: { flexDirection: 'row', gap: 8 },
  methodBtn: { flex: 1, borderWidth: 1, borderRadius: 11, paddingVertical: 11, alignItems: 'center' },
  calculateBtn: {
    borderRadius: 15,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  calculateBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
});
