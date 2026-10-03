import { runOperation } from '../runOperation';
import { parseFractionalInput } from '../numberFormat';
import { parseSymbolicInput, symToNumber, SYM_ONE, symAdd, symSub, symMul, SymNum, latexifyLabel } from '../symbolic';
import { fracNormalize, fracAdd, fracSub, fracMul, fracDiv, fracToString, fracToNumber, fracIsZero, fracFromSym } from '../symFrac';
import { trySymbolicOperation, MAX_RESULT_TERMS } from '../symbolicOps';

// π ile kökün aynı paydada karıştığı bölme (madde 4) ve okunabilirlik eşiği (madde 9)

const P = (t: string): SymNum => parseSymbolicInput(t)!;
const F = (t: string) => fracFromSym(P(t));
const S = (f: ReturnType<typeof fracToString> extends string ? Parameters<typeof fracToString>[0] : never) => fracToString(f, 'fraction');

const run = (type: any, A: string[][], extra: { b?: string[]; exponent?: number } = {}) => {
  const M = A.map((r) => r.map((t) => parseFractionalInput(t)));
  return runOperation(type, M, [[0]], 0, extra.exponent ?? 2, extra.b?.map((t) => parseFractionalInput(t)) ?? [], 'gauss', 'tr', 'fraction', {
    A,
    b: extra.b,
    exponent: extra.exponent,
  });
};

const matmul = (X: number[][], Y: number[][]) => X.map((r) => Y[0].map((_, j) => r.reduce((s, v, k) => s + v * Y[k][j], 0)));
const num = (A: string[][]) => A.map((r) => r.map((t) => symToNumber(P(t))));

describe('SymFrac: π ve kök aynı paydada', () => {
  test('1/(π+√2) = (π−√2)/(π²−2) (paydadan kökler atılır)', () => {
    const f = fracNormalize(SYM_ONE, P('pi+√2'))!;
    expect(S(f)).toBe('(-√2 + π)/(-2 + π²)');
    expect(fracToNumber(f)).toBeCloseTo(1 / (Math.PI + Math.SQRT2), 12);
  });

  test('parser hâlâ tek hücrede bu bölmeyi temsil ETMEZ (ondalık motora düşer)', () => {
    expect(parseSymbolicInput('1/(π+√2)')).toBeNull();
  });

  test('toplam: 1/(π+√2) + 1/(π−√2) = 2π/(π²−2) (KESİN)', () => {
    const a = fracNormalize(SYM_ONE, P('pi+√2'))!;
    const b = fracNormalize(SYM_ONE, P('pi-√2'))!;
    expect(S(fracAdd(a, b)!)).toBe('2π/(-2 + π²)');
  });

  test('sıfır testi kesin: x − x = 0 ve çarpma/bölme tersleri', () => {
    const x = fracNormalize(P('1+√3'), P('pi+√2'))!;
    expect(fracIsZero(fracSub(x, x)!)).toBe(true);
    const y = fracDiv(x, x)!;
    expect(S(y)).toBe('1');
    expect(S(fracMul(x, fracDiv(F('1'), x)!)!)).toBe('1');
  });

  test('ortak π-polinom çarpanı sadeleşir: (π²−2)²(π²+2)/(π²−2)⁴ = (π²+2)/(π²−2)²', () => {
    const u = P('pi*pi-2');
    const num = symMul(symMul(u, u), P('pi*pi+2'));
    const den = symMul(symMul(u, u), symMul(u, u));
    const f = fracNormalize(num, den)!;
    expect(S(f)).toBe('(2 + π²)/(4 - 4π² + π^4)');
  });

  test('payda tek terimliye inince düz SymNum olur', () => {
    const f = fracNormalize(P('pi+√2'), P('pi+√2'))!;
    expect(S(f)).toBe('1');
  });

  test('sıfıra bölme null', () => {
    expect(fracNormalize(SYM_ONE, P('pi-pi'))).toBeNull();
    expect(fracDiv(F('1'), F('0'))).toBeNull();
  });
});

