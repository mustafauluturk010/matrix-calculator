import { runOperation } from '../runOperation';
import { parseFractionalInput } from '../numberFormat';
import { parseSymbolicInput, symToNumber } from '../symbolic';
const matmul = (X: number[][], Y: number[][]) => X.map((r) => Y[0].map((_, j) => r.reduce((s, v, k) => s + v * Y[k][j], 0)));
const numRank = (m: number[][]) => {
  const a = m.map((r) => [...r]); let rank = 0; const R = a.length, C = a[0].length;
  for (let c = 0; c < C && rank < R; c++) {
    let p = rank; for (let r = rank; r < R; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-9) continue;
    [a[rank], a[p]] = [a[p], a[rank]];
    for (let r = rank + 1; r < R; r++) { const f = a[r][c] / a[rank][c]; for (let k = c; k < C; k++) a[r][k] -= f * a[rank][k]; }
    rank++;
  }
  return rank;
};
// Rastgele π/√ matrislerinde ters, denklem çözme, rank ve negatif üs: sembolik (SymFrac dahil)
// dönen her sonuç sayısal olarak da doğrulanır. (Hızlı tutmak için 200 örnek.)
test('SymFrac yolu: rastgele matrislerde sayısal tutarlılık', () => {
  let seed = 5;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pool = ['0', '1', '2', '-1', '3', '√2', '√3', '-√2', 'pi', '1/2', '1+√2', 'pi-1', '2pi'];
  const pick = () => pool[Math.floor(rnd() * pool.length)];
  const stats: any = { inv: 0, invFrac: 0, sol: 0, solFrac: 0, rank: 0, rankMin: 0, pow: 0, powFrac: 0 }; const bad: string[] = [];
  for (let t = 0; t < 200; t++) {
    const n = 2 + (t % 2);
    const A = Array.from({ length: n }, () => Array.from({ length: n }, pick));
    const M = A.map((r) => r.map((x) => parseFractionalInput(x)));
    const N = A.map((r) => r.map((x) => symToNumber(parseSymbolicInput(x)!)));
    const call = (type: any, extra: any = {}) => runOperation(type, M, [[0]], 0, extra.exponent ?? 2, extra.b?.map((x: string) => parseFractionalInput(x)) ?? [], 'gauss', 'tr', 'fraction', { A, b: extra.b, exponent: extra.exponent });
    const inv = call('inverse');
    if (inv.success) {
      stats.inv++; if (inv.matrixResultLabels?.some((r) => r.some((x) => x.includes(')/(') || /\/\(/.test(x)))) stats.invFrac++;
      const I = matmul(N, inv.matrixResult!);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (Math.abs(I[i][j] - (i === j ? 1 : 0)) > 1e-7) bad.push('inv ' + JSON.stringify(A));
    }
    const b = Array.from({ length: n }, pick);
    const sol = call('solveLinearSystem', { b });
    if (sol.success && sol.vectorResult) {
      stats.sol++; if (sol.vectorResultLabels?.some((x) => /\/\(/.test(x))) stats.solFrac++;
      const bn = b.map((x) => symToNumber(parseSymbolicInput(x)!));
      for (let i = 0; i < n; i++) { const s = N[i].reduce((a, v, j) => a + v * sol.vectorResult![j], 0); if (Math.abs(s - bn[i]) > 1e-7 * (1 + Math.abs(bn[i]))) bad.push('sol ' + JSON.stringify(A) + JSON.stringify(b)); }
    }
    const rk = call('rank');
    if (rk.success) { stats.rank++; if (rk.steps.some((s) => s.title.includes('minör'))) stats.rankMin++; if (rk.scalarResult !== numRank(N)) bad.push('rank ' + JSON.stringify(A) + rk.scalarResult + ' vs ' + numRank(N)); }
    const pw = call('power', { exponent: -2 });
    if (pw.success && pw.matrixResult) {
      stats.pow++; if (pw.matrixResultLabels?.some((r) => r.some((x) => /\/\(/.test(x)))) stats.powFrac++;
      const invN = inv.success ? inv.matrixResult! : null;
      if (invN) { const sq = matmul(invN, invN); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (Math.abs(sq[i][j] - pw.matrixResult[i][j]) > 1e-6 * (1 + Math.abs(sq[i][j]))) bad.push('pow ' + JSON.stringify(A)); }
    }
  }
  expect(bad.slice(0, 5)).toEqual([]);
  expect(stats.inv).toBeGreaterThan(20); // sembolik yol gerçekten çalışıyor
});
