import { runOperation } from '../runOperation';
// Testte ham metinler (π içerir) doğrudan verildiği için ifade değerlendiricisi kullanılır
// (UI'da metinler önce sanitizeFractionalInputText'ten geçer).
import { parseExpressionNumber as parseFractionalInput } from '../symbolic';
import { OperationType } from '@/types';

const num = (t: string[][]) => t.map((r) => r.map(parseFractionalInput));
const go = (
  type: OperationType,
  A: string[][],
  o: { B?: string[][]; b?: string[]; scalar?: string; exponent?: number; method?: 'gauss' | 'cramer' } = {}
) =>
  runOperation(type, num(A), num(o.B ?? A), parseFractionalInput(o.scalar ?? '2'), o.exponent ?? 2, (o.b ?? []).map(parseFractionalInput), o.method ?? 'gauss', 'tr', 'fraction', {
    A, B: o.B, scalar: o.scalar, b: o.b, exponent: o.exponent, method: o.method,
  });

const matmul = (A: number[][], B: number[][]) => A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => s + x * B[k][j], 0)));

describe('SymFrac cismi: çok terimli π+kök pivot/bölen (eski sınırlar kalktı)', () => {
  const P = 'π+√2';

  test('RREF: pivot π+√2 (çok terimli) ⇒ artık KESİN', () => {
    const r = go('rref', [[P, '2π+2√2'], ['1', '2']]);
    expect(r.success).toBe(true);
    expect(r.matrixResultLabels).toEqual([['1', '2'], ['0', '0']]);
  });

  test('rank ve Gauss eliminasyonu', () => {
    expect(go('rank', [[P, '2π+2√2'], ['1', '2']]).scalarResult).toBe(1);
    // İki aday pivot da çok terimli (π+√2, π−√2): SymNum yolu bölemez, SymFrac devreye girer.
    const g = go('gaussElimination', [[P, '1'], ['π-√2', '2']]);
    expect(g.success).toBe(true);
    expect(g.matrixResultLabels).toBeDefined(); // ondalık motora düşmedi
    // ikinci pivot: 2 − (π−√2)/(π+√2)
    expect(g.matrixResult![1][1]).toBeCloseTo(2 - (Math.PI - Math.SQRT2) / (Math.PI + Math.SQRT2), 12);
    expect(g.matrixResult![1][0]).toBe(0);
  });

  test('LU: P·A = L·U kesin çarpanlarla, sayısal olarak doğrulanır', () => {
    const A = [[P, '1', '0'], ['1', '2', '1'], ['0', '1', '3']];
    const r = go('lu', A);
    expect(r.success).toBe(true);
    expect(r.luResultLabels).toBeDefined();
    const { L, U, P: Pm } = r.luResult!;
    const PA = matmul(Pm!, num(A));
    const LU = matmul(L, U);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(LU[i][j]).toBeCloseTo(PA[i][j], 10);
  });

  test('denklem çözme (Gauss): A·x = b', () => {
    const A = [[P, '1'], ['1', '2']];
    const b = ['1', '2'];
    const r = go('solveLinearSystem', A, { b, method: 'gauss' });
    expect(r.success).toBe(true);
    const x = r.vectorResult!;
    const An = num(A);
    for (let i = 0; i < 2; i++) expect(An[i][0] * x[0] + An[i][1] * x[1]).toBeCloseTo(parseFractionalInput(b[i]), 12);
  });

  test('hücreye 1/(π+√2) yazılabilir: toplama, çarpma, ters', () => {
    const cell = '1/(π+√2)';
    const add = go('add', [[cell]], { B: [['1']] });
    expect(add.success).toBe(true);
    expect(add.matrixResult![0][0]).toBeCloseTo(1 + 1 / (Math.PI + Math.SQRT2), 12);
    expect(add.matrixResultLabels).toBeDefined(); // sembolik: ondalık motora düşmedi
    expect(add.matrixResultLabels![0][0]).toContain('/(-2 + π²)'); // payda π² − 2 (köksüz)

    const mul = go('multiply', [[cell]], { B: [[P]] });
    expect(mul.matrixResultLabels).toEqual([['1']]); // (1/(π+√2))·(π+√2) = 1, KESİN sadeleşir

    const inv = go('inverse', [[cell, '0'], ['0', '1']]);
    expect(inv.matrixResultLabels).toEqual([['√2 + π', '0'], ['0', '1']]);
  });

  test('determinant / iz / transpoz / skaler / üs Frac ile', () => {
    const A = [['1/(π+√2)', '1'], ['2', '3']];
    const d = go('determinant', A);
    expect(d.scalarResult).toBeCloseTo(3 / (Math.PI + Math.SQRT2) - 2, 12);
    expect(go('trace', A).scalarResult).toBeCloseTo(1 / (Math.PI + Math.SQRT2) + 3, 12);
    const p = go('power', A, { exponent: 3 });
    const An = num(A);
    const ref = matmul(matmul(An, An), An);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) expect(p.matrixResult![i][j]).toBeCloseTo(ref[i][j], 10);
  });

  test('adım metinleri gerçel sayıda "karmaşık" demez', () => {
    const r = go('add', [['1/(π+√2)']], { B: [['1']] });
    expect(JSON.stringify(r.steps)).not.toMatch(/armaşık|omplex/);
  });

  test('okunamayacak kadar uzun sonuç ⇒ ondalık motora düşer (sonuç yine doğru)', () => {
    const A = [['π', '√2', '√3'], ['√5', 'π+1', '√7'], ['√2', '√3', 'π']];
    const r = go('rref', A);
    expect(r.success).toBe(true);
  });

  test('tamamen rasyonel giriş: davranış değişmez (ondalık motor)', () => {
    const r = go('rref', [['1', '2'], ['3', '4']]);
    expect(r.success).toBe(true);
    expect(r.matrixResultLabels).toBeUndefined();
  });
});

