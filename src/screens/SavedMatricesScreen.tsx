import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTheme } from '@/theme/theme';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n/useTranslation';
import DimensionPicker from '@/components/DimensionPicker';
import MatrixInput from '@/components/MatrixInput';
import { createEmptyMatrix } from '@/utils/matrixUtils';
import { numberToInputText } from '@/utils/numberFormat';
import { hasImaginaryUnit } from '@/utils/symbolic';
import { MatrixData, NamedMatrix } from '@/types';

export default function SavedMatricesScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const themeMode = useAppStore((s) => s.themeMode);
  const theme = getTheme(themeMode);
  const { t } = useTranslation();
  const savedMatrices = useAppStore((s) => s.savedMatrices);
  const addSavedMatrix = useAppStore((s) => s.addSavedMatrix);
  const updateSavedMatrix = useAppStore((s) => s.updateSavedMatrix);
  const removeSavedMatrix = useAppStore((s) => s.removeSavedMatrix);
  const requestLoadSavedMatrix = useAppStore((s) => s.requestLoadSavedMatrix);
  const complexMode = useAppStore((s) => s.complexMode);
  const setComplexMode = useAppStore((s) => s.setComplexMode);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [data, setData] = useState<MatrixData>(createEmptyMatrix(2, 2));
  const [syncCounter, setSyncCounter] = useState(0);
  // Karmaşık girişli matrislerde sanal kısım yalnızca ham metinde durur (data = gerçel kısımlar).
  const [texts, setTexts] = useState<string[][]>();
  const [editTexts, setEditTexts] = useState<string[][]>();
  const keepTexts = () => (texts && texts.flat().some(hasImaginaryUnit) ? texts : undefined);

  function handleRowsChange(v: number) {
    setRows(v);
    setData(createEmptyMatrix(v, cols));
    setEditTexts(undefined);
  }
  function handleColsChange(v: number) {
    setCols(v);
    setData(createEmptyMatrix(rows, v));
    setEditTexts(undefined);
  }

  function resetForm() {
    setEditingId(null);
    setName('');
    setRows(2);
    setCols(2);
    setData(createEmptyMatrix(2, 2));
    setEditTexts(undefined);
    setSyncCounter((c) => c + 1);
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(t('nameRequired'), t('nameRequiredDesc'));
      return;
    }
    if (editingId) {
      updateSavedMatrix(editingId, rows, cols, data, keepTexts());
      Alert.alert(t('savedMatrixUpdated'));
    } else {
      addSavedMatrix(trimmed, rows, cols, data, keepTexts());
    }
    resetForm();
  }

  function handleEdit(item: NamedMatrix) {
    setEditingId(item.id);
    setName(item.name);
    setRows(item.rows);
    setCols(item.cols);
    setData(item.data);
    if (item.texts && item.texts.flat().some(hasImaginaryUnit)) setComplexMode(true);
    setEditTexts(item.texts);
    setSyncCounter((c) => c + 1);
  }

  function handleUseInCalculator(item: NamedMatrix) {
    requestLoadSavedMatrix('A', item);
    navigation.navigate('Hesapla');
  }

  return (
    <FlatList
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentContainerStyle={{ paddingTop: 16 + insets.top, paddingHorizontal: 16, paddingBottom: 32 + insets.bottom }}
      ListHeaderComponent={
        <View>
          <Text style={[styles.header, { color: theme.text }]}>{t('savedMatricesTitle')}</Text>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {editingId ? `${t('edit')}: ${name}` : t('saveNewMatrix')}
            </Text>
            <TextInput
              placeholder={t('matrixNamePlaceholder')}
              placeholderTextColor={theme.textSecondary}
              value={name}
              onChangeText={setName}
              style={[styles.nameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.cellBackground }]}
            />
            <View style={styles.dimRow}>
              <DimensionPicker label={t('rows')} value={rows} onChange={handleRowsChange} theme={theme} />
              <DimensionPicker label={t('cols')} value={cols} onChange={handleColsChange} theme={theme} />
            </View>
            <MatrixInput
              label={t('values')}
              rows={rows}
              cols={cols}
              value={data}
              onChange={setData}
              onTextsChange={setTexts}
              theme={theme}
              syncKey={syncCounter}
              complexMode={complexMode}
              syncTexts={editTexts}
            />
            <View style={styles.formActions}>
              {editingId && (
                <TouchableOpacity accessibilityRole="button" style={[styles.cancelBtn, { borderColor: theme.border }]} onPress={resetForm}>
                  <Text style={{ color: theme.text, fontWeight: '700' }}>{t('cancel')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity accessibilityRole="button" style={[styles.saveBtn, { backgroundColor: theme.primary }]} onPress={handleSave}>
                <Text style={styles.saveBtnText}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.listTitle, { color: theme.text }]}>{t('myRecords')} ({savedMatrices.length})</Text>
        </View>
      }
      data={savedMatrices}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={[styles.savedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.savedCardHeader}>
            <Text style={[styles.savedName, { color: theme.primary }]}>{item.name}</Text>
            <Text style={[styles.savedDim, { color: theme.textSecondary }]}>{item.rows}x{item.cols}</Text>
          </View>
          <View style={styles.matrixPreview}>
            {item.data.map((row, i) => (
              <Text key={i} style={{ color: theme.textSecondary, fontSize: 12 }}>
                [{(item.texts?.[i] ?? row.map((v) => numberToInputText(v))).join(', ')}]
              </Text>
            ))}
          </View>
          <View style={styles.savedActions}>
            <TouchableOpacity accessibilityRole="button"
              onPress={() => handleUseInCalculator(item)}
              style={[styles.savedActionBtnPrimary, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.savedActionPrimaryText}>🧮 {t('useInCalculator')}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => handleEdit(item)} style={[styles.savedActionBtn, { borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{t('edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => removeSavedMatrix(item.id)} style={[styles.savedActionBtn, { borderColor: theme.border }]}>
              <Text style={{ color: theme.danger, fontWeight: '700' }}>{t('delete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 16 }}>
          {t('noSavedMatrices')}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { fontSize: 25, fontWeight: '800', marginBottom: 18, letterSpacing: -0.3 },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  nameInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 10 },
  dimRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 8 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  saveBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  listTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  savedCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  savedCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  savedName: { fontSize: 16, fontWeight: '800' },
  savedDim: { fontSize: 12 },
  matrixPreview: { paddingLeft: 4, marginBottom: 10 },
  savedActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  savedActionBtnPrimary: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  savedActionPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  savedActionBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
});
