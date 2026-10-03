import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n/useTranslation';

// Short bottom sheet opened by the single PDF button, with Open / Share / Download options.

interface Props {
  visible: boolean;
  onClose: () => void;
  onOpen: () => void;
  onShare: () => void;
  onDownload: () => void;
  theme: AppTheme;
}

export default function PdfOptionsModal({ visible, onClose, onOpen, onShare, onDownload, theme }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  function select(action: () => void) {
    onClose();
    action();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: 28 + insets.bottom },
          ]}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: theme.text }]}>{t('pdfOptionsTitle')}</Text>

          <TouchableOpacity accessibilityRole="button" style={[styles.option, { borderColor: theme.border }]} onPress={() => select(onOpen)}>
            <Text style={styles.optionEmoji}>👁️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.text }]}>{t('openPdf')}</Text>
              <Text style={[styles.optionDesc, { color: theme.textSecondary }]}>{t('openPdfDesc')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity accessibilityRole="button" style={[styles.option, { borderColor: theme.border }]} onPress={() => select(onShare)}>
            <Text style={styles.optionEmoji}>📤</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.text }]}>{t('shareOrPdf')}</Text>
              <Text style={[styles.optionDesc, { color: theme.textSecondary }]}>{t('sharePdfDesc')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity accessibilityRole="button" style={[styles.option, { borderColor: theme.border, marginBottom: 0 }]} onPress={() => select(onDownload)}>
            <Text style={styles.optionEmoji}>⬇️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.text }]}>{t('downloadPdf')}</Text>
              <Text style={[styles.optionDesc, { color: theme.textSecondary }]}>{t('downloadPdfDesc')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.cancelBtn}>
            <Text style={{ color: theme.textSecondary, fontSize: 14, fontWeight: '700' }}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 20, paddingBottom: 28 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#00000022', alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 16 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  optionEmoji: { fontSize: 22 },
  optionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  optionDesc: { fontSize: 12, lineHeight: 16 },
  cancelBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
});
