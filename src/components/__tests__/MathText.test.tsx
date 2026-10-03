import React from 'react';
// react-test-renderer için tip paketi projede yok; testte gevşek tip kullanıyoruz.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const renderer: any = require('react-test-renderer');
const { act } = renderer;
import MathText, { MathList } from '../MathText';

function texts(tree: any): string[] {
  return tree.root.findAllByType('Text' as any).map((n: any) => n.props.children as string);
}

describe('MathText (render smoke)', () => {
  test('düz sayı tek Text olarak çizilir', () => {
    let tree: any;
    act(() => { tree = renderer.create(<MathText text="-0.25" />); });
    expect(texts(tree)).toEqual(['-0.25']);
  });

  test('π/2: pay ve payda ayrı Text, arada kesir çizgisi', () => {
    let tree: any;
    act(() => { tree = renderer.create(<MathText text="π/2" />); });
    expect(texts(tree)).toEqual(['π', '2']);
  });

  test('3π√2/4: paydaki kök √ + kök içi olarak bölünür', () => {
    let tree: any;
    act(() => { tree = renderer.create(<MathText text="3π√2/4" />); });
    expect(texts(tree)).toEqual(['3π', '√', '2', '4']);
  });

  test('√2 + √3', () => {
    let tree: any;
    act(() => { tree = renderer.create(<MathText text="√2 + √3" />); });
    expect(texts(tree)).toEqual(['√', '2', ' + ', '√', '3']);
  });

  test('MathList köşeli parantez ve virgülleri ekler', () => {
    let tree: any;
    act(() => { tree = renderer.create(<MathList prefix="v1 = " items={['π/2', '1']} />); });
    expect(texts(tree)).toEqual(['v1 = [', 'π', '2', ',  ', '1', ']']);
  });
});
