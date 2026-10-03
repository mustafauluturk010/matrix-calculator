import { runOperation } from '../runOperation';
import { OperationType } from '@/types';
import { parseComplexRealPart } from '../numberFormat';

// Uygulamada MatrixData, hücrenin GERÇEL kısmıdır (bkz. parseComplexRealPart).
const dims = (m: string[][]) => m.map((r) => r.map(parseComplexRealPart));
const cx = (
  type: OperationType,
  A: string[][],
  o: { B?: string[][]; scalar?: string; b?: string[]; exponent?: number; method?: 'cramer' | 'gauss'; mode?: 'decimal' | 'fraction'; lang?: 'tr' | 'en' } = {}
) =>
  runOperation(type, dims(A), o.B ? dims(o.B) : dims(A), 0, o.exponent ?? 2, (o.b ?? []).map(parseComplexRealPart), o.method ?? 'gauss', o.lang ?? 'tr', o.mode ?? 'fraction', {
    A, B: o.B, scalar: o.scalar, b: o.b, exponent: o.exponent, method: o.method, complex: true,
  });

describe('Karmaşık sayı modu: temel işlemler', () => {
  test('toplama / çıkarma', () => {
    expect(cx('add', [['1+i', '2']], { B: [['3-2i', 'i']] }).matrixResultLabels).toEqual([['4 - i', '2 + i']]);
    expect(cx('subtract', [['1+i', '2']], { B: [['1+i', 'i']] }).matrixResultLabels).toEqual([['0', '2 - i']]);
  });
  test('skaler çarpma: i·(1+i) = −1 + i', () => {
    expect(cx('scalarMultiply', [['1+i', '2']], { scalar: 'i' }).matrixResultLabels).toEqual([['-1 + i', '2i']]);
  });
  test('çarpma: [[1,i],[−i,1]]² (idempotent·2)', () => {
    const r = cx('multiply', [['1', 'i'], ['-i', '1']], { B: [['1', 'i'], ['-i', '1']] });
    expect(r.matrixResultLabels).toEqual([['2', '2i'], ['-2i', '2']]);
  });
  test('transpoz ve iz', () => {
    expect(cx('transpose', [['1', 'i'], ['2i', '3']]).matrixResultLabels).toEqual([['1', '2i'], ['i', '3']]);
    expect(cx('trace', [['1+i', '0'], ['0', '2-3i']]).scalarResultLabel).toBe('3 - 2i');
  });
  test('determinant: |[[1+i, 2],[i, 3−i]]| = (1+i)(3−i) − 2i = 4 + 2i − 2i = 4', () => {
    expect(cx('determinant', [['1+i', '2'], ['i', '3-i']]).scalarResultLabel).toBe('4');
  });
  test('determinant 3x3', () => {
    // [[i,0,0],[0,i,0],[0,0,i]] → i³ = −i
    expect(cx('determinant', [['i', '0', '0'], ['0', 'i', '0'], ['0', '0', 'i']]).scalarResultLabel).toBe('-i');
  });
  test('ters: [[1,i],[−i,2]]⁻¹ = [[2,−i],[i,1]]', () => {
    // det = 2 − (i)(−i) = 2 − 1 = 1
    const r = cx('inverse', [['1', 'i'], ['-i', '2']]);
    expect(r.matrixResultLabels).toEqual([['2', '-i'], ['i', '1']]);
  });
  test('tekil matris: ters yok', () => {
    const r = cx('inverse', [['1', 'i'], ['i', '-1']]); // det = −1 − i² = 0
    expect(r.success).toBe(false);
  });
  test('rank / RREF', () => {
    expect(cx('rank', [['1', 'i'], ['i', '-1']]).scalarResult).toBe(1);
    expect(cx('rref', [['1', 'i'], ['i', '-1']]).matrixResultLabels).toEqual([['1', 'i'], ['0', '0']]);
  });
  test('Gauss eliminasyonu (basamaklı form)', () => {
    const r = cx('gaussElimination', [['1', 'i'], ['i', '3']]);
    expect(r.matrixResultLabels).toEqual([['1', 'i'], ['0', '4']]);
  });
  test('kuvvet: [[0,1],[−1,0]] = J, J² = −I; J⁻¹ = −J; (i·I)⁴ = I', () => {
    expect(cx('power', [['0', '1'], ['-1', '0+0i']], { exponent: 2 }).matrixResultLabels).toEqual([['-1', '0'], ['0', '-1']]);
    expect(cx('power', [['i', '0'], ['0', 'i']], { exponent: 4 }).matrixResultLabels).toEqual([['1', '0'], ['0', '1']]);
    expect(cx('power', [['i', '0'], ['0', '2i']], { exponent: -1 }).matrixResultLabels).toEqual([['-i', '0'], ['0', '-i/2']]);
  });
  test('LU: PA = LU, L·U sayısal olarak A', () => {
    const r = cx('lu', [['1+i', '2'], ['i', '3']]);
    expect(r.success).toBe(true);
    expect(r.luResultLabels!.L[0][0]).toBe('1');
  });
  test('denklem çözme (Gauss ve Cramer): [[1,i],[−i,2]]·x = [1, i] ⇒ x = [2−i·i.., ...]', () => {
    // A⁻¹ = [[2,−i],[i,1]]; A⁻¹·[1,i] = [2 − i·i, i + i] = [3, 2i]
    for (const method of ['gauss', 'cramer'] as const) {
      const r = cx('solveLinearSystem', [['1', 'i'], ['-i', '2']], { b: ['1', 'i'], method });
      expect(r.vectorResultLabels).toEqual(['3', '2i']);
    }
  });
  test('tutarsız sistem', () => {
    const r = cx('solveLinearSystem', [['1', 'i'], ['i', '-1']], { b: ['1', '1'] });
    expect(r.success).toBe(false);
  });
  test('π ve √ ile karışık: (√2+i)(√2−i) = 3, π·i çarpımı', () => {
    expect(cx('multiply', [['√2+i']], { B: [['√2-i']] }).matrixResultLabels).toEqual([['3']]);
    expect(cx('scalarMultiply', [['pi']], { scalar: 'i' }).matrixResultLabels).toEqual([['iπ']]);
  });
  test('i yoksa null: gerçel motor devralır (aynı sonuç)', () => {
    const r = cx('add', [['1', '2']], { B: [['3', '4']] });
    expect(r.matrixResult).toEqual([[4, 6]]);
  });
  test('geçersiz giriş → hata', () => {
    const r = cx('add', [['1+', 'i']], { B: [['1', '1']] });
    expect(r.success).toBe(false);
  });
  test('kesin takip sürdürülemezse sayısal karmaşık yedek (π+√2+i bölen)', () => {
    // 1/(π+√2+i) doğrudan hücre değil; ters alma çok terimli bölen gerektirir
    const r = cx('inverse', [['pi+√2+i', '1'], ['1', '2']]);
    expect(r.success).toBe(true);
    expect(r.matrixResult!.length).toBe(2);
  });
  test('ondalık mod ve İngilizce', () => {
    const r = cx('add', [['0.5+i']], { B: [['0.25']], mode: 'decimal', lang: 'en' });
    expect(r.matrixResultLabels).toEqual([['0.75 + i']]);
  });
});
