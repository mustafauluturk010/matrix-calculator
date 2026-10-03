import { runOperation } from '../runOperation';
import { setDecimalPlaces } from '../displaySettings';
import { parseFractionalInput } from '../numberFormat';

describe('Ondalık basamak ayarı sonuçlara anında yansır', () => {
  afterEach(() => setDecimalPlaces(6));

  it('karmaşık özdeğer etiketleri basamak sayısıyla birlikte değişir (eski önbellek hatası)', () => {
    const A = [[1, 1], [1, 2]];
    const sym = { A: [['1+i', '1'], ['1', '2']], complex: true };
    setDecimalPlaces(6);
    const a = runOperation('eigen', A, A, 0, 2, [], 'gauss', 'tr', 'decimal', sym);
    setDecimalPlaces(9);
    const b = runOperation('eigen', A, A, 0, 2, [], 'gauss', 'tr', 'decimal', sym);
    expect(a.eigenResult!.radicalExpressions![0]).toBe('2.529086 + 0.257066i');
    expect(b.eigenResult!.radicalExpressions![0]).toBe('2.529085514 + 0.257065864i');
  });
});

describe('3x3 özdeğer, kesirli mod: köklü özdeğerler tam gösterilir', () => {
  const go = (A: string[][], mode: 'fraction' | 'decimal' = 'fraction') => {
    const M = A.map((r) => r.map((t) => parseFractionalInput(t)));
    return runOperation('eigen', M, M, 0, 2, [], 'gauss', 'tr', mode, { A });
  };

  it('2±√10 özdeğerleri ondalığa düşmez', () => {
    const r = go([['4', '2', '0'], ['3', '0', '0'], ['0', '2', '0']]);
    expect(r.success).toBe(true);
    expect(r.eigenResult!.radicalExpressions).toEqual(['2 + √10', '0', '2 - √10']);
  });

  it('ondalık modda sayısal motor aynen çalışır', () => {
    const r = go([['4', '2', '0'], ['3', '0', '0'], ['0', '2', '0']], 'decimal');
    expect(r.eigenResult!.radicalExpressions?.every((x) => x === null)).toBe(true);
  });

  it('rasyonel özdeğerli 3x3 davranışı değişmez', () => {
    const r = go([['2', '1', '0'], ['1', '2', '0'], ['0', '0', '3']]);
    expect(r.eigenResult!.radicalExpressions?.every((x) => x === null)).toBe(true);
  });
});