describe('Ters, üs, denklem çözme, rank: π+kök karışık determinant', () => {
  const A = [['pi', '√2'], ['√2', 'pi']]; // det = π² − 2 (π ve kök karışık DEĞİL ama π'de çok terimli)

  test('ters: hücreler paydalı kesir, A·A⁻¹ = I', () => {
    const r = run('inverse', A);
    expect(r.success).toBe(true);
    expect(r.matrixResultLabels).toEqual([['π/(-2 + π²)', '-√2/(-2 + π²)'], ['-√2/(-2 + π²)', 'π/(-2 + π²)']]);
    expect(r.matrixResultLatex![0][0]).toBe('\\frac{\\pi}{-2 + \\pi^{2}}');
    const I = matmul(num(A), r.matrixResult!);
    expect(I[0][0]).toBeCloseTo(1, 10);
    expect(I[0][1]).toBeCloseTo(0, 10);
    expect(I[1][1]).toBeCloseTo(1, 10);
  });

  test('ters: π ve kök karışık determinant (det = π + √2·(...))', () => {
    const B = [['pi', '1'], ['1', '√2']]; // det = π√2 − 1
    const r = run('inverse', B);
    expect(r.success).toBe(true);
    const I = matmul(num(B), r.matrixResult!);
    expect(I[0][0]).toBeCloseTo(1, 10);
    expect(I[1][0]).toBeCloseTo(0, 10);
    expect(r.matrixResultLabels).toBeDefined();
  });

  test('negatif üs: (A⁻¹)² SymFrac hücreleriyle, sayısal değerle uyumlu', () => {
    const r = run('power', A, { exponent: -2 });
    expect(r.success).toBe(true);
    expect(r.matrixResultLabels![0][0]).toBe('(2 + π²)/(4 - 4π² + π^4)');
    const inv = run('inverse', A).matrixResult!;
    const sq = matmul(inv, inv);
    expect(r.matrixResult![0][0]).toBeCloseTo(sq[0][0], 10);
    expect(r.matrixResult![0][1]).toBeCloseTo(sq[0][1], 10);
  });

  test('denklem çözme (Gauss → Cramer + SymFrac): A·x = b', () => {
    const r = run('solveLinearSystem', A, { b: ['1', '2'] });
    expect(r.success).toBe(true);
    expect(r.vectorResultLabels).toEqual(['(-2√2 + π)/(-2 + π²)', '(-√2 + 2π)/(-2 + π²)']);
    const x = r.vectorResult!;
    const M = num(A);
    expect(M[0][0] * x[0] + M[0][1] * x[1]).toBeCloseTo(1, 10);
    expect(M[1][0] * x[0] + M[1][1] * x[1]).toBeCloseTo(2, 10);
  });

  test('rank: pivot π+kök karışıksa minörlerle KESİN hesaplanır', () => {
    const R = [['pi', '√2', 'pi+√2'], ['√2', 'pi', '√2+pi'], ['1', '1', '2']]; // 3. sütun = 1. + 2.
    const r = run('rank', R);
    expect(r.scalarResult).toBe(2);
    expect(r.steps.some((s) => s.title.includes('minör') || s.title.includes('minors'))).toBe(true);
  });

  test('okunamayacak kadar uzun kesirler (3x3 ters) ondalık motora düşer, sonuç yine doğru', () => {
    const B = [['pi', '1', '0'], ['√2', 'pi', '1'], ['0', '1', '√3']];
    const r = run('inverse', B);
    expect(r.success).toBe(true);
    expect(r.matrixResultLabels).toBeUndefined(); // sembolik etiket yok ⇒ sayısal motor
    const I = matmul(num(B), r.matrixResult!);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(I[i][j]).toBeCloseTo(i === j ? 1 : 0, 8);
  });
});

describe('Okunabilirlik eşiği (madde 9)', () => {
  const radicals = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 26, 29, 30, 31, 33, 34, 35, 37, 38];
  const many = (count: number) => ['1', 'pi', ...radicals.slice(0, count).map((r) => `√${r}`)].join('+');

  test('eşik 12 → 24: 13 terimli hücre artık sembolik kalır', () => {
    expect(MAX_RESULT_TERMS).toBe(24);
    const cell = many(11); // 1 + π + 11 roots = 13 terms
    const r = trySymbolicOperation('transpose', [[0]], [[0]], { A: [[cell]] }, 'tr', 'fraction');
    expect(r).not.toBeNull();
    expect(r!.matrixResultLabels![0][0].split(' + ').length).toBe(13);
  });

  test('eşik aşılırsa (26 terim) hâlâ ondalık motora düşer', () => {
    const cell = many(24); // 26 terim
    const r = trySymbolicOperation('transpose', [[0]], [[0]], { A: [[cell]] }, 'tr', 'fraction');
    expect(r).toBeNull();
  });
});

describe('latexifyLabel: opak kök ve (pay)/(payda)', () => {
  test('√(...) dengeli parantezle \\sqrt{...} olur (iç içe dahil)', () => {
    expect(latexifyLabel('i√(4 - π)/2 + 1/2')).toBe('i\\sqrt{4 - \\pi}/2 + 1/2');
    expect(latexifyLabel('π/2 + √(π² + 2π√2 + 2)/2')).toBe('\\pi/2 + \\sqrt{\\pi^{2} + 2\\pi\\sqrt{2} + 2}/2');
  });
  test('(pay)/(payda) → \\frac', () => {
    expect(latexifyLabel('(π - √2)/(π² - 2)')).toBe('\\frac{\\pi - \\sqrt{2}}{\\pi^{2} - 2}');
    expect(latexifyLabel('-(π - √2)/(π² - 2)')).toBe('-\\frac{\\pi - \\sqrt{2}}{\\pi^{2} - 2}');
    expect(latexifyLabel('3π/4')).toBe('\\frac{3\\pi}{4}');
    expect(latexifyLabel('√2/2')).toBe('\\frac{\\sqrt{2}}{2}');
  });
});
