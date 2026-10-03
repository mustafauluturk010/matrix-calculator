import { runOperation } from '../runOperation';
import { parseComplexRealPart } from '../numberFormat';
import { parseComplexNumber } from '../symbolic';

const eig = (A: string[][], complex = false, lang: 'tr' | 'en' = 'tr', mode: 'decimal' | 'fraction' = 'fraction') => {
  const M = A.map((r) => r.map(parseComplexRealPart));
  return runOperation('eigen', M, M, 0, 2, [], 'gauss', lang, mode, { A, complex });
};

/** A·v = λ·v (karmaşık, sayısal) */
function expectValid(A: string[][], r: ReturnType<typeof eig>) {
  expect(r.success).toBe(true);
  const n = A.length;
  const M = A.map((row) => row.map((t) => parseComplexNumber(t)!));
  const e = r.eigenResult!;
  const lIm = e.eigenvaluesIm ?? e.eigenvalues.map(() => 0);
  const vIm = e.eigenvectorsIm ?? e.eigenvectors.map((v) => v.map(() => 0));
  for (let k = 0; k < n; k++) {
    let nrm = 0;
    for (let i = 0; i < n; i++) nrm += e.eigenvectors[k][i] ** 2 + vIm[k][i] ** 2;
    expect(nrm).toBeGreaterThan(1e-12);
    for (let i = 0; i < n; i++) {
      let re = 0, im = 0;
      for (let j = 0; j < n; j++) {
        re += M[i][j].re * e.eigenvectors[k][j] - M[i][j].im * vIm[k][j];
        im += M[i][j].re * vIm[k][j] + M[i][j].im * e.eigenvectors[k][j];
      }
      const er = e.eigenvalues[k] * e.eigenvectors[k][i] - lIm[k] * vIm[k][i];
      const ei = e.eigenvalues[k] * vIm[k][i] + lIm[k] * e.eigenvectors[k][i];
      expect(Math.hypot(re - er, im - ei)).toBeLessThan(1e-7 * (1 + Math.hypot(er, ei)));
    }
  }
}

describe('Karmaşık girişli özdeğer (karmaşık sayı modu)', () => {
  test('Hermitian [[2, i],[−i, 2]]: λ = 3, 1; özvektörler karmaşık', () => {
    const A = [['2', 'i'], ['-i', '2']];
    const r = eig(A, true);
    expect(r.eigenResult!.radicalExpressions).toEqual(['3', '1']);
    expectValid(A, r);
  });
  test('[[1, i],[i, 1]]: λ = 1 ± i', () => {
    const A = [['1', 'i'], ['i', '1']];
    const r = eig(A, true);
    expect(r.eigenResult!.radicalExpressions).toEqual(['1 + i', '1 - i']); // iz 2, det 1−i² = 2 ⇒ λ² − 2λ + 2 = 0
    expectValid(A, r);
  });
  test('[[0, −1],[1, 0]] (gerçel dönme) karmaşık modda i içermeden de doğru: ±i', () => {
    const A = [['0', '-1'], ['1', '0+i*0']];
    const r = eig(A, true);
    expect(r.eigenResult!.radicalExpressions).toEqual(['i', '-i']);
    expectValid(A, r);
  });
  test('köşegen karmaşık 3x3: λ = 1+i, 2i, 3', () => {
    const A = [['1+i', '0', '0'], ['0', '2i', '0'], ['0', '0', '3']];
    const r = eig(A, true);
    expect(new Set(r.eigenResult!.radicalExpressions)).toEqual(new Set(['1 + i', '2i', '3']));
    expectValid(A, r);
  });
  test('üst üçgen 3x3 karmaşık, tekrarlı özdeğer, özuzay boyutu', () => {
    const A = [['i', '1', '0'], ['0', 'i', '0'], ['0', '0', '2']];
    const r = eig(A, true);
    expect(r.eigenResult!.radicalExpressions!.filter((x) => x === 'i').length).toBe(2);
    expect(r.steps[r.steps.length - 1].description).toContain('köşegenleştirilemez');
    expectValid(A, r);
  });
  test('irrasyonel kesin özdeğer: [[0, i],[−i... ]] ve √ içeren giriş', () => {
    // [[√2, i],[−i, √2]]: λ = √2 ± 1
    const A = [['√2', 'i'], ['-i', '√2']];
    const r = eig(A, true);
    expect(new Set(r.eigenResult!.radicalExpressions)).toEqual(new Set(['1 + √2', '-1 + √2']));
    expectValid(A, r);
  });
  test('4x4 karmaşık (blok): kesin özdeğerler', () => {
    const A = [
      ['2', 'i', '0', '0'],
      ['-i', '2', '0', '0'],
      ['0', '0', '1', '0'],
      ['0', '0', '0', '5i'],
    ];
    const r = eig(A, true);
    expect(new Set(r.eigenResult!.radicalExpressions)).toEqual(new Set(['3', '1', '5i']));
    expectValid(A, r);
  });
  test('bulunamayan kesin form: sayısal karmaşık QR yedeği, yine A·v = λ·v', () => {
    const A = [['1', 'i', '0'], ['2', '1', 'i'], ['0', '1+i', '3']];
    const r = eig(A, true);
    expectValid(A, r);
  });
  test('ondalık mod, İngilizce not', () => {
    const r = eig([['i', '1'], ['0', 'i']], true, 'en', 'decimal');
    expect(r.steps[r.steps.length - 1].description).toContain('not diagonalizable');
  });
});

