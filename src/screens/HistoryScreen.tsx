import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTheme } from '@/theme/theme';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from '@/i18n/useTranslation';
import HistoryDetailModal from '@/components/HistoryDetailModal';
import { HistoryEntry } from '@/types';
import { formatNumber, formatNumberWithRadical, NumberDisplayMode } from '@/utils/numberFormat';

// Normal mode: each history entry opens HistoryDetailModal. Select mode shows checkboxes with
// "select all" and "delete selected" for bulk actions.

// Formats eigenvalues/eigenvectors with the current display mode and prefers radical
// expressions when available, so the list matches the detail screen.
function summarizeResult(entry: HistoryEntry, t: (k: any) => string, mode: NumberDisplayMode): string {
  const r = entry.result;
  const fmt = (v: number) => formatNumber(v, mode);
  const fmtR = (v: number) => formatNumberWithRadical(v, mode);
  if (!r.success) return `${t('resultTitle')}: ${r.errorMessage}`;
  if (r.scalarResult !== undefined) return `${t('resultTitle')}: ${r.scalarResultLabel ?? fmt(r.scalarResult)}`;
  if (r.vectorResult) return `x = [${r.vectorResult.map((v, i) => r.vectorResultLabels?.[i] ?? fmt(v)).join(', ')}]`;
  if (r.matrixResult) return `${r.matrixResult.length}x${r.matrixResult[0].length}`;
  if (r.eigenResult) {
    const eigenResult = r.eigenResult;
    const lambdas = `λ = [${(eigenResult.radicalExpressions ?? eigenResult.eigenvalues.map(fmtR)).join(', ')}]`;
    const vecs = eigenResult.eigenvectors
      .map((v, i) => `v${i + 1}=[${(eigenResult.eigenvectorRadicals?.[i] ?? v.map(fmtR)).join(',')}]`)
      .join(' ');
    return `${lambdas}\n${vecs}`;
  }
  if (r.luResult) return 'L, U';
  return '✓';
}

