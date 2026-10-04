import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppTheme } from '@/theme/theme';
import { MatrixData } from '@/types';
import { createEmptyMatrix } from '@/utils/matrixUtils';
import { useTranslation } from '@/i18n/useTranslation';
import {
  sanitizeFractionalInputText,
  parseFractionalInput,
  parseComplexRealPart,
  numberToInputText,
} from '@/utils/numberFormat';

interface MatrixInputProps {
  label: string;
  rows: number;
  cols: number;
  value: MatrixData;
  onChange: (data: MatrixData) => void;
  /** Hücrelerin ham giriş metni her değiştiğinde bildirilir (yazma, boyut değişimi, yükleme).
   * Sembolik motor, √2 / pi/2 gibi girişleri tam hesaplamak için sayısal `value` yerine bunlara
   * ihtiyaç duyar. */
  onTextsChange?: (texts: string[][]) => void;
  theme: AppTheme;
  editable?: boolean;
  /**
   * When this changes (e.g. a saved matrix or history entry is loaded), the component
   * resyncs with `value`. It stays constant while typing so outside data does not
   * overwrite the input (e.g. a trailing "." in "1.").
   */
  syncKey?: string | number;
  complexMode?: boolean;
  /**
   * On syncKey change, if the dimensions match, these raw texts are used instead of
   * `value`; the imaginary part of complex entries only exists in the text.
   */
  syncTexts?: string[][];
}

/**
 * Text to write back into a cell. Keeps the user's existing text if it represents the same
 * number ("0.5" is not turned into "1/2"); otherwise formats it readably ("1/3", "pi/2", "2.75").
 */
function cellTextFor(v: number | undefined, previous?: string, complex = false): string {
  if (v === undefined) return '0';
  if (previous !== undefined) {
    // Karmaşık modda `value` hücrenin GERÇEL kısmıdır: "3+2i" (gerçel kısım 3) korunur.
    const parsed = complex ? parseComplexRealPart(previous) : parseFractionalInput(previous);
    if (Math.abs(parsed - v) <= 1e-12 * Math.max(1, Math.abs(v))) return previous;
  }
  return numberToInputText(v);
}

