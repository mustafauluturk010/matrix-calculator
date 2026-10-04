import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, FlatList, Modal, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTheme } from '@/theme/theme';
import { NamedMatrix } from '@/types';
import { useTranslation } from '@/i18n/useTranslation';

// The backdrop is a separate Pressable that does not wrap the content, so FlatList
// scrolling works (same as StepsModal).

interface Props {
  visible: boolean;
  onClose: () => void;
  matrices: NamedMatrix[];
  onSelect: (matrix: NamedMatrix) => void;
  theme: AppTheme;
}

export default function SavedMatrixPickerModal({ visible, onClose, matrices, onSelect, theme }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const listMaxHeight = Math.min(420, SCREEN_HEIGHT * 0.5);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.header, { borderColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>{t('chooseSavedMatrix')}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose}>
              <Text style={{ color: theme.textSecondary, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {matrices.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textSecondary, paddingBottom: insets.bottom }]}>
              {t('noSavedMatrices')}
            </Text>
          ) : (
            <FlatList
              data={matrices}
              keyExtractor={(m) => m.id}
              style={{ maxHeight: listMaxHeight }}
              contentContainerStyle={{ padding: 12, paddingBottom: 12 + insets.bottom }}
              showsVerticalScrollIndicator
              renderItem={({ item }) => (
                <TouchableOpacity accessibilityRole="button"
                  style={[styles.item, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, { color: theme.primary }]}>{item.name}</Text>
                    <Text style={[styles.itemDim, { color: theme.textSecondary }]}>
                      {item.rows}x{item.cols}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSecondary, fontSize: 18 }}>›</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, maxHeight: '75%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '800' },
  empty: { padding: 24, textAlign: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  itemName: { fontSize: 15, fontWeight: '800' },
  itemDim: { fontSize: 12, marginTop: 2 },
});
