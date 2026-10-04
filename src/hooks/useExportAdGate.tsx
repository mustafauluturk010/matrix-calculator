import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { AppTheme } from '@/theme/theme';
import { useTranslation } from '@/i18n/useTranslation';
import AdGateModal from '@/components/AdGateModal';
import {
  AdPlacement,
  isRewardedAdReady,
  preloadRewardedAd,
  showRewardedAd,
} from '@/services/rewardedAdManager';

// Dışa aktarma (PDF / LaTeX) için "soft gate" Rewarded reklam kapısı:
//   reklam hazır -> "Reklamı izle?" -> ödül kazanılırsa dışa aktar
//   reklam hazır değil / yüklenemedi / gösterilemedi / AdMob hatası -> atla, doğrudan dışa aktar
//   reklam ödül kazanılmadan kapatıldı -> dışa aktarma yapılmaz, kullanıcı bilgilendirilir

interface Pending {
  placement: AdPlacement;
  action: () => void | Promise<void>;
}

export function useExportAdGate(theme: AppTheme) {
  const { t } = useTranslation();
  const [confirmPlacement, setConfirmPlacement] = useState<AdPlacement | null>(null);
  const [showing, setShowing] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  const busyRef = useRef(false); // bir dışa aktarma akışı sürerken yeni istek kabul edilmez
  const showingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Dışa aktarma eylemini çalıştırır; eylem hata verse bile kilit mutlaka açılır.
  const runAction = useCallback(async (action: () => void | Promise<void>) => {
    try {
      await action();
    } catch {
      // Eylemlerin kendi hata mesajları vardır; buradaki amaç yalnızca çökmeyi ve kilitlenmeyi önlemek.
    } finally {
      busyRef.current = false;
    }
  }, []);

  const requestExport = useCallback(
    (placement: AdPlacement, action: () => void | Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = true;

      let ready = false;
      try {
        ready = isRewardedAdReady(placement);
      } catch {
        ready = false;
      }

      if (!ready) {
        // Reklam yok -> beklemeden doğrudan dışa aktar; sonraki sefer için reklamı arka planda yükle.
        try {
          preloadRewardedAd(placement);
        } catch {
          // yoksay
        }
        void runAction(action);
        return;
      }

      pendingRef.current = { placement, action };
      setConfirmPlacement(placement);
    },
    [runAction]
  );

  const handleConfirm = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || showingRef.current) return;
    showingRef.current = true;
    setShowing(true);

    let outcome: Awaited<ReturnType<typeof showRewardedAd>> = 'unavailable';
    try {
      outcome = await showRewardedAd(pending.placement);
    } catch {
      outcome = 'unavailable';
    }

    showingRef.current = false;
    pendingRef.current = null;
    if (mountedRef.current) {
      setShowing(false);
      setConfirmPlacement(null);
    }

    if (outcome === 'earned' || outcome === 'unavailable') {
      // earned: ödül kazanıldı. unavailable: reklam gösterilemedi -> kullanıcıyı bekletmeden dışa aktar.
      await runAction(pending.action);
      return;
    }

    busyRef.current = false;
    if (outcome === 'dismissed') {
      const latex = pending.placement === 'latex';
      Alert.alert(
        t('adNotCompletedTitle'),
        t(latex ? 'adNotCompletedDescLatex' : 'adNotCompletedDesc')
      );
    }
    // outcome === 'busy': başka bir reklam gösteriliyor; bu istek sessizce bırakılır.
  }, [runAction, t]);

  const handleDecline = useCallback(() => {
    if (showingRef.current) return; // reklam gösterilirken geri tuşu akışı bozmasın
    pendingRef.current = null;
    busyRef.current = false;
    setConfirmPlacement(null);
  }, []);

  const adGateElement = (
    <AdGateModal
      visible={confirmPlacement !== null}
      loading={showing}
      placement={confirmPlacement ?? 'pdf'}
      onConfirm={handleConfirm}
      onDecline={handleDecline}
      theme={theme}
    />
  );

  return { requestExport, adGateElement };
}