describe('SymFrac motoru: rastgele tutarlılık', () => {
  let seed = 424242;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pool = ['0', '1', '2', '-1', '3', 'π', '√2', '√3', 'π+√2', '√3-π', '1/(π+√2)', '2π-√2', '1/2', '√2/2'];
  const pick = () => pool[Math.floor(rnd() * pool.length)];

  test('RREF/rank/LU/çözüm: sembolik dönen her sonuç sayısal olarak doğru', () => {
    let symbolic = 0;
    for (let t = 0; t < 80; t++) {
      const n = 2 + (t % 2);
      const A = Array.from({ length: n }, () => Array.from({ length: n }, pick));
      const An = num(A);

      const lu = go('lu', A);
      if (lu.success && lu.luResultLabels) {
        symbolic++;
        const { L, U, P } = lu.luResult!;
        const PA = matmul(P!, An);
        const LU = matmul(L, U);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) expect(Math.abs(LU[i][j] - PA[i][j])).toBeLessThan(1e-8 * (1 + Math.abs(PA[i][j])));
      }

      const b = Array.from({ length: n }, pick);
      const sol = go('solveLinearSystem', A, { b, method: 'gauss' });
      if (sol.success && sol.vectorResultLabels) {
        symbolic++;
        const bn = b.map(parseFractionalInput);
        for (let i = 0; i < n; i++) {
          const lhs = An[i].reduce((s, a, k) => s + a * sol.vectorResult![k], 0);
          expect(Math.abs(lhs - bn[i])).toBeLessThan(1e-7 * (1 + Math.abs(bn[i])));
        }
      }

      const rr = go('rref', A);
      if (rr.success && rr.matrixResultLabels) {
        symbolic++;
        // RREF'in her satırı A'nın satır uzayında: rank(A) = rank(RREF) ve A = (tersinir)·RREF
        const R = rr.matrixResult!;
        const rank = go('rank', A).scalarResult!;
        const nonzeroRows = R.filter((row) => row.some((x) => Math.abs(x) > 1e-9)).length;
        expect(nonzeroRows).toBe(rank);
      }
    }
    expect(symbolic).toBeGreaterThan(30);
  });
});