describe('Gerçel 4x4+ özdeğer (madde: 4x4 ve üzeri)', () => {
  test('opak diskriminant: gerçel 4x4, √(...) biçiminde KESİN', () => {
    const A = [['1', '0', '0', '0'], ['0', 'pi', '1', '0'], ['0', '1', '√2', '0'], ['0', '0', '0', '3']];
    const r = eig(A);
    expect(r.eigenResult!.radicalExpressions!.some((x) => x!.includes('√('))).toBe(true);
    expectValid(A, r);
  });

  test('opak diskriminant: karmaşık 4x4 (negatif, 3 terimli Δ), i√(...) biçiminde KESİN', () => {
    const A = [['pi', '-1', '0', '0'], ['1', '√2', '0', '0'], ['0', '0', '2', '0'], ['0', '0', '0', '5']];
    const r = eig(A);
    expect(r.eigenResult!.radicalExpressions!.some((x) => x!.includes('i√('))).toBe(true);
    expect(r.eigenResult!.eigenvaluesIm).toBeDefined();
    expectValid(A, r);
  });

  test('opak diskriminant: 5x5 (kofaktör null vektör n−1=4 sınırında)', () => {
    const A = [
      ['1', '0', '0', '0', '0'],
      ['0', '2', '0', '0', '0'],
      ['0', '0', 'pi', '1', '0'],
      ['0', '0', '1', '√2', '0'],
      ['0', '0', '0', '0', '7'],
    ];
    const r = eig(A);
    expect(r.eigenResult!.radicalExpressions!.some((x) => x!.includes('√('))).toBe(true);
    expectValid(A, r);
  });

  test('opak diskriminant: 6x6 (n−1=5 > kofaktör sınırı) ⇒ o çift sayısal, gerisi yine kesin', () => {
    const A = [
      ['1', '0', '0', '0', '0', '0'],
      ['0', '2', '0', '0', '0', '0'],
      ['0', '0', 'pi', '1', '0', '0'],
      ['0', '0', '1', '√2', '0', '0'],
      ['0', '0', '0', '0', '7', '0'],
      ['0', '0', '0', '0', '0', '8'],
    ];
    const r = eig(A);
    expect(r.eigenResult!.radicalExpressions).toEqual(expect.arrayContaining(['8', '7', '2', '1']));
    expectValid(A, r);
  });


  test('köşegen-üstü simetrik 4x4: tamsayı özdeğerler kesin, özvektörler tamsayı', () => {
    // [[2,1,0,0],[1,2,0,0],[0,0,3,1],[0,0,1,3]] → λ = 4, 2, 3±... : 2±1 → 3,1 ; 3±1 → 4,2
    const A = [['2', '1', '0', '0'], ['1', '2', '0', '0'], ['0', '0', '3', '1'], ['0', '0', '1', '3']];
    const r = eig(A);
    expect(r.eigenResult!.radicalExpressions).toEqual(['4', '3', '2', '1']);
    expect(r.eigenResult!.eigenvectorRadicals).toEqual([['0', '0', '1', '1'], ['1', '1', '0', '0'], ['0', '0', '1', '-1'], ['1', '-1', '0', '0']]);
    expectValid(A, r);
  });
  test('4x4 tekrarlı özdeğer: J₄ (hepsi 1): λ = 4, 0, 0, 0; özuzay 3 boyutlu', () => {
    const A = [['1', '1', '1', '1'], ['1', '1', '1', '1'], ['1', '1', '1', '1'], ['1', '1', '1', '1']];
    const r = eig(A);
    expect(r.eigenResult!.radicalExpressions).toEqual(['4', '0', '0', '0']);
    expect(r.steps[r.steps.length - 1].description).toContain('özuzay 3 boyutlu');
    expectValid(A, r);
  });
  test('5x5 rasyonel: Pascal benzeri üst üçgen, defektif blok', () => {
    const A = [
      ['2', '1', '0', '0', '0'],
      ['0', '2', '0', '0', '0'],
      ['0', '0', '3', '0', '0'],
      ['0', '0', '0', '3', '0'],
      ['0', '0', '0', '0', '5'],
    ];
    const r = eig(A);
    expect(r.eigenResult!.radicalExpressions).toEqual(['5', '3', '3', '2', '2']);
    const last = r.steps[r.steps.length - 1].description;
    expect(last).toContain('köşegenleştirilemez'); // λ=2: cebirsel 2, özuzay 1
    expect(last).toContain('özuzay 2 boyutlu'); // λ=3
    expectValid(A, r);
  });
  test('4x4 irrasyonel kesin: 2 × [[2,1],[1,2]] blokları + √: λ = 3 ± √2 gibi', () => {
    // blok [[1, √2],[√2, 1]] → 1 ± √2 ; [[3,0],[0,4]] → 3, 4
    const A = [['1', '√2', '0', '0'], ['√2', '1', '0', '0'], ['0', '0', '3', '0'], ['0', '0', '0', '4']];
    const r = eig(A);
    expect(new Set(r.eigenResult!.radicalExpressions)).toEqual(new Set(['1 + √2', '1 - √2', '3', '4']));
    expectValid(A, r);
  });
  test('π içeren 4x4: ayrık blok, λ = π', () => {
    const A = [['pi', '0', '0', '0'], ['0', '1', '1', '0'], ['0', '1', '1', '0'], ['0', '0', '0', '7']];
    const r = eig(A);
    expect(new Set(r.eigenResult!.radicalExpressions)).toEqual(new Set(['π', '2', '0', '7']));
    expectValid(A, r);
  });
  test('rasyonel 4x4 karmaşık özdeğerli: dönme bloğu ⊕ diag: ±i, 2, 3', () => {
    const A = [['0', '-1', '0', '0'], ['1', '0', '0', '0'], ['0', '0', '2', '0'], ['0', '0', '0', '3']];
    const r = eig(A);
    expect(new Set(r.eigenResult!.radicalExpressions)).toEqual(new Set(['i', '-i', '2', '3']));
    expect(r.eigenResult!.eigenvaluesIm).toBeDefined();
    expectValid(A, r);
  });
  test('6x6 (üst sınır) sayısal doğruluk: rastgele-görünümlü matris', () => {
    const A = [
      ['4', '1', '2', '0', '1', '3'],
      ['1', '3', '0', '1', '2', '1'],
      ['2', '0', '5', '1', '0', '2'],
      ['0', '1', '1', '2', '1', '0'],
      ['1', '2', '0', '1', '6', '1'],
      ['3', '1', '2', '0', '1', '4'],
    ];
    const r = eig(A);
    expectValid(A, r);
    const tr = 4 + 3 + 5 + 2 + 6 + 4;
    expect(r.eigenResult!.eigenvalues.reduce((a, b) => a + b, 0)).toBeCloseTo(tr, 6);
  });
  test('2x2/3x3 gerçel yol DEĞİŞMEDİ (eski motor)', () => {
    const r = eig([['2', '1'], ['1', '2']]);
    expect(r.success).toBe(true);
    expect(r.eigenResult!.eigenvalues.length).toBe(2);
  });
});
