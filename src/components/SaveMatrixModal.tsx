import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, TextInput, Modal } from 'react-native';
import { AppTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n/useTranslation';

// Opened from the Save button on the A/B matrix cards; asks for a short name and adds the
// matrix to the saved matrices list. The backdrop is a sibling Pressable that does not wrap
// the content (same as StepsModal).

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  theme: AppTheme;
}

export default function SaveMatrixModal({ visible, onClose, onSave, theme }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t('saveMatrixTitle')}</Text>
          <TextInput
            autoFocus
            placeholder={t('matrixNamePlaceholder')}
            placeholderTextColor={theme.textSecondary}
            value={name}
            onChangeText={setName}
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.cellBackground }]}
            onSubmitEditing={handleSave}
          />
          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" style={[styles.btnOutline, { borderColor: theme.border }]} onPress={onClose}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={[styles.btnPrimary, { backgroundColor: theme.primary }]} onPress={handleSave}>
              <Text style={styles.btnPrimaryText}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, borderWidth: 1, borderRadius: 18, padding: 20 },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 10 },
  btnOutline: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnPrimary: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
});
