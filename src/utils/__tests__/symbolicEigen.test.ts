import { runOperation } from '../runOperation';
import { parseFractionalInput } from '../numberFormat';
import { parseSymbolicInput, symToNumber } from '../symbolic';

const go = (A: string[][], lang: 'tr' | 'en' = 'tr', withSym = true) => {
  const M = A.map((r) => r.map((t) => parseFractionalInput(t)));
  return runOperation('eigen', M, M, 0, 2, [], 'gauss', lang, 'fraction', withSym ? { A } : undefined);
};
const isSymbolic = (r: ReturnType<typeof go>) => r.eigenResult?.radicalExpressions?.every((x) => typeof x === 'string') === true;
const num = (A: string[][]) => A.map((r) => r.map((t) => symToNumber(parseSymbolicInput(t)!)));

/** A·v = λ·v (karmaşık sayılarla sayısal doğrulama) ve Vieta: Σλ = iz, Πλ = det. */
function expectValidEigen(A: string[][]) {
  const r = go(A);
  expect(r.success).toBe(true);
  const n = A.length;
  const M = num(A);
  const e = r.eigenResult!;
  const lam = e.eigenvalues.map((re, k) => ({ re, im: e.eigenvaluesIm?.[k] ?? 0 }));
  const vec = e.eigenvectors.map((v, k) => v.map((re, i) => ({ re, im: e.eigenvectorsIm?.[k]?.[i] ?? 0 })));
  const cmul = (a: { re: number; im: number }, b: { re: number; im: number }) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
  for (let k = 0; k < n; k++) {
    const v = vec[k];
    const scale = Math.max(...v.map((z) => Math.hypot(z.re, z.im)));
    expect(scale).toBeGreaterThan(1e-12);
    for (let i = 0; i < n; i++) {
      let re = 0, im = 0;
      for (let j = 0; j < n; j++) { re += M[i][j] * v[j].re; im += M[i][j] * v[j].im; }
      const lv = cmul(lam[k], v[i]);
      expect(Math.hypot(re - lv.re, im - lv.im)).toBeLessThan(1e-8 * (1 + Math.hypot(lam[k].re, lam[k].im)) * (1 + scale));
    }
  }
  let trace = 0;
  for (let i = 0; i < n; i++) trace += M[i][i];
  const sumRe = lam.reduce((sum, z) => sum + z.re, 0);
  const sumIm = lam.reduce((sum, z) => sum + z.im, 0);
  expect(sumRe).toBeCloseTo(trace, 7);
  expect(sumIm).toBeCloseTo(0, 7);
  const det =
    n === 2
      ? M[0][0] * M[1][1] - M[0][1] * M[1][0]
      : M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const prod = lam.reduce((p, z) => cmul(p, z), { re: 1, im: 0 });
  expect(prod.re).toBeCloseTo(det, 5);
  expect(prod.im).toBeCloseTo(0, 5);
  return r;
}

describe('3x3 özdeğer: tekrarlı özdeğer (madde 3)', () => {
  test('üçgen + tekrarlı özdeğer, özuzay 1 boyutlu ⇒ köşegenleştirilemez notu', () => {
    const r = go([['√2', '1', '0'], ['0', '√2', '0'], ['0', '0', '5']]);
    expect(isSymbolic(r)).toBe(true);
    expect(r.eigenResult!.radicalExpressions).toEqual(['√2', '√2', '5']);
    expect(r.eigenResult!.eigenvectorRadicals).toEqual([['1', '0', '0'], ['1', '0', '0'], ['0', '0', '1']]);
    const last = r.steps[r.steps.length - 1].description;
    expect(last).toContain('köşegenleştirilemez');
  });

  test('köşegen matris, tekrarlı özdeğer ⇒ özuzay 2 boyutlu', () => {
    const r = go([['√2', '0', '0'], ['0', '√2', '0'], ['0', '0', '5']]);
    expect(r.eigenResult!.eigenvectorRadicals).toEqual([['1', '0', '0'], ['0', '1', '0'], ['0', '0', '1']]);
    expect(r.steps[r.steps.length - 1].description).toContain('2 boyutlu');
  });

  test('üçgen, tekrarlı, özuzay 2 boyutlu (A − λI rank 1)', () => {
    // λ = π iki kez; A − πI = [[0,0,1],[0,0,0],[0,0,0]... ] ⇒ özuzay {x₃=0} 2 boyutlu
    const r = expectValidEigen([['pi', '0', '0'], ['0', 'pi', '0'], ['0', '0', '2']]);
    expect(r.eigenResult!.radicalExpressions).toEqual(['π', 'π', '2']);
  });

  test('İngilizce not metni', () => {
    const r = go([['√2', '1', '0'], ['0', '√2', '0'], ['0', '0', '5']], 'en');
    expect(r.steps[r.steps.length - 1].description).toContain('not diagonalizable');
  });
});

