jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
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
import HistoryScreen from '../HistoryScreen';
import { useAppStore } from '@/store/useAppStore';
import { HistoryEntry } from '@/types';

const mk = (id: string, label: string, summary: string, det: number): HistoryEntry => ({
  id,
  timestamp: 1700000000000 + Number(id) * 3600000, // saat aralıklı: toLocaleString saniye çözünürlüklü, etiketler ayrışsın
  operation: 'determinant',
  operationLabel: label,
  inputSummary: summary,
  result: { success: true, scalarResult: det, scalarResultLabel: String(det), steps: [] },
  inputs: {
    matrixA: [[1]], matrixB: [[1]], scalar: '2', exponent: '2', vectorB: ['0'], linearMethod: 'gauss',
    rowsA: 1, colsA: 1, rowsB: 1, colsB: 1,
  } as any,
});

const cardLabels = (tree: any): string[] =>
  tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.includes(', '))
    .map((n: any) => n.props.accessibilityLabel as string)
    .filter((l: string, i: number, a: string[]) => a.indexOf(l) === i);

describe('HistoryScreen: arama', () => {
  beforeEach(() => {
    useAppStore.setState({
      history: [mk('1', 'Determinant', 'A: 3x3', 42), mk('2', 'Ters Matris', 'A: 2x2', 7), mk('3', 'Determinant', 'A: 2x2', 1234)],
    });
  });

  const input = (tree: any) => tree.root.findByProps({ accessibilityLabel: 'Geçmişte ara' });

  test('boş sorguda tüm kayıtlar görünür', () => {
    let tree: any;
    act(() => { tree = renderer.create(<HistoryScreen />); });
    expect(cardLabels(tree).length).toBe(3);
  });

  test('işlem adına göre filtreler (büyük/küçük harf duyarsız)', () => {
    let tree: any;
    act(() => { tree = renderer.create(<HistoryScreen />); });
    act(() => input(tree).props.onChangeText('ters'));
    const labels = cardLabels(tree);
    expect(labels.length).toBe(1);
    expect(labels[0]).toContain('Ters Matris');
  });

  test('girdi özetine ve SONUÇ değerine göre de filtreler', () => {
    let tree: any;
    act(() => { tree = renderer.create(<HistoryScreen />); });
    act(() => input(tree).props.onChangeText('3x3'));
    expect(cardLabels(tree).length).toBe(1);
    act(() => input(tree).props.onChangeText('1234'));
    const labels = cardLabels(tree);
    expect(labels.length).toBe(1);
  });

  test('eşleşme yoksa "kayıt yok" mesajı gösterilir; temizle düğmesi tümünü geri getirir', () => {
    let tree: any;
    act(() => { tree = renderer.create(<HistoryScreen />); });
    act(() => input(tree).props.onChangeText('zzzz'));
    expect(cardLabels(tree).length).toBe(0);
    const texts = tree.root.findAllByType('Text' as any).map((n: any) => n.props.children);
    expect(texts).toContain('Aramayla eşleşen kayıt yok.');
    const clearBtn = tree.root.findByProps({ accessibilityLabel: 'Aramayı temizle' });
    act(() => clearBtn.props.onPress());
    expect(cardLabels(tree).length).toBe(3);
  });

  test('geçmiş tamamen boşken arama kutusu görünmez', () => {
    useAppStore.setState({ history: [] });
    let tree: any;
    act(() => { tree = renderer.create(<HistoryScreen />); });
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Geçmişte ara' }).length).toBe(0);
  });
});
