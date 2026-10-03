jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
import { useAppStore } from '../useAppStore';

describe('Kayıtlı matrisler: karmaşık ham metinler', () => {
  beforeEach(() => useAppStore.setState({ savedMatrices: [] }));

  test('metinlerle kaydedilir; düzenlemede eski metinler ATILIR (veriyle çelişmesin)', () => {
    const s = useAppStore.getState();
    s.addSavedMatrix('C', 1, 2, [[1, 0]], [['1+i', '2i']]);
    const id = useAppStore.getState().savedMatrices[0].id;
    expect(useAppStore.getState().savedMatrices[0].texts).toEqual([['1+i', '2i']]);

    // Gerçel düzenleme (metin verilmedi): eski karmaşık metinler kalmamalı
    useAppStore.getState().updateSavedMatrix(id, 1, 2, [[5, 6]]);
    const after = useAppStore.getState().savedMatrices[0];
    expect(after.data).toEqual([[5, 6]]);
    expect(after.texts).toBeUndefined();

    // Karmaşık düzenleme (yeni metin)
    useAppStore.getState().updateSavedMatrix(id, 1, 2, [[3, 0]], [['3+2i', '0']]);
    expect(useAppStore.getState().savedMatrices[0].texts).toEqual([['3+2i', '0']]);
  });

  test('gerçel matris metinsiz kaydedilir (eski davranış)', () => {
    useAppStore.getState().addSavedMatrix('R', 1, 1, [[2]]);
    expect(useAppStore.getState().savedMatrices[0]).not.toHaveProperty('texts');
  });

  test('karmaşık mod ayarı açılıp kapanır', () => {
    useAppStore.getState().setComplexMode(true);
    expect(useAppStore.getState().complexMode).toBe(true);
    useAppStore.getState().setComplexMode(false);
    expect(useAppStore.getState().complexMode).toBe(false);
  });
});
