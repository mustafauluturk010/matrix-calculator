import { runOperation } from '../runOperation';

const run = (A: number[][], texts: string[][], lang: 'tr' | 'en' = 'tr') =>
  runOperation('hermitian', A, A, 2, 2, [], 'gauss', lang, 'fraction', { A: texts, complex: true });

describe('Hermitian eşlenik transpoz', () => {
  it('karmaşık girişte eşlenik alıp transpoz eder', () => {
    const r = run([[3, 0], [5, 1]], [['3+2i', '-i'], ['5', '1-4i']]);
    expect(r.success).toBe(true);
    expect(r.matrixResultLabels).toEqual([['3 - 2i', '5'], ['i', '1 + 4i']]);
  });
  it('kare olmayan matrislerde de çalışır', () => {
    const r = run([[1, 2, 3]], [['1+i', '2', '3-2i']], 'en');
    expect(r.matrixResultLabels).toEqual([['1 - i'], ['2'], ['3 + 2i']]);
  });
  it('gerçel girişte Aᴴ = Aᵀ olur', () => {
    const r = run([[1, 2], [3, 4]], [['1', '2'], ['3', '4']]);
    expect(r.matrixResult).toEqual([[1, 3], [2, 4]]);
  });
  it('düz transpoz eşlenik almaz', () => {
    const r = runOperation('transpose', [[3, 0], [5, 1]], [[0]], 2, 2, [], 'gauss', 'en', 'fraction', {
      A: [['3+2i', '-i'], ['5', '1-4i']],
      complex: true,
    });
    expect(r.matrixResultLabels).toEqual([['3 + 2i', '5'], ['-i', '1 - 4i']]);
  });
});
