import { formatNumber, numberToInputText, parseFractionalInput } from '../numberFormat';
import { inverse, multiply, luDecomposition, solveLinearSystem, eigen, round } from '../matrixUtils';

const frac = (v: number) => formatNumber(v, 'fraction');

describe('Kesirli gösterim: paydası 100\'ü aşan sonuçlar', () => {
  test('3x3 ters matris tüm hücrelerde kesir gösterir', () => {
    const r = inverse([[9, 7, 3], [4, 8, 5], [2, 1, 9]], 'tr', 'fraction');
    expect(r.success).toBe(true);
    const cells = r.matrixResult!.map((row) => row.map(frac));
    expect(cells[0][0]).toBe('67/385');
    expect(cells[1][0]).toBe('-26/385');
    expect(cells[2][0]).toBe('-12/385');
    cells.forEach((row) => row.forEach((c) => expect(c).not.toMatch(/\./)));
  });

  test('kesirli girişlerle çarpma: 41/378 ve 73/1260', () => {
    const r = multiply([[1 / 2, 1 / 3], [1 / 4, 1 / 5]], [[1 / 6, 1 / 7], [1 / 8, 1 / 9]], 'tr', 'fraction');
    expect(frac(r.matrixResult![0][1])).toBe('41/378');
    expect(frac(r.matrixResult![1][1])).toBe('73/1260');
  });

  test('4x4 sistem çözümü: 535/1216 ve -245/152', () => {
    const A = [[2, 1, -1, 3], [1, -3, 2, 4], [3, 2, 1, -2], [4, 1, 3, 5]];
    const r = solveLinearSystem(A, [1, 2, 3, 4], 'gauss', 'tr', 'fraction');
    expect(r.success).toBe(true);
    r.vectorResult!.forEach((v) => expect(frac(v)).not.toMatch(/\./));
  });

  test('4x4 LU sonuçlarında ondalık kalmaz', () => {
    const r = luDecomposition([[2, 1, 1, 3], [4, 3, 3, 1], [8, 7, 9, 5], [6, 7, 9, 8]], 'tr', 'fraction');
    const { L, U } = r.luResult!;
    [...L, ...U].forEach((row) => row.forEach((v) => expect(frac(v)).not.toMatch(/\./)));
  });
});

describe('Rasyonel sayılar π veya köklü ifade olarak gösterilmez', () => {
  test('17.75, 35.5 ve 46/51', () => {
    expect(frac(17.75)).toBe('71/4');
    expect(formatNumber(17.75, 'decimal')).toBe('17.75');
    expect(frac(35.5)).toBe('71/2');
    expect(frac(46 / 51)).toBe('46/51');
  });

  test('gerçek π ve köklü değerler yine sembolik gösterilir', () => {
    expect(frac(Math.PI / 2)).toBe('π/2');
    expect(frac(round(3 * Math.PI / 4))).toBe('3π/4');
    expect(frac(Math.SQRT2)).toBe('√2');
    expect(frac(round(Math.sqrt(61)))).toBe('√61');
  });

  test('irrasyonel sayılar kesir olarak gösterilmez', () => {
    expect(frac(round(Math.PI ** 2))).toBe('9.869604');
    expect(frac(round(Math.E))).toBe('2.718282');
  });
});

describe('2x2 özdeğer: tam sayı olmayan girişler', () => {
  test('[[0.5,0.25],[0.25,0.5]] → 3/4 ve 1/4, özvektörler (1,1) ve (1,-1)', () => {
    const r = eigen([[0.5, 0.25], [0.25, 0.5]], 'tr', 'fraction');
    expect(r.success).toBe(true);
    const er = r.eigenResult!;
    expect(er.eigenvalues[0]).toBeCloseTo(0.75, 10);
    expect(er.eigenvalues[1]).toBeCloseTo(0.25, 10);
    expect(er.eigenvectors[0]).toEqual([1, 1]);
    expect(er.eigenvectors[1]).toEqual([1, -1]);
    expect(er.radicalExpressions).toEqual([null, null]);
  });

  test('[[1,1/3],[1/2,1]] → 1 ± √6/6', () => {
    const r = eigen([[1, 1 / 3], [1 / 2, 1]], 'tr', 'fraction');
    const er = r.eigenResult!;
    expect(er.radicalExpressions).toEqual(['(6 + √6) / 6', '(6 - √6) / 6']);
    expect(er.eigenvalues[0]).toBeCloseTo(1 + Math.sqrt(6) / 6, 10);
  });

  test('tam sayılı girişte eski gösterim korunur', () => {
    const r = eigen([[1, 2], [3, 4]], 'tr', 'fraction');
    expect(r.eigenResult!.radicalExpressions).toEqual(['(5 + √33) / 2', '(5 - √33) / 2']);
  });
});

describe('numberToInputText: hücreye geri yazılan metin', () => {
  test('1/3 ve π/2 ham ondalığa dönüşmez', () => {
    expect(numberToInputText(1 / 3)).toBe('1/3');
    expect(numberToInputText(-2 / 7)).toBe('-2/7');
    expect(numberToInputText(Math.PI / 2)).toBe('pi/2');
    expect(numberToInputText(-3 * Math.PI / 4)).toBe('-3pi/4');
  });

  test('tam sayı ve kısa ondalıklar olduğu gibi kalır', () => {
    expect(numberToInputText(2)).toBe('2');
    expect(numberToInputText(0)).toBe('0');
    expect(numberToInputText(0.5)).toBe('0.5');
    expect(numberToInputText(2.75)).toBe('2.75');
  });

  test('metin → sayı turu değeri korur', () => {
    for (const v of [1 / 3, -2 / 7, Math.PI, Math.PI / 2, 0.125, 5 / 11]) {
      expect(parseFractionalInput(numberToInputText(v))).toBeCloseTo(v, 10);
    }
  });
});
