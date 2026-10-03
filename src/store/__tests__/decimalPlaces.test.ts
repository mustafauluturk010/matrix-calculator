jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
import { useAppStore } from '../useAppStore';
import { formatNumber, getDecimalPlaces } from '@/utils/numberFormat';

describe('Ondalık basamak ayarı', () => {
  afterEach(() => useAppStore.getState().setDecimalPlaces(6)); // varsayılana dön

  test('varsayılan 6 basamak', () => {
    expect(useAppStore.getState().decimalPlaces).toBe(6);
    expect(getDecimalPlaces()).toBe(6);
    expect(formatNumber(1 / 3, 'decimal')).toBe('0.333333');
  });

  test('setDecimalPlaces store\'u VE numberFormat modülünü aynı anda günceller', () => {
    useAppStore.getState().setDecimalPlaces(2);
    expect(useAppStore.getState().decimalPlaces).toBe(2);
    expect(getDecimalPlaces()).toBe(2);
    expect(formatNumber(1 / 3, 'decimal')).toBe('0.33');
  });

  test('0 basamak: tam sayıya yuvarlar', () => {
    useAppStore.getState().setDecimalPlaces(0);
    expect(formatNumber(2.7, 'decimal')).toBe('3');
  });

  test('sınırlar: 12 üstü ve negatif değerler kırpılır', () => {
    useAppStore.getState().setDecimalPlaces(20);
    expect(useAppStore.getState().decimalPlaces).toBe(12);
    useAppStore.getState().setDecimalPlaces(-3);
    expect(useAppStore.getState().decimalPlaces).toBe(0);
  });

  test('kesir modunu ETKİLEMEZ (yalnızca ondalık modda geçerli)', () => {
    useAppStore.getState().setDecimalPlaces(1);
    expect(formatNumber(1 / 3, 'fraction')).toBe('1/3');
  });
});
