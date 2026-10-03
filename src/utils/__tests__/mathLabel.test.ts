import { parseMathLabel, isPlainLabel, mathLabelToHtml, MathNode } from '../mathLabel';
import { parseSymbolicInput, symToString, symAdd } from '../symbolic';
import { formatNumber } from '../numberFormat';

const T = (value: string): MathNode => ({ type: 'text', value });
const SQ = (r: string): MathNode => ({ type: 'sqrt', radicand: [T(r)] });

describe('isPlainLabel', () => {
  test('düz sayılar', () => {
    expect(isPlainLabel('5')).toBe(true);
    expect(isPlainLabel('-0.25')).toBe(true);
    expect(isPlainLabel('π')).toBe(true);
    expect(isPlainLabel('3π')).toBe(true);
  });
  test('kesir veya kök içerenler', () => {
    expect(isPlainLabel('3/2')).toBe(false);
    expect(isPlainLabel('√2')).toBe(false);
  });
});

describe('parseMathLabel', () => {
  test('düz sayı tek metin düğümü', () => {
    expect(parseMathLabel('-0.25')).toEqual([T('-0.25')]);
  });

  test('π/2 → yığılmış kesir', () => {
    expect(parseMathLabel('π/2')).toEqual([{ type: 'frac', num: [T('π')], den: [T('2')] }]);
  });

  test('3π√2/4 → payda kök var, sade payda', () => {
    expect(parseMathLabel('3π√2/4')).toEqual([{ type: 'frac', num: [T('3π'), SQ('2')], den: [T('4')] }]);
  });

  test('negatif işaret kesrin dışında', () => {
    expect(parseMathLabel('-3π/4')).toEqual([T('-'), { type: 'frac', num: [T('3π')], den: [T('4')] }]);
  });

  test('yalnızca kök: kesir yok', () => {
    expect(parseMathLabel('√2')).toEqual([SQ('2')]);
    expect(parseMathLabel('2√3')).toEqual([T('2'), SQ('3')]);
  });

  test('toplam: √2 + √3', () => {
    expect(parseMathLabel('√2 + √3')).toEqual([SQ('2'), T(' + '), SQ('3')]);
  });

  test('çıkarma işareti gerçek eksi (−) olarak gösterilir', () => {
    expect(parseMathLabel('π√2 - 1/2')).toEqual([
      T('π'),
      SQ('2'),
      T(' − '),
      { type: 'frac', num: [T('1')], den: [T('2')] },
    ]);
  });

  test('her terim kendi kesrini alır: √2/2 + √3/3', () => {
    expect(parseMathLabel('√2/2 + √3/3')).toEqual([
      { type: 'frac', num: [SQ('2')], den: [T('2')] },
      T(' + '),
      { type: 'frac', num: [SQ('3')], den: [T('3')] },
    ]);
  });

  test('parantezli pay: (9 + √61) / 2', () => {
    expect(parseMathLabel('(9 + √61) / 2')).toEqual([
      { type: 'frac', num: [T('9'), T(' + '), SQ('61')], den: [T('2')] },
    ]);
  });

  test('parantezli negatif pay: (-1 - √61) / 2', () => {
    expect(parseMathLabel('(-1 - √61) / 2')).toEqual([
      { type: 'frac', num: [T('-1'), T(' − '), SQ('61')], den: [T('2')] },
    ]);
  });

  test('parantezli payda: 3/(2π)', () => {
    expect(parseMathLabel('3/(2π)')).toEqual([{ type: 'frac', num: [T('3')], den: [T('2π')] }]);
  });

  test('rasyonel kesir (kesirli mod): -3/2', () => {
    expect(parseMathLabel('-3/2')).toEqual([T('-'), { type: 'frac', num: [T('3')], den: [T('2')] }]);
  });

  test('belirsiz biçim (iki "/") düz metin kalır', () => {
    expect(parseMathLabel('1/2/3')).toEqual([T('1/2/3')]);
  });

  test('yarım kalmış metin bozulmaz', () => {
    expect(parseMathLabel('1/')).toEqual([T('1/')]);
    expect(parseMathLabel('√')).toEqual([T('√')]);
    expect(parseMathLabel('/2')).toEqual([T('/2')]);
  });

  test('√(...) parantezli kök', () => {
    expect(parseMathLabel('√(2 + 3)')).toEqual([
      { type: 'sqrt', radicand: [T('2 + 3')] },
    ]);
  });

  test('boş etiket', () => {
    expect(parseMathLabel('')).toEqual([]);
  });
});

describe('gerçek etiketlerle uçtan uca', () => {
  const P = (t: string) => symToString(parseSymbolicInput(t)!);

  test('motorun ürettiği etiketler ayrıştırılabilir', () => {
    for (const input of ['pi/2', '3pi√2/4', '-2√3', '1/√2', '√2', '-pi/3', '√2/3']) {
      const label = P(input);
      const nodes = parseMathLabel(label);
      expect(nodes.length).toBeGreaterThan(0);
    }
    expect(parseMathLabel(P('1/√2'))).toEqual([{ type: 'frac', num: [SQ('2')], den: [T('2')] }]);
  });

  test('toplam etiketleri', () => {
    const a = parseSymbolicInput('√2/2')!;
    const b = parseSymbolicInput('pi/3')!;
    const label = symToString(symAdd(a, b));
    const nodes = parseMathLabel(label);
    expect(nodes.filter((n) => n.type === 'frac')).toHaveLength(2);
  });

  test('formatNumber çıktıları (π/√ tespiti) kesirli modda ayrıştırılabilir', () => {
    expect(parseMathLabel(formatNumber(Math.PI / 2, 'fraction'))).toEqual([
      { type: 'frac', num: [T('π')], den: [T('2')] },
    ]);
    expect(parseMathLabel(formatNumber(Math.sqrt(2) / 2, 'fraction'))).toEqual([
      { type: 'frac', num: [SQ('2')], den: [T('2')] },
    ]);
  });

  test('ondalık modda π/√ sembolü YOK: düz ondalık sayı', () => {
    expect(formatNumber(Math.PI / 2, 'decimal')).toBe('1.570796');
    expect(formatNumber(Math.sqrt(2) / 2, 'decimal')).toBe('0.707107');
  });

  test('kesirli modda rasyonel kesir', () => {
    expect(parseMathLabel(formatNumber(0.75, 'fraction'))).toEqual([
      { type: 'frac', num: [T('3')], den: [T('4')] },
    ]);
  });
});

describe('mathLabelToHtml', () => {
  test('düz etiket yalnızca kaçışlanır', () => {
    expect(mathLabelToHtml('5')).toBe('5');
    expect(mathLabelToHtml('a<b')).toBe('a&lt;b');
  });

  test('kesir: pay, çizgi, payda', () => {
    const html = mathLabelToHtml('π/2');
    expect(html).toContain('display:inline-block');
    expect(html).toContain('border-bottom:1px solid');
    expect(html.indexOf('π')).toBeLessThan(html.indexOf('>2<'));
  });

  test('kök: √ + üstü çizgili kök içi', () => {
    const html = mathLabelToHtml('√2');
    expect(html).toContain('√');
    expect(html).toContain('border-top:1px solid');
    expect(html).toContain('>2<');
  });

  test('HTML etiketi enjekte edilemez', () => {
    expect(mathLabelToHtml('<b>1</b>/2')).not.toContain('<b>');
  });
});
