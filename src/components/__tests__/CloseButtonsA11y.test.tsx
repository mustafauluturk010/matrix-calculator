jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

import React from 'react';
const renderer: any = require('react-test-renderer');
const { act } = renderer;
import StepsModal from '../StepsModal';
import SavedMatrixPickerModal from '../SavedMatrixPickerModal';
import { lightTheme } from '@/theme/theme';

describe('İkon-only kapat düğmeleri erişilebilirlik etiketine sahip', () => {
  test('StepsModal: ✕ düğmesi "Kapat" etiketiyle işaretli', () => {
    const onClose = jest.fn();
    let tree: any;
    act(() => {
      tree = renderer.create(
        <StepsModal
          visible
          result={{ success: true, steps: [{ title: 't', description: 'd' }] } as any}
          operationLabel="Determinant"
          theme={lightTheme}
          onClose={onClose}
        />
      );
    });
    const closeBtn = tree.root.findByProps({ accessibilityLabel: 'Kapat' });
    expect(closeBtn.props.accessibilityRole).toBe('button');
    act(() => closeBtn.props.onPress());
    expect(onClose).toHaveBeenCalled();
  });

  test('SavedMatrixPickerModal: ✕ düğmesi "Kapat" etiketiyle işaretli', () => {
    const onClose = jest.fn();
    let tree: any;
    act(() => {
      tree = renderer.create(<SavedMatrixPickerModal visible matrices={[]} onSelect={jest.fn()} onClose={onClose} theme={lightTheme} />);
    });
    const closeBtn = tree.root.findByProps({ accessibilityLabel: 'Kapat' });
    act(() => closeBtn.props.onPress());
    expect(onClose).toHaveBeenCalled();
  });
});
