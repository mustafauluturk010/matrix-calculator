import { runOperation } from '../runOperation';
import { setDecimalPlaces } from '../displaySettings';
import { formatNumber, parseFractionalInput } from '../numberFormat';

const go = (op: any, T: string[][], mode: 'decimal' | 'fraction', extra: any = {}) => {
  const M = T.map((r) => r.map((t) => parseFractionalInput(t)));
  return runOperation(op, M, M, 2, 2, [1, 1], 'gauss', 'tr', mode, { A: T, B: T, scalar: '2', ...extra });
};

describe('ONDALIK mod: köklü/π\'li sembol yok', () => {
  afterEach(() => setDecimalPlaces(6));

  it('formatNumber: √ ve π katları ondalık yazılır', () => {
    expect(formatNumber(0.4931969619160719, 'decimal')).toBe('0.493197'); // 3√37/37 DEĞİL
    expect(formatNumber(Math.PI / 2, 'decimal')).toBe('1.570796');
  });

  it('girişte √ olan matris: sonuç etiketi yok, sayılar ondalık', () => {
    const r = go('determinant', [['√2', '1'], ['1', '√3']], 'decimal');
    expect(r.scalarResultLabel).toBeUndefined();
    expect(r.scalarResult).toBeCloseTo(Math.sqrt(6) - 1, 9);
  });

  it('özdeğer: köklü ifade yok (2x2 ve 3x3), basamak sayısı uygulanır', () => {
    const a = go('eigen', [['1', '1'], ['1', '2']], 'decimal');
    expect(a.eigenResult!.radicalExpressions!.every((x) => x === null)).toBe(true);
    expect(a.eigenResult!.eigenvectorRadicals).toBeUndefined();
    const b = go('eigen', [['4', '2', '0'], ['3', '0', '0'], ['0', '2', '0']], 'decimal');
    expect(b.eigenResult!.radicalExpressions!.every((x) => x === null)).toBe(true);
    setDecimalPlaces(9);
    expect(formatNumber(b.eigenResult!.eigenvalues[0], 'decimal')).toBe('5.16227766');
  });

  it('karmaşık sonuç ondalık yazılır', () => {
    const M = [[0, 0], [0, 0]];
    const r = runOperation('multiply', M, M, 2, 2, [], 'gauss', 'tr', 'decimal', { A: [['1+i', '0'], ['0', '1']], B: [['1+i', '0'], ['0', '1']], complex: true });
    expect(r.matrixResultLabels![0][0]).toBe('2i'); // (1+i)² = 2i
    const z = runOperation('multiply', M, M, 2, 2, [], 'gauss', 'tr', 'decimal', { A: [['√2+i', '0'], ['0', '1']], B: [['1', '0'], ['0', '1']], complex: true });
    expect(z.matrixResultLabels![0][0]).toBe('1.414214 + i');
  });
});

describe('KESİRLİ mod: kullanıcı ondalık görmez (tam ifade varsa)', () => {
  it('3x3: 2±√10 özdeğerleri ve tam özvektörler', () => {
    const r = go('eigen', [['4', '2', '0'], ['3', '0', '0'], ['0', '2', '0']], 'fraction');
    expect(r.eigenResult!.radicalExpressions).toEqual(['2 + √10', '0', '2 - √10']);
    const all = [...r.eigenResult!.radicalExpressions!, ...r.eigenResult!.eigenvectorRadicals!.flat(), ...r.steps.map((s) => s.title + s.description)];
    expect(all.some((x) => /\d\.\d/.test(String(x)))).toBe(false);
  });

  it('2x2 köklü özdeğer: doğrulama adımı ondalık göstermez', () => {
    const r = go('eigen', [['1', '1'], ['1', '2']], 'fraction');
    expect(r.steps.some((s) => /\d\.\d/.test(s.description))).toBe(false);
  });

  it('rasyonel girişli işlemler kesir olarak görünür', () => {
    const r = go('inverse', [['1/3', '2/7'], ['3/5', '4']], 'fraction');
    const txt = r.matrixResult!.flat().map((v) => formatNumber(v, 'fraction'));
    expect(txt.every((x) => !/\d\.\d/.test(x))).toBe(true);
  });
});
