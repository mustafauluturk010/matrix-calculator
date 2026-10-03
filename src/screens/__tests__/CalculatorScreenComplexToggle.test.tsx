jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(() => Promise.resolve(false)), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({}));
jest.mock('react-native-google-mobile-ads', () => ({ __esModule: true, default: { initialize: jest.fn(() => Promise.resolve()) }, AdEventType: {}, RewardedAd: { createForAdRequest: jest.fn(() => ({ addAdEventListener: jest.fn(), load: jest.fn(), show: jest.fn() })) }, RewardedAdEventType: {}, TestIds: { REWARDED: 'test' } }));
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

import React from 'react';
const renderer: any = require('react-test-renderer');
const { act } = renderer;
import CalculatorScreen from '../CalculatorScreen';
import { useAppStore } from '@/store/useAppStore';

const findTextInputs = (tree: any) => tree.root.findAllByType('TextInput' as any);
const findByLabel = (tree: any, label: string) => tree.root.findAll((n: any) => n.props.accessibilityLabel === label);

describe('CalculatorScreen: karmaşık mod kapatılınca güvenlik temizliği', () => {
  beforeEach(() => {
    useAppStore.setState({ complexMode: false });
  });

  test('karmaşık mod AÇIKKEN "3+2i" yazılır, KAPATILINCA hücre otomatik temizlenir ve uyarı gösterilir', () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    let tree: any;
    act(() => {
      useAppStore.setState({ complexMode: true });
      tree = renderer.create(<CalculatorScreen />);
    });

    const aCell = findByLabel(tree, 'Değerler satır 1 sütun 1')[0];
    act(() => aCell.props.onFocus());
    act(() => aCell.props.onChangeText('3+2i'));
    expect(aCell.props.value).toBe('3+2i');

    // Karmaşık modu KAPAT (Ayarlar'dan yapılan değişikliği simüle eder)
    act(() => useAppStore.setState({ complexMode: false }));

    const aCellAfter = findByLabel(tree, 'Değerler satır 1 sütun 1')[0];
    expect(aCellAfter.props.value).toBe('0'); // temizlendi, "3+2i" olarak KALMADI
    expect(alertSpy).toHaveBeenCalledWith('Karmaşık girişler temizlendi', expect.any(String));

    // Editing the cell again behaves like normal real input, since it is already clean.
    act(() => aCellAfter.props.onChangeText('5'));
    expect(findTextInputs(tree)[0].props.value).toBe('5');

    alertSpy.mockRestore();
  });

  test('karmaşık mod içeriği YOKSA kapatma sessiz kalır (uyarı gösterilmez)', () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    let tree: any;
    act(() => {
      useAppStore.setState({ complexMode: true });
      tree = renderer.create(<CalculatorScreen />);
    });
    const aCell = findByLabel(tree, 'Değerler satır 1 sütun 1')[0];
    act(() => aCell.props.onFocus());
    act(() => aCell.props.onChangeText('5'));
    act(() => useAppStore.setState({ complexMode: false }));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(findTextInputs(tree)[0].props.value).toBe('5'); // korunur
    alertSpy.mockRestore();
  });
});
