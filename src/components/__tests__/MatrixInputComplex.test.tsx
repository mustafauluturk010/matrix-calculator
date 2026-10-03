jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const renderer: any = require('react-test-renderer');
const { act } = renderer;
import MatrixInput from '../MatrixInput';
import { lightTheme } from '@/theme/theme';

const inputs = (tree: any) => tree.root.findAllByType('TextInput' as any);
const texts = (tree: any): string[] => tree.root.findAllByType('Text' as any).map((n: any) => n.props.children as string);

function mount(props: Partial<React.ComponentProps<typeof MatrixInput>> = {}) {
  const onChange = jest.fn();
  const onTextsChange = jest.fn();
  let tree: any;
  act(() => {
    tree = renderer.create(
      <MatrixInput label="A" rows={1} cols={2} value={[[0, 0]]} onChange={onChange} onTextsChange={onTextsChange} theme={lightTheme} {...props} />
    );
  });
  return { tree, onChange, onTextsChange };
}

describe('MatrixInput: karmaşık sayı modu', () => {
  test('karmaşık modda "3+2i" yazılır: metin korunur, sayısal değer GERÇEL kısım', () => {
    const { tree, onChange, onTextsChange } = mount({ complexMode: true });
    act(() => inputs(tree)[0].props.onChangeText('3+2i'));
    expect(onChange).toHaveBeenLastCalledWith([[3, 0]]);
    expect(onTextsChange).toHaveBeenLastCalledWith([['3+2i', '0']]);
    expect(inputs(tree)[0].props.value).toBe('3+2i');
  });

  test('saf sanal "2i" ve "-i/2": gerçel kısım 0, metin korunur', () => {
    const { tree, onChange, onTextsChange } = mount({ complexMode: true });
    act(() => inputs(tree)[1].props.onChangeText('-i/2'));
    expect(onChange).toHaveBeenLastCalledWith([[0, 0]]);
    expect(onTextsChange).toHaveBeenLastCalledWith([['0', '-i/2']]);
  });

  test('karmaşık modda "i" düğmesi görünür, kapalıyken görünmez', () => {
    const on = mount({ complexMode: true });
    expect(texts(on.tree)).toContain('i');
    const off = mount({ complexMode: false });
    expect(texts(off.tree)).not.toContain('i');
  });

  test('syncTexts: geçmişten yüklenen karmaşık metin (sanal kısımla) hücreye konur', () => {
    const { tree } = mount({ complexMode: true, syncKey: 1, syncTexts: [['1+i', '2i']], value: [[1, 0]] });
    expect(inputs(tree)[0].props.value).toBe('1+i');
    expect(inputs(tree)[1].props.value).toBe('2i');
  });

  test('boyut değişiminde karmaşık metin, gerçel kısmı aynı kaldığı için KORUNUR', () => {
    const onChange = jest.fn();
    let tree: any;
    act(() => {
      tree = renderer.create(<MatrixInput label="A" rows={1} cols={2} value={[[0, 0]]} onChange={onChange} theme={lightTheme} complexMode />);
    });
    act(() => inputs(tree)[0].props.onChangeText('3+2i'));
    act(() => {
      tree.update(<MatrixInput label="A" rows={2} cols={2} value={[[3, 0], [0, 0]]} onChange={onChange} theme={lightTheme} complexMode />);
    });
    expect(inputs(tree)[0].props.value).toBe('3+2i');
  });

  test('gerçel modda (eski davranış) "3+2i" sanal birimi sayısal değere katmaz', () => {
    const { tree, onChange } = mount({ complexMode: false });
    act(() => inputs(tree)[0].props.onChangeText('3+2'));
    expect(onChange).toHaveBeenLastCalledWith([[5, 0]]);
  });
});

describe('MatrixInput: imleç konumuna duyarlı sembol ekleme', () => {
  test('π düğmesi, metnin SONUNA değil imlecin bulunduğu yere eklenir', () => {
    const { tree, onTextsChange } = mount({ value: [[0, 0]] });
    const cell = inputs(tree)[0];
    act(() => cell.props.onFocus());
    act(() => cell.props.onChangeText('1+2'));
    // imleci "1+" ile "2" arasına (indeks 2) taşı
    act(() => cell.props.onSelectionChange({ nativeEvent: { selection: { start: 2, end: 2 } } }));
    const piBtn = tree.root.findAll((n: any) => n.props.accessibilityLabel === 'π ekle')[0];
    act(() => piBtn.props.onPress());
    expect(onTextsChange).toHaveBeenLastCalledWith([['1+pi2', '0']]);
  });

  test('bir seçim (aralık) varken sembol eklemek seçimi DEĞİŞTİRİR (yazı yazmadaki gibi)', () => {
    const { tree, onTextsChange } = mount({ value: [[0, 0]] });
    const cell = inputs(tree)[0];
    act(() => cell.props.onFocus());
    act(() => cell.props.onChangeText('123'));
    act(() => cell.props.onSelectionChange({ nativeEvent: { selection: { start: 1, end: 3 } } })); // "23" seçili
    const sqrtBtn = tree.root.findAll((n: any) => n.props.accessibilityLabel === 'Karekök ekle')[0];
    act(() => sqrtBtn.props.onPress());
    expect(onTextsChange).toHaveBeenLastCalledWith([['1√', '0']]);
  });

  test('eklemeden sonra imleç eklenen sembolün TAM ARDINA taşınır (selection prop), sonra temizlenir', () => {
    jest.useFakeTimers();
    try {
      const { tree } = mount({ value: [[0, 0]] });
      const cell = inputs(tree)[0];
      act(() => cell.props.onFocus());
      act(() => cell.props.onChangeText('12'));
      act(() => cell.props.onSelectionChange({ nativeEvent: { selection: { start: 1, end: 1 } } }));
      const piBtn = tree.root.findAll((n: any) => n.props.accessibilityLabel === 'π ekle')[0];
      act(() => piBtn.props.onPress());
      const after = inputs(tree)[0];
      expect(after.props.value).toBe('1pi2');
      expect(after.props.selection).toEqual({ start: 3, end: 3 });
      act(() => jest.advanceTimersByTime(100));
      expect(inputs(tree)[0].props.selection).toBeUndefined();
      act(() => tree.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test('"0" yer tutucusunda (henüz dokunulmamış hücre) sembol eklemek metni SIFIRLAMAZ, yerine geçer', () => {
    const { tree, onTextsChange } = mount({ value: [[0, 0]] });
    const cell = inputs(tree)[0];
    act(() => cell.props.onFocus());
    const piBtn = tree.root.findAll((n: any) => n.props.accessibilityLabel === 'π ekle')[0];
    act(() => piBtn.props.onPress());
    expect(onTextsChange).toHaveBeenLastCalledWith([['pi', '0']]);
  });

  test('sembol düğmeleri erişilebilirlik etiketine sahiptir', () => {
    const { tree } = mount({ value: [[0, 0]], complexMode: true });
    const labels = tree.root.findAllByProps({ accessibilityRole: 'button' }).map((n: any) => n.props.accessibilityLabel);
    expect(labels).toEqual(expect.arrayContaining(['π ekle', 'Karekök ekle', 'Sanal birim i ekle']));
  });

  test('hücreler erişilebilirlik etiketiyle işaretli (satır/sütun)', () => {
    const { tree } = mount({ value: [[0, 0]] });
    expect(inputs(tree)[0].props.accessibilityLabel).toBe('A satır 1 sütun 1');
    expect(inputs(tree)[1].props.accessibilityLabel).toBe('A satır 1 sütun 2');
  });
});
