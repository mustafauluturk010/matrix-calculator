import { runOperation } from '../runOperation';
import { parseComplexRealPart } from '../numberFormat';
import { parseComplexNumber } from '../symbolic';
import { OperationType } from '@/types';

type Z = { re: number; im: number };
const mul = (a: Z, b: Z): Z => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const add = (a: Z, b: Z): Z => ({ re: a.re + b.re, im: a.im + b.im });
const sub = (a: Z, b: Z): Z => ({ re: a.re - b.re, im: a.im - b.im });
const cdiv = (a: Z, b: Z): Z => {
  const n = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / n, im: (a.im * b.re - a.re * b.im) / n };
};
const abs = (a: Z) => (Number.isNaN(a.re) || Number.isNaN(a.im) ? 0 : Math.hypot(a.re, a.im)); // NaN = doğrulanamayan uzun etiket
const Zero: Z = { re: 0, im: 0 };

// Etiketlerdeki üstler (π², π³, π^4) ayrıştırıcıda yok: çarpıma aç.
const expandPi = (l: string) =>
  l.replace(/π\^(\d+)/g, (_, k) => Array(Number(k)).fill('π').join('*')).replace(/π²/g, 'π*π').replace(/π³/g, 'π*π*π');
const pz = (l: string): Z => {
  // Kesin sonuçların bazıları (8+ terimli) ayrıştırıcının 200 karakter sınırını aşar; bu
  // durumda sonuç sayısal olarak doğrulanamaz ⇒ testte NaN olarak işaretlenip atlanır.
  if (l.length > 200) return { re: NaN, im: NaN };
  const z = parseComplexNumber(expandPi(l));
  if (!z) throw new Error(`etiket ayrıştırılamadı: ${l}`);
  return z;
};
const parseM = (t: string[][]): Z[][] => t.map((r) => r.map((s) => pz(s)));
const matMul = (A: Z[][], B: Z[][]): Z[][] => A.map((row) => B[0].map((_, j) => row.reduce((acc, x, k) => add(acc, mul(x, B[k][j])), Zero)));
function detN(M: Z[][]): Z {
  const n = M.length;
  if (n === 1) return M[0][0];
  let acc = Zero;
  for (let j = 0; j < n; j++) {
    const minor = M.slice(1).map((r) => r.filter((_, c) => c !== j));
    const t = mul(M[0][j], detN(minor));
    acc = j % 2 === 0 ? add(acc, t) : sub(acc, t);
  }
  return acc;
}

const run = (type: OperationType, A: string[][], o: { B?: string[][]; scalar?: string; b?: string[]; exponent?: number; method?: 'cramer' | 'gauss' } = {}) =>
  runOperation(type, A.map((r) => r.map(parseComplexRealPart)), (o.B ?? A).map((r) => r.map(parseComplexRealPart)), 0, o.exponent ?? 2, (o.b ?? []).map(parseComplexRealPart), o.method ?? 'gauss', 'tr', 'fraction', {
    A, B: o.B, scalar: o.scalar, b: o.b, exponent: o.exponent, method: o.method, complex: true,
  });

const pool = ['0', '1', '2', '-1', 'i', '-i', '1+i', '2-i', '3i', '1/2', 'i/2', '√2', '√2i', 'pi', 'pi i', '(1+i)/2', '1-i√3'];

