import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Modal, ActivityIndicator } from 'react-native';
import { AppTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n/useTranslation';
import type { AdPlacement } from '@/services/rewardedAdManager';

// Asks whether the user wants to watch a short ad before the PDF / LaTeX export;
// shows a loading indicator while the ad is being shown.

interface Props {
  visible: boolean;
  loading: boolean;
  placement?: AdPlacement;
  onConfirm: () => void;
  onDecline: () => void;
  theme: AppTheme;
}

export default function AdGateModal({ visible, loading, placement = 'pdf', onConfirm, onDecline, theme }: Props) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDecline}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={loading ? undefined : onDecline} />
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={styles.emoji}>🎬</Text>
          <Text style={[styles.title, { color: theme.text }]}>{t('adGateTitle')}</Text>
          <Text style={[styles.desc, { color: theme.textSecondary }]}>{t(placement === 'latex' ? 'adGateDescLatex' : 'adGateDesc')}</Text>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>{t('adPreparing')}</Text>
            </View>
          ) : (
            <View style={styles.buttonsRow}>
              <TouchableOpacity onPress={onDecline} style={[styles.btnOutline, { borderColor: theme.border }]}>
                <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 14 }}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onConfirm} style={[styles.btnPrimary, { backgroundColor: theme.primary }]}>
                <Text style={styles.btnPrimaryText}>▶ {t('watchAd')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, borderWidth: 1, borderRadius: 20, padding: 22, alignItems: 'center' },
  emoji: { fontSize: 34, marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  desc: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 18 },
  buttonsRow: { flexDirection: 'row', gap: 10, width: '100%' },
  btnOutline: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnPrimary: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  loadingText: { fontSize: 13, fontWeight: '600' },
});