export default function HistoryScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const themeMode = useAppStore((s) => s.themeMode);
  const theme = getTheme(themeMode);
  const numberDisplayMode = useAppStore((s) => s.numberDisplayMode);
  // Subscribed only to trigger a re-render: summarizeResult reads decimalPlaces from
  // displaySettings.ts at module level, but Zustand re-renders only for subscribed fields.
  // Without this, the list keeps the old precision after the setting changes.
  useAppStore((s) => s.decimalPlaces);
  const { t } = useTranslation();
  const history = useAppStore((s) => s.history);
  const clearHistory = useAppStore((s) => s.clearHistory);
  const removeHistoryEntry = useAppStore((s) => s.removeHistoryEntry);
  const removeHistoryEntries = useAppStore((s) => s.removeHistoryEntries);
  const requestLoadHistoryEntry = useAppStore((s) => s.requestLoadHistoryEntry);

  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  // Arama: işlem adı, girdi özeti ve SONUÇ özeti içinde (büyük/küçük harf duyarsız).
  // Bilerek useMemo YOK: summarizeResult dil, gösterim modu ve ondalık basamak
  // ayarına bağlı; liste ≤100 kayıt olduğundan her render'da hesaplamak ucuz ve
  // eski-ayar (stale) riskini ortadan kaldırır.
  const q = query.trim().toLowerCase();
  const visibleHistory = q
    ? history.filter((h) =>
        `${h.operationLabel} ${h.inputSummary} ${summarizeResult(h, t, numberDisplayMode)}`.toLowerCase().includes(q)
      )
    : history;

  function confirmClear() {
    Alert.alert(t('clearHistoryTitle'), t('clearHistoryDesc'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('clear'), style: 'destructive', onPress: clearHistory },
    ]);
  }

  function handleEdit(entry: HistoryEntry) {
    requestLoadHistoryEntry(entry);
    setSelectedEntry(null);
    navigation.navigate('Hesapla');
  }

  function toggleSelectMode() {
    setSelectMode((s) => !s);
    setSelectedIds(new Set());
  }

  function toggleItemSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAllToggle() {
    if (visibleHistory.length > 0 && selectedIds.size === visibleHistory.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleHistory.map((h) => h.id)));
    }
  }

  function confirmDeleteSelected() {
    if (selectedIds.size === 0) return;
    Alert.alert(
      t('deleteSelectedTitle'),
      `${selectedIds.size} ${t('deleteSelectedDescSuffix')}`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            removeHistoryEntries(Array.from(selectedIds));
            setSelectedIds(new Set());
            setSelectMode(false);
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={[styles.headerRow, { paddingTop: 18 + insets.top }]}>
        <Text style={[styles.header, { color: theme.text }]}>{t('historyTitle')}</Text>
        {history.length > 0 && (
          <View style={styles.headerActions}>
            {selectMode ? (
              <TouchableOpacity accessibilityRole="button" onPress={toggleSelectMode}>
                <Text style={[styles.headerActionText, { color: theme.textSecondary }]}>{t('cancelSelection')}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity accessibilityRole="button" onPress={toggleSelectMode} style={{ marginRight: 16 }}>
                  <Text style={[styles.headerActionText, { color: theme.primary }]}>{t('selectMode')}</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" onPress={confirmClear}>
                  <Text style={[styles.headerActionText, { color: theme.danger }]}>{t('clear')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      {selectMode && (
        <View style={[styles.selectBar, { borderColor: theme.border }]}>
          <TouchableOpacity accessibilityRole="button" onPress={handleSelectAllToggle}>
            <Text style={[styles.selectBarText, { color: theme.primary }]}>
              {visibleHistory.length > 0 && selectedIds.size === visibleHistory.length ? t('deselectAll') : t('selectAll')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.selectBarCount, { color: theme.textSecondary }]}>
            {selectedIds.size} {t('itemsSelectedSuffix')}
          </Text>
        </View>
      )}

      {history.length > 0 && (
        <View style={[styles.searchRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setSelectedIds(new Set()); // görünmeyen kayıtlar seçili kalıp yanlışlıkla silinmesin
            }}
            placeholder={t('searchHistory')}
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel={t('searchHistory')}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('clearSearch')}
              onPress={() => {
                setQuery('');
                setSelectedIds(new Set());
              }}
            >
              <Text style={[styles.searchClear, { color: theme.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('emptyHistory')}</Text>
        </View>
      ) : visibleHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{t('noSearchResults')}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleHistory}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: selectMode ? 90 + insets.bottom : 32 + insets.bottom }}
          renderItem={({ item }) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <TouchableOpacity
                onPress={() => (selectMode ? toggleItemSelected(item.id) : setSelectedEntry(item))}
                onLongPress={() => {
                  if (!selectMode) {
                    setSelectMode(true);
                    toggleItemSelected(item.id);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`${item.operationLabel}, ${new Date(item.timestamp).toLocaleString()}`}
                accessibilityState={selectMode ? { selected: isSelected } : undefined}
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: isSelected ? theme.primary : theme.border },
                  isSelected && { borderWidth: 2 },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    {selectMode && (
                      <View
                        style={[
                          styles.checkbox,
                          { borderColor: isSelected ? theme.primary : theme.border, backgroundColor: isSelected ? theme.primary : 'transparent' },
                        ]}
                      >
                        {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
                      </View>
                    )}
                    <Text style={[styles.opLabel, { color: theme.primary }]}>{item.operationLabel}</Text>
                  </View>
                  <Text style={[styles.time, { color: theme.textSecondary }]}>
                    {new Date(item.timestamp).toLocaleString()}
                  </Text>
                </View>
                <Text style={[styles.inputSummary, { color: theme.textSecondary }]}>{item.inputSummary}</Text>
                <Text style={[styles.resultSummary, { color: item.result.success ? theme.text : theme.danger }]}>
                  {summarizeResult(item, t, numberDisplayMode)}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {selectMode && selectedIds.size > 0 && (
        <View
          style={[
            styles.deleteBar,
            { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: 14 + insets.bottom },
          ]}
        >
          <TouchableOpacity accessibilityRole="button" style={[styles.deleteBarBtn, { backgroundColor: theme.danger }]} onPress={confirmDeleteSelected}>
            <Text style={styles.deleteBarBtnText}>🗑 {t('deleteSelected')} ({selectedIds.size})</Text>
          </TouchableOpacity>
        </View>
      )}

      <HistoryDetailModal
        visible={!!selectedEntry}
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        onEdit={handleEdit}
        onDelete={removeHistoryEntry}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  searchClear: { fontSize: 16, paddingLeft: 10, paddingVertical: 6 },
  screen: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, paddingBottom: 8 },
  header: { fontSize: 25, fontWeight: '800', letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerActionText: { fontSize: 14, fontWeight: '700' },
  selectBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1 },
  selectBarText: { fontSize: 13, fontWeight: '700' },
  selectBarCount: { fontSize: 12, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 7,
    elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxTick: { color: '#fff', fontSize: 12, fontWeight: '800' },
  opLabel: { fontSize: 14, fontWeight: '700' },
  time: { fontSize: 11 },
  inputSummary: { fontSize: 12, marginBottom: 4 },
  resultSummary: { fontSize: 14, fontWeight: '600' },
  deleteBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, borderTopWidth: 1 },
  deleteBarBtn: { borderRadius: 13, paddingVertical: 14, alignItems: 'center' },
  deleteBarBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