export default function MatrixInput({
  label,
  rows,
  cols,
  value,
  onChange,
  onTextsChange,
  theme,
  editable = true,
  syncKey,
  complexMode = false,
  syncTexts,
}: MatrixInputProps) {
  const parseCell = complexMode ? parseComplexRealPart : parseFractionalInput;
  const { t } = useTranslation();
  // Her hücre için ham metin state'i tutulur (kullanıcı "-", "." gibi
  // ara karakterler yazarken sayısal parse hatası yaşanmasın diye)
  const [cellText, setCellText] = useState<string[][]>(() =>
    createEmptyMatrix(rows, cols).map((row, i) =>
      row.map((_, j) => cellTextFor(value[i]?.[j], undefined, complexMode))
    )
  );

  const inputRefs = useRef<Array<Array<TextInput | null>>>([]);
  // Son odaklanılan hücre: π / √ / i düğmeleri buraya ekler.
  const [lastFocus, setLastFocus] = useState<{ i: number; j: number } | null>(null);
  // Her hücrenin son bilinen imleç/seçim aralığı. Her karakter yazımında yeniden render
  // tetiklemesin diye state değil ref; sembol düğmeleri metnin sonuna değil bu konuma ekler.
  const selectionRef = useRef<Record<string, { start: number; end: number }>>({});
  // Sembol eklendikten sonra imleci sembolün hemen ardına taşımak için tek seferlik zorlanmış
  // seçim. Kısa süre sonra temizlenir: `selection` prop'unu sürekli kontrollü tutmak React
  // Native'de OS'un kendi imleç hareketiyle çakışır.
  const [pendingSelection, setPendingSelection] = useState<{ i: number; j: number; pos: number } | null>(null);

  useEffect(() => {
    onTextsChange?.(cellText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellText]);

  useEffect(() => {
    if (!pendingSelection) return;
    const t = setTimeout(() => setPendingSelection(null), 50);
    return () => clearTimeout(t);
  }, [pendingSelection]);

  function insertSymbol(symbol: 'pi' | '√' | 'i') {
    if (!lastFocus || lastFocus.i >= rows || lastFocus.j >= cols) return;
    const { i, j } = lastFocus;
    const current = cellText[i]?.[j] ?? '';
    const isPlaceholder = current === '0';
    const text = isPlaceholder ? '' : current;
    const sel = selectionRef.current[`${i}-${j}`];
    const start = isPlaceholder ? 0 : Math.min(Math.max(sel?.start ?? text.length, 0), text.length);
    const end = isPlaceholder ? 0 : Math.min(Math.max(sel?.end ?? text.length, 0), text.length);
    const next = text.slice(0, start) + symbol + text.slice(end);
    handleCellChange(next, i, j);
    const pos = start + symbol.length;
    selectionRef.current[`${i}-${j}`] = { start: pos, end: pos };
    setPendingSelection({ i, j, pos });
    inputRefs.current[i]?.[j]?.focus();
  }

  useEffect(() => {
    // Rebuild the grid from the external matrix state (`value`) when the size changes, so the
    // displayed text always matches the state used in calculations.
    setCellText((prev) =>
      Array.from({ length: rows }, (_, i) =>
        Array.from({ length: cols }, (_, j) => cellTextFor(value[i]?.[j], prev[i]?.[j], complexMode))
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols]);

  useEffect(() => {
    if (syncKey === undefined) return;
    const useTexts =
      syncTexts !== undefined && syncTexts.length === rows && syncTexts.every((r) => r.length === cols);
    setCellText(
      Array.from({ length: rows }, (_, i) =>
        Array.from({ length: cols }, (_, j) =>
          useTexts ? sanitizeFractionalInputText(syncTexts![i][j], complexMode) : cellTextFor(value[i]?.[j], undefined, complexMode)
        )
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  function handleCellChange(text: string, i: number, j: number) {
    // Karakter filtreleme ve kesir/ondalık ayrıştırma numberFormat.ts'te paylaşılır
    // (skaler ve b vektörü alanlarıyla aynı davranış).
    const sanitized = sanitizeFractionalInputText(text, complexMode);
    const newCellText = cellText.map((row) => [...row]);
    newCellText[i][j] = sanitized;
    setCellText(newCellText);

    const newData = createEmptyMatrix(rows, cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const raw = r === i && c === j ? sanitized : newCellText[r][c];
        newData[r][c] = parseCell(raw);
      }
    }
    onChange(newData);
  }

  function focusNext(i: number, j: number) {
    const nextJ = j + 1 < cols ? j + 1 : 0;
    const nextI = j + 1 < cols ? i : i + 1;
    if (nextI < rows) {
      inputRefs.current[nextI]?.[nextJ]?.focus();
    }
  }

  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.container}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={cols > 4}>
        <View style={[styles.matrixWrapper, { borderColor: theme.border }]}>
          {Array.from({ length: rows }).map((_, i) => (
            <View key={`row-${i}`} style={styles.row}>
              {Array.from({ length: cols }).map((_, j) => {
                if (!inputRefs.current[i]) inputRefs.current[i] = [];
                return (
                  <TextInput
                    key={`cell-${i}-${j}`}
                    ref={(ref) => {
                      inputRefs.current[i][j] = ref;
                    }}
                    style={[
                      styles.cell,
                      complexMode && styles.cellWide,
                      {
                        backgroundColor: theme.cellBackground,
                        borderColor: theme.cellBorder,
                        color: theme.text,
                      },
                    ]}
                    value={cellText[i]?.[j] ?? '0'}
                    editable={editable}
                    keyboardType="default"
                    returnKeyType="next"
                    selectTextOnFocus
                    onChangeText={(t) => handleCellChange(t, i, j)}
                    onSelectionChange={(e) => {
                      selectionRef.current[`${i}-${j}`] = e.nativeEvent.selection;
                    }}
                    selection={pendingSelection && pendingSelection.i === i && pendingSelection.j === j ? { start: pendingSelection.pos, end: pendingSelection.pos } : undefined}
                    onFocus={() => setLastFocus({ i, j })}
                    onSubmitEditing={() => focusNext(i, j)}
                    placeholder="0"
                    placeholderTextColor={theme.textSecondary}
                    accessibilityLabel={`${label} ${t('rowLabel')} ${i + 1} ${t('colLabel')} ${j + 1}`}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      {editable && (
        <View style={styles.symbolRow}>
          {((complexMode ? ['pi', '√', 'i'] : ['pi', '√']) as ('pi' | '√' | 'i')[]).map((sym) => (
            <TouchableOpacity
              key={sym}
              disabled={!lastFocus}
              onPress={() => insertSymbol(sym)}
              style={[styles.symbolBtn, { borderColor: theme.border, opacity: lastFocus ? 1 : 0.4 }]}
              accessibilityRole="button"
              accessibilityLabel={sym === 'pi' ? t('insertPiA11y') : sym === '√' ? t('insertSqrtA11y') : t('insertIA11y')}
            >
              <Text style={[styles.symbolBtnText, { color: theme.text }]}>{sym === 'pi' ? 'π' : sym}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  symbolRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  symbolBtn: {
    minWidth: 40,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    paddingHorizontal: 10,
  },
  symbolBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  matrixWrapper: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
  },
  row: {
    flexDirection: 'row',
  },
  cellWide: {
    width: 72,
  },
  cell: {
    width: 44,
    height: 36,
    margin: 2,
    borderRadius: 7,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 2,
    paddingVertical: 0,
  },
});