describe('3x3 özdeğer: genel (üçgen olmayan) matris, kesin kök arama (madde 1)', () => {
  test('ayrık blok, kök köşegende: λ = 3, 3, 0', () => {
    const r = expectValidEigen([['1', '√2', '0'], ['√2', '2', '0'], ['0', '0', '3']]);
    expect(isSymbolic(r)).toBe(true);
    expect(r.eigenResult!.radicalExpressions).toEqual(['3', '3', '0']);
    expect(r.eigenResult!.eigenvectorRadicals).toEqual([['1', '√2', '0'], ['0', '0', '1'], ['√2', '-1', '0']]);
  });

  test('sayısal köklerden tanınan rasyonel kök (köşegende değil)', () => {
    // p(λ) = (λ−1)(λ−5)(λ−1)  (blok [[2,√3],[√3,4]] ⊕ [1])
    const r = expectValidEigen([['2', '√3', '0'], ['√3', '4', '0'], ['0', '0', '1']]);
    expect(r.eigenResult!.radicalExpressions).toEqual(['5', '1', '1']);
  });

  test('kök bir kuadratikten geliyor: 3 ± √5 ve 3', () => {
    const r = expectValidEigen([['2', '√2', '0'], ['√2', '3', '√2'], ['0', '√2', '4']]);
    expect(isSymbolic(r)).toBe(true);
    expect(r.eigenResult!.radicalExpressions).toEqual(['3 + √5', '3', '3 - √5']);
  });

  test('π içeren ayrık blok: λ = π, 3, 0', () => {
    const r = expectValidEigen([['pi', '0', '0'], ['0', '1', '√2'], ['0', '√2', '2']]);
    expect(r.eigenResult!.radicalExpressions).toEqual(['π', '3', '0']);
    // çok terimli ortak çarpan (π−3) vektörlere bulaşmaz
    expect(r.eigenResult!.eigenvectorRadicals).toEqual([['1', '0', '0'], ['0', '1', '√2'], ['0', '√2', '-1']]);
  });

  test('rank 1: (A − λI) tek bağımsız satır ⇒ 2 boyutlu özuzay, birim/düzlem tabanı', () => {
    const r = expectValidEigen([['√2', '√2', '√2'], ['√2', '√2', '√2'], ['√2', '√2', '√2']]);
    expect(r.eigenResult!.radicalExpressions).toEqual(['3√2', '0', '0']);
    expect(r.eigenResult!.eigenvectorRadicals).toEqual([['1', '1', '1'], ['1', '-1', '0'], ['1', '0', '-1']]);
  });

  test('indirgenemez kübik (π/√ girişli): ondalık YOK, "k. kök" kesin gösterimi', () => {
    const r = go([['√2', '1', '0'], ['1', 'pi', '1'], ['0', '1', '√3']]);
    expect(r.success).toBe(true);
    expect(r.eigenResult!.eigenvalues.every((v) => Number.isFinite(v))).toBe(true);
    const labels = r.eigenResult!.radicalExpressions as string[];
    expect(labels.every((x) => x.includes('denkleminin') && !/\d\.\d/.test(x))).toBe(true);
  });

  test('rasyonel 3x3 girişte GERÇEL özdeğerlerde davranış değişmez (ondalık motor)', () => {
    const r = go([['2', '1', '0'], ['1', '2', '0'], ['0', '0', '3']]);
    expect(r.success).toBe(true);
    expect(r.eigenResult!.radicalExpressions?.every((x) => x === null)).toBe(true);
  });
});

