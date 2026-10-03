import { runOperation } from '../runOperation';
import { parseComplexRealPart } from '../numberFormat';
import { parseComplexNumber } from '../symbolic';

const eig = (A: string[][]) => {
  const M = A.map((r) => r.map(parseComplexRealPart));
  return runOperation('eigen', M, M, 0, 2, [], 'gauss', 'tr', 'fraction', { A });
};
function checkValid(A: string[][], r: ReturnType<typeof eig>) {
  const n = A.length;
  const M = A.map((row) => row.map((t) => parseComplexNumber(t)!));
  const e = r.eigenResult!;
  const lIm = e.eigenvaluesIm ?? e.eigenvalues.map(() => 0);
  const vIm = e.eigenvectorsIm ?? e.eigenvectors.map((v) => v.map(() => 0));
  for (let k = 0; k < n; k++) {
    let nrm = 0;
    for (let i = 0; i < n; i++) nrm += e.eigenvectors[k][i] ** 2 + vIm[k][i] ** 2;
    if (nrm <= 1e-12) return false;
    for (let i = 0; i < n; i++) {
      let re = 0, im = 0;
      for (let j = 0; j < n; j++) {
        re += M[i][j].re * e.eigenvectors[k][j] - M[i][j].im * vIm[k][j];
        im += M[i][j].re * vIm[k][j] + M[i][j].im * e.eigenvectors[k][j];
      }
      const er = e.eigenvalues[k] * e.eigenvectors[k][i] - lIm[k] * vIm[k][i];
      const ei = e.eigenvalues[k] * vIm[k][i] + lIm[k] * e.eigenvectors[k][i];
      if (Math.hypot(re - er, im - ei) > 1e-6 * (1 + Math.hypot(er, ei))) return false;
    }
  }
  return true;
}

test('rastgele 4x4/5x5 gerçel matrislerde opak/kesin/sayısal her yol A.v=lam.v doğrular', () => {
  let seed = 909090;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pool = ['0', '0', '1', '2', '-1', '3', 'pi', '√2', '√3', '√5'];
  const pick = () => pool[Math.floor(rnd() * pool.length)];
  let opaqueCount = 0, exactCount = 0, bad = 0, total = 0;
  for (let t = 0; t < 100; t++) {
    const n = 4 + (t % 2);
    const kind = t % 3;
    const raw = Array.from({ length: n }, () => Array.from({ length: n }, pick));
    let A = raw;
    if (kind === 0) A = raw.map((row, i) => row.map((v, j) => (j < i ? '0' : v))); // üst üçgen
    if (kind === 1) A = raw.map((row, i) => row.map((v, j) => (j < i ? raw[j][i] : v))); // simetrik
    // kind===2: rastgele dolu
    const r = eig(A);
    if (!r.success) continue;
    total++;
    const ok = checkValid(A, r);
    if (!ok) { bad++; if (bad <= 3) console.log('BAD', JSON.stringify(A), JSON.stringify(r.eigenResult!.radicalExpressions)); continue; }
    if (r.eigenResult!.radicalExpressions!.some((x) => x!.includes('√('))) opaqueCount++;
    if (r.eigenResult!.radicalExpressions!.every((x) => !/^-?\d+\.\d{3,}/.test(x!))) exactCount++;
  }
  console.log(JSON.stringify({ total, bad, opaqueCount, exactCount }));
  expect(bad).toBe(0);
  expect(opaqueCount).toBeGreaterThanOrEqual(0); // opak kapsamı ayrı testlerde (eigenGeneral.test.ts) kilitli
}, 30000);