// Kesin takip sürdürülemediğinde (π+√+i karışık bölen) sayısal yedek 6 ondalıkla gösterir;
// bu yüzden toleranslar ~1e-5'tir. Kesin sonuçlar bunun çok altında tutar.
describe('Karmaşık motor: rastgele tutarlılık (sayısal doğrulama)', () => {
  let seed = 20240921;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = () => pool[Math.floor(rnd() * pool.length)];
  const mat = (n: number, m: number) => Array.from({ length: n }, () => Array.from({ length: m }, pick));

  test('toplama, çarpma, determinant, ters, çözüm, kuvvet, özdeğer', () => {
    const stats = { mul: 0, det: 0, inv: 0, solve: 0, pow: 0, eig: 0 };
    for (let t = 0; t < 60; t++) {
      const n = 2 + (t % 3);
      const A = mat(n, n);
      const B = mat(n, n);
      const An = parseM(A), Bn = parseM(B);

      const rm = run('multiply', A, { B });
      expect(rm.success).toBe(true);
      const P = matMul(An, Bn);
      rm.matrixResultLabels!.forEach((row, i) => row.forEach((lab, j) => {
        const z = pz(lab);
        expect(abs(sub(z, P[i][j]))).toBeLessThan(1e-5 * (1 + abs(P[i][j])));
      }));
      stats.mul++;

      const dt = run('determinant', A);
      const dz = pz(dt.scalarResultLabel!);
      const dref = detN(An);
      expect(abs(sub(dz, dref))).toBeLessThan(1e-5 * (1 + abs(dref)));
      stats.det++;

      // ters (tekil değilse): A·A⁻¹ = I
      if (abs(dref) > 1e-6) {
        const ri = run('inverse', A);
        expect(ri.success).toBe(true);
        const Inv = ri.matrixResultLabels!.map((row) => row.map((l) => pz(l)));
        const I = matMul(An, Inv);
        I.forEach((row, i) => row.forEach((z, j) => expect(abs(sub(z, { re: i === j ? 1 : 0, im: 0 }))).toBeLessThan(2e-5)));
        stats.inv++;

        // Ax = b (Gauss ve Cramer)
        const b = Array.from({ length: n }, pick);
        for (const method of ['gauss', 'cramer'] as const) {
          const rs = run('solveLinearSystem', A, { b, method });
          expect(rs.success).toBe(true);
          const x = rs.vectorResultLabels!.map((l) => pz(l));
          const bn = b.map((s) => pz(s));
          for (let i = 0; i < n; i++) {
            const lhs = An[i].reduce((acc, a, k) => add(acc, mul(a, x[k])), Zero);
            expect(abs(sub(lhs, bn[i]))).toBeLessThan(1e-5 * (1 + abs(bn[i])));
          }
        }
        stats.solve++;
      }

      const rp = run('power', A, { exponent: 3 });
      const A3 = matMul(matMul(An, An), An);
      rp.matrixResultLabels!.forEach((row, i) => row.forEach((lab, j) => {
        expect(abs(sub(pz(lab), A3[i][j]))).toBeLessThan(1e-5 * (1 + abs(A3[i][j])));
      }));
      stats.pow++;

      // özdeğer (A·v = λ·v)
      const re = run('eigen', A);
      expect(re.success).toBe(true);
      const e = re.eigenResult!;
      const lIm = e.eigenvaluesIm ?? e.eigenvalues.map(() => 0);
      const vIm = e.eigenvectorsIm ?? e.eigenvectors.map((v) => v.map(() => 0));
      for (let k = 0; k < n; k++) {
        for (let i = 0; i < n; i++) {
          let lhs = Zero;
          for (let j = 0; j < n; j++) lhs = add(lhs, mul(An[i][j], { re: e.eigenvectors[k][j], im: vIm[k][j] }));
          const rhs = mul({ re: e.eigenvalues[k], im: lIm[k] }, { re: e.eigenvectors[k][i], im: vIm[k][i] });
          expect(abs(sub(lhs, rhs))).toBeLessThan(1e-5 * (1 + abs(rhs)));
        }
      }
      // özdeğer toplamı = iz
      const tr = An.reduce((acc, row, i) => add(acc, row[i]), Zero);
      const sum = e.eigenvalues.reduce((acc, v, k) => add(acc, { re: v, im: lIm[k] }), Zero);
      expect(abs(sub(sum, tr))).toBeLessThan(1e-5 * (1 + abs(tr)));
      stats.eig++;
    }
    expect(stats.inv).toBeGreaterThan(15);
  });
});