describe('3x3: π ile kök karışık (eski "π−√2 paydası" sınırı artık aşılıyor)', () => {
  test('üçgen, π ve √ karışık: özvektörler bölmesiz, TAM sembolik', () => {
    const A = [['pi', '1', '2'], ['0', '√2', '3'], ['0', '0', '5']];
    const r = expectValidEigen(A);
    expect(isSymbolic(r)).toBe(true);
    expect(r.eigenResult!.radicalExpressions).toEqual(['π', '√2', '5']);
    expect(r.eigenResult!.eigenvectorRadicals![1]).toEqual(['1', '√2 - π', '0']);
  });
});

describe('3x3 sembolik özdeğer: rastgele tutarlılık', () => {
  test('sembolik dönen her sonuç A·v = λ·v ve Vieta ile doğrulanır', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const pool = ['0', '0', '1', '2', '-1', '3', '√2', '√3', '2√2', '-√2', 'pi', '1/2', '√2/2'];
    const pick = () => pool[Math.floor(rnd() * pool.length)];
    let symbolic = 0;
    for (let t = 0; t < 200; t++) {
      // yapılı matrisler: üçgen, ayrık blok, simetrik
      const kind = t % 3;
      const a = Array.from({ length: 3 }, () => Array.from({ length: 3 }, pick));
      let A = a;
      if (kind === 0) A = a.map((row, i) => row.map((v, j) => (j < i ? '0' : v)));
      if (kind === 1) A = a.map((row, i) => row.map((v, j) => (i === 2 || j === 2 ? (i === j ? v : '0') : v)));
      if (kind === 2) A = a.map((row, i) => row.map((v, j) => (j < i ? a[j][i] : v)));
      const r = go(A);
      expect(typeof r.success).toBe('boolean');
      if (!r.success || !isSymbolic(r)) continue;
      symbolic++;
      expectValidEigen(A);
    }
    expect(symbolic).toBeGreaterThan(25); // gerçekten sembolik yol çalışıyor
  });

  test('en kötü durum (çok asal + π) makul sürede biter', () => {
    const t0 = Date.now();
    go([['√2', '√3', '√5'], ['√3', 'pi', '√7'], ['√5', '√7', '√11']]);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

describe('karmaşık özdeğerler (madde 7)', () => {
  test('2x2 rasyonel: dönme matrisi ±i, tam gösterim', () => {
    const r = expectValidEigen([['0', '-1'], ['1', '0']]);
    expect(r.eigenResult!.radicalExpressions).toEqual(['i', '-i']);
    expect(r.eigenResult!.eigenvectorRadicals).toEqual([['i', '1'], ['-i', '1']]);
    expect(r.eigenResult!.eigenvaluesIm).toEqual([1, -1]);
  });

  test('2x2 rasyonel, karmaşık: 2 ± 2i', () => {
    const r = expectValidEigen([['1', '-5'], ['1', '3']]);
    expect(r.eigenResult!.radicalExpressions).toEqual(['2 + 2i', '2 - 2i']);
  });

  test('2x2 köklü: 1 ± i√2 (i, √ ve π\'den ÖNCE yazılır)', () => {
    const r = expectValidEigen([['1', '-√2'], ['√2', '1']]);
    expect(r.eigenResult!.radicalExpressions).toEqual(['1 + i√2', '1 - i√2']);
  });

  test('2x2: gerçel özdeğerlerde eigenvaluesIm HİÇ eklenmez (mevcut biçim korunur)', () => {
    const r = go([['pi', '1'], ['0', '√2']]);
    expect(r.eigenResult!.eigenvaluesIm).toBeUndefined();
  });

  test('3x3 rasyonel: dönme ⊕ [2] (eskiden "desteklenmiyor" hatasıydı)', () => {
    const r = expectValidEigen([['0', '-1', '0'], ['1', '0', '0'], ['0', '0', '2']]);
    expect(r.eigenResult!.radicalExpressions).toEqual(['2', 'i', '-i']);
    expect(r.eigenResult!.eigenvectorRadicals).toEqual([['0', '0', '1'], ['i', '1', '0'], ['-i', '1', '0']]);
  });

  test('3x3 köklü, genel: bir gerçel kök + karmaşık çift', () => {
    const r = expectValidEigen([['0', '-1', '√2'], ['1', '0', '0'], ['0', '0', '3']]);
    expect(r.eigenResult!.radicalExpressions).toEqual(['3', 'i', '-i']);
  });

  test('3x3: karmaşık çift bir ikinci derece denklemden (1 ± i)', () => {
    const r = expectValidEigen([['1', '-1', '0'], ['1', '1', '1'], ['0', '0', '√2']]);
    expect(r.eigenResult!.radicalExpressions).toEqual(['√2', '1 + i', '1 - i']);
  });

  test('3x3 indirgenemez kübik (λ³ = 2): KESİN Cardano gösterimi (ondalık yok)', () => {
    const r = expectValidEigen([['0', '0', '2'], ['1', '0', '0'], ['0', '1', '0']]);
    expect(r.eigenResult!.eigenvaluesIm![1]).toBeCloseTo(1.0911236, 6);
    expect(r.eigenResult!.radicalExpressions![1]).toBe('-∛(2)/2 + √3/2·i·∛(2)');
  });

  test('sembolik giriş YOKKEN (yalnızca sayısal motor) de karmaşık özdeğer çalışır', () => {
    const r2 = go([['0', '-1'], ['1', '0']], 'tr', false);
    expect(r2.success).toBe(true);
    expect(r2.eigenResult!.eigenvaluesIm).toEqual([1, -1]);
    const r3 = go([['0', '-1', '0'], ['1', '0', '0'], ['0', '0', '2']], 'tr', false);
    expect(r3.success).toBe(true);
    expect(r3.eigenResult!.radicalExpressions).toEqual(['2', 'i', '-i']);
  });

  test('gerçel özdeğerli rasyonel matriste sayısal fallback KARMAŞIK dönmez', () => {
    const r = go([['2', '1'], ['1', '2']], 'tr', false);
    expect(r.eigenResult!.eigenvaluesIm).toBeUndefined();
  });
});

describe('karekökü sadeleşmeyen ("opak") özdeğerler (madde 6)', () => {
  test('2x2 gerçel: Δ = 4 + 4√2 − 4π + π² (3+ terim) √Δ olarak bırakılır', () => {
    const r = expectValidEigen([['pi', '√2'], ['1', '2']]);
    const lam = r.eigenResult!.radicalExpressions!;
    expect(lam[0]).toBe('1 + π/2 + √(4 + 4√2 - 4π + π²)/2');
    expect(lam[1]).toBe('1 + π/2 - √(4 + 4√2 - 4π + π²)/2');
    expect(r.eigenResult!.eigenvaluesIm).toBeUndefined();
    expect(r.steps.some((s) => s.description.includes('daha sade bir biçime indirgenemediği'))).toBe(true);
  });

  test('2x2 karmaşık + opak: i√(−Δ)', () => {
    const r = expectValidEigen([['pi', '-√2'], ['1', '2']]);
    expect(r.eigenResult!.radicalExpressions![0]).toBe('1 + π/2 + i√(-4 + 4√2 + 4π - π²)/2');
  });

  test('3x3: gerçel kök + opak çift (blok ⊕ [5])', () => {
    const r = expectValidEigen([['pi', '√2', '0'], ['1', '2', '0'], ['0', '0', '5']]);
    expect(r.eigenResult!.radicalExpressions![0]).toBe('5');
    expect(r.eigenResult!.eigenvectorRadicals![1]).toEqual(['-√2', '-1 + π/2 - √(4 + 4√2 - 4π + π²)/2', '0']);
  });

  test('3x3: karmaşık + opak çift', () => {
    const r = expectValidEigen([['pi', '-√2', '0'], ['1', '2', '0'], ['0', '0', '5']]);
    expect(r.eigenResult!.eigenvaluesIm).toBeDefined();
  });

  test('perfect-square Δ hâlâ opak DEĞİL, sadeleşir (√(5−2√6) = √3−√2)', () => {
    // A = [[3, 1],[..]] : Δ = 5 − 2√6 olacak şekilde: tr = 0 için det = −(5−2√6)/4
    const r = go([['0', '1'], ['(2√6-5)/4', '0']]);
    expect(r.eigenResult!.radicalExpressions![0]).not.toContain('√(');
  });
});
