import {
  parseSymbolicInput,
  symAdd,
  symSub,
  symMul,
  symDiv,
  symSqrt,
  symIsZero,
  symToString,
  symToNumber,
  symToLatex,
  symFromRational,
  latexifyLabel,
  parseComplexInput,
  parseComplexNumber,
  hasImaginaryUnit,
  parseExpressionNumber,
} from '../symbolic';
import { runOperation } from '../runOperation';
import { trySymbolicOperation } from '../symbolicOps';
import { determinantValue, inverse, rank, solveLinearSystem } from '../matrixUtils';
import { parseFractionalInput, parseComplexRealPart, sanitizeFractionalInputText } from '../numberFormat';

const P = (t: string) => parseSymbolicInput(t)!;
const S = (t: string) => symToString(P(t));

describe('SymNum çekirdeği', () => {
  test('ayrıştırma ve gösterim', () => {
    expect(S('3pi/4')).toBe('3π/4');
    expect(S('-2√3')).toBe('-2√3');
    expect(S('√8')).toBe('2√2');
    expect(S('1/√2')).toBe('√2/2');
    expect(S('π√2')).toBe('π√2');
    expect(S('0.37')).toBe('37/100');
    expect(S('√2√6')).toBe('2√3');
  });

  test('toplama terimleri birleştirmez: √2 + √3', () => {
    const sum = symAdd(P('√2'), P('√3'));
    expect(symToString(sum)).toBe('√2 + √3');
    expect(symToNumber(sum)).toBeCloseTo(3.1462643699, 8);
  });

  test('çarpma sadeleşir ve sıfır KESİN tanınır', () => {
    expect(symToString(symMul(symAdd(P('√2'), P('√3')), symSub(P('√2'), P('√3'))))).toBe('-1');
    expect(symToString(symMul(P('π'), P('√2')))).toBe('π√2');
    expect(symIsZero(symSub(symMul(P('√2'), P('√2')), P('2')))).toBe(true);
  });

  test('çok terimli π\'siz payda: eşlenikle rasyonelleştirme', () => {
    const d = (a: string, b: string) => symDiv(P(a), P(b))!;
    expect(symToString(d('1', '1') )).toBe('1');
    expect(symToString(symDiv(P('1'), symAdd(P('√2'), P('√3')))!)).toBe('-√2 + √3');
    expect(symToString(symDiv(P('1'), symAdd(P('1'), P('√2')))!)).toBe('-1 + √2');
    expect(symToString(symDiv(P('√2'), symSub(P('1'), P('√2')))!)).toBe('-2 - √2');
    // üç farklı kök: 1/(√2+√3+√5), sayısal doğrulama
    const den = symAdd(symAdd(P('√2'), P('√3')), P('√5'));
    const q = symDiv(P('1'), den)!;
    expect(symToNumber(q)).toBeCloseTo(1 / (Math.SQRT2 + Math.sqrt(3) + Math.sqrt(5)), 12);
    // payda gerçekten rasyonel: q * den = 1
    expect(symToString(symMul(q, den))).toBe('1');
    // ortak π kuvveti dışarı çekilir: 1/(π√2 + π√3) = (√3 - √2)/π
    const pd = symAdd(P('π√2'), P('π√3'));
    const pq = symDiv(P('1'), pd)!;
    expect(symToNumber(pq)).toBeCloseTo(1 / (Math.PI * (Math.SQRT2 + Math.sqrt(3))), 12);
    expect(symToString(symMul(pq, pd))).toBe('1');
  });

  test('bölme: temsil edilemeyenler null', () => {
    expect(symToString(symDiv(P('1'), P('π'))!)).toBe('1/π');
    // π + √2: π ile kök karışık → temsil edilemez
    expect(symDiv(P('1'), symAdd(P('π'), P('√2')))).toBeNull();
    expect(symDiv(P('1'), P('0'))).toBeNull();
  });

  test('geçersiz / üslü giriş null', () => {
    expect(parseSymbolicInput('√')).toBeNull();
    expect(parseSymbolicInput('1/')).toBeNull();
    expect(symToString(parseSymbolicInput('2^0.5')!, 'fraction')).toBe('√2');
  });

  test('LaTeX', () => {
    expect(symToLatex(P('3pi/4'))).toBe('\\frac{3\\pi}{4}');
    expect(latexifyLabel('√2/2')).toBe('\\frac{\\sqrt{2}}{2}');
    expect(latexifyLabel('3/4')).toBe('\\frac{3}{4}');
  });
});

describe('Girdi: √ desteği (sayısal ayrıştırma korunur)', () => {
  test('sanitize + parseFractionalInput', () => {
    expect(parseFractionalInput(sanitizeFractionalInputText('2√3'))).toBeCloseTo(2 * Math.sqrt(3), 12);
    expect(parseFractionalInput(sanitizeFractionalInputText('sqrt2'))).toBeCloseTo(Math.SQRT2, 12);
    expect(parseFractionalInput('√2/2')).toBeCloseTo(Math.SQRT2 / 2, 12);
    expect(parseFractionalInput('3pi/4')).toBe((3 * Math.PI) / 4);
    expect(parseFractionalInput('1/3')).toBe(1 / 3);
  });
});

const num = (t: string[][]) => t.map((r) => r.map(parseFractionalInput));
const run = (type: any, A: string[][], B: string[][] = [['0']], scalar = '1', mode: 'decimal' | 'fraction' = 'fraction') =>
  trySymbolicOperation(type, num(A), num(B), { A, B, scalar }, 'tr', mode);

describe('Sembolik matris işlemleri (v1)', () => {
  test('A + B: √2 + √3 ondalığa çevrilmez', () => {
    const r = run('add', [['√2', '1'], ['0', 'pi']], [['√3', '2'], ['1', '√2']])!;
    expect(r.success).toBe(true);
    expect(r.matrixResultLabels).toEqual([['√2 + √3', '3'], ['1', '√2 + π']]);
    expect(r.matrixResult![0][0]).toBeCloseTo(Math.SQRT2 + Math.sqrt(3), 12);
    // adım açıklamaları da sembolik
    expect(r.steps.some((s) => s.description.includes('√2 + √3'))).toBe(true);
    expect(r.steps.some((s) => /\d\.\d{4}/.test(s.description))).toBe(false);
  });

  test('A × B: π·√2 = π√2', () => {
    const r = run('multiply', [['pi', '0'], ['0', '1']], [['√2', '0'], ['0', '1']])!;
    expect(r.matrixResultLabels![0][0]).toBe('π√2');
    expect(r.matrixResultLabels![1][1]).toBe('1');
  });

  test('çarpma: tam hesap (√2+1)(√2-1) yapısı', () => {
    // [1 √2]·[√2; -1... ] -> √2 - √2 = 0 ve karşıt terimler sadeleşir
    const r = run('multiply', [['1', '√2']], [['√2'], ['-1']])!;
    expect(r.matrixResultLabels).toEqual([['0']]);
  });

  test('çıkarma, skaler çarpma, transpoz, iz', () => {
    expect(run('subtract', [['√2']], [['√3']])!.matrixResultLabels).toEqual([['√2 - √3']]);
    expect(run('scalarMultiply', [['√2', '1']], [['0']], '√2')!.matrixResultLabels).toEqual([['2', '√2']]);
    expect(run('transpose', [['√2', 'pi', '1']])!.matrixResultLabels).toEqual([['√2'], ['π'], ['1']]);
    const tr = run('trace', [['√2', '0'], ['0', '√3']])!;
    expect(tr.scalarResultLabel).toBe('√2 + √3');
  });

  test('determinant 2x2 ve 3x3 (kofaktör, bölmesiz) sayısal motorla tutarlı', () => {
    const d2 = run('determinant', [['√2', 'pi'], ['1', '√3']])!;
    expect(d2.scalarResultLabel).toBe('√6 - π');
    const A = [['√2', '1', 'pi'], ['0', '√3', '2'], ['1', '1', '√2']];
    const d3 = run('determinant', A)!;
    expect(d3.scalarResult).toBeCloseTo(determinantValue(num(A)), 10);
    expect(d3.steps.length).toBeGreaterThan(4);
    const dz = run('determinant', [['√2', '0', '0'], ['0', '√3', '0'], ['0', '0', '√6']])!;
    expect(dz.scalarResultLabel).toBe('6');
  });

  test('rastgele tutarlılık: sembolik ≈ ondalık (toplama/çarpma/determinant)', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const pool = ['1', '2', '-3', '√2', '√3', '2√5', 'pi', '-pi', 'pi√2', '1/2', '√2/3'];
    const cell = () => pool[Math.floor(rnd() * pool.length)];
    for (let t = 0; t < 200; t++) {
      const n = 2 + Math.floor(rnd() * 2);
      const A = Array.from({ length: n }, () => Array.from({ length: n }, cell));
      const B = Array.from({ length: n }, () => Array.from({ length: n }, cell));
      const mul = run('multiply', A, B);
      if (mul) {
        const want = num(A).map((row, i) => row.map((_, j) => row.reduce((s, _v, k) => s + num(A)[i][k] * num(B)[k][j], 0)));
        mul.matrixResult!.forEach((row, i) => row.forEach((v, j) => expect(Math.abs(v - want[i][j]) < 1e-9 * Math.max(1, Math.abs(want[i][j]))).toBe(true)));
      }
      const det = run('determinant', A);
      if (det) expect(Math.abs(det.scalarResult! - determinantValue(num(A))) < 1e-8 * Math.max(1, Math.abs(det.scalarResult!))).toBe(true);
    }
  });

  test('geri dönüş kuralları: yalnızca rasyonel / ayrıştırılamayan / kapsam dışı → null', () => {
    expect(run('add', [['1', '2']], [['3', '4']])).toBeNull(); // yalnızca rasyonel
    expect(run('add', [['√']], [['1']])).toBeNull(); // yazılmakta olan giriş
    expect(run('add', [['2^0.5']], [['1']])!.matrixResultLabels).toEqual([['1 + √2']]);
    expect(run('add', [['2^0.3']], [['1']])).toBeNull(); // kesirli üs (√ dışı) hâlâ ondalık
    expect(trySymbolicOperation('eigen', [[1]], [[1]], { A: [['√2']] }, 'tr', 'fraction')).toBeNull();
    expect(trySymbolicOperation('add', [[1]], [[1]], undefined, 'tr', 'fraction')).toBeNull();
  });

  test('boyut hatası ve taşma güvenli', () => {
    const e = run('add', [['√2']], [['1', '2']]);
    expect(e && e.success).toBe(false);
    // Exact via bigint even though the intermediate value exceeds 2⁵³: (10¹²−1)²·π
    const big = run('multiply', [['999999999999']], [['999999999999pi']])!;
    expect(big.matrixResultLabels).toEqual([['999999999998000000000001π']]);
  });
});

// ------------------------------------------------------------
// AŞAMA 4: bölme gerektiren işlemler
// ------------------------------------------------------------

const runX = (type: any, A: string[][], extra: Record<string, any> = {}, mode: 'decimal' | 'fraction' = 'fraction') =>
  trySymbolicOperation(type, num(A), [[0]], { A, ...extra }, 'tr', mode);

describe('Sembolik: ters, RREF, rank, LU, Gauss, denklem çözme, üs', () => {
  test('ters: tek terimli pivotlarla tam sembolik', () => {
    const r = runX('inverse', [['√2', '0'], ['0', '√2']])!;
    expect(r.matrixResultLabels).toEqual([['√2/2', '0'], ['0', '√2/2']]);
    const r2 = runX('inverse', [['pi', '1'], ['0', '2']])!;
    expect(r2.matrixResultLabels).toEqual([['1/π', '-1/(2π)'], ['0', '1/2']]);
    expect(r2.steps.some((st) => /\d\.\d{4}/.test(st.description))).toBe(false);
  });

  test('ters: A·A⁻¹ = I (sayısal doğrulama) ve tekil matris hatası', () => {
    const A = [['√2', '1', '0'], ['0', 'pi', '1'], ['0', '0', '√3']];
    const r = runX('inverse', A)!;
    const a = num(A);
    const inv = r.matrixResult!;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const v = a[i].reduce((sum, _x, k) => sum + a[i][k] * inv[k][j], 0);
      expect(Math.abs(v - (i === j ? 1 : 0)) < 1e-9).toBe(true);
    }
    const sing = runX('inverse', [['√2', '2'], ['1', '√2']])!; // det = 2 - 2 = 0 KESİN
    expect(sing.success).toBe(false);
  });

  test('rank/RREF: √2·√2 = 2 olduğundan rank KESİN 1', () => {
    const r = runX('rank', [['√2', '2'], ['1', '√2']])!;
    expect(r.scalarResult).toBe(1);
    const rr = runX('rref', [['√2', '2'], ['1', '√2']])!;
    expect(rr.matrixResultLabels).toEqual([['1', '√2'], ['0', '0']]);
  });

  test('Gauss eliminasyonu ve LU (P·A = L·U)', () => {
    const g = runX('gaussElimination', [['√2', '1'], ['1', 'pi']])!;
    expect(g.matrixResultLabels![1][0]).toBe('0');
    const A = [['√2', '1', '0'], ['1', 'pi', '2'], ['0', '1', '√3']];
    const lu = runX('lu', A)!;
    const { L, U, P } = lu.luResult!;
    const a = num(A);
    const mm = (X: number[][], Y: number[][]) => X.map((row, i) => Y[0].map((_, j) => row.reduce((s2, _x, k) => s2 + X[i][k] * Y[k][j], 0)));
    const PA = mm(P!, a);
    const LU = mm(L, U);
    PA.forEach((row, i) => row.forEach((v, j) => expect(Math.abs(v - LU[i][j]) < 1e-9).toBe(true)));
    expect(lu.luResultLabels!.L[0][0]).toBe('1');
  });

  test('denklem çözme: Gauss ve Cramer tam sembolik', () => {
    const A = [['√2', '0'], ['0', 'pi']];
    const gauss = runX('solveLinearSystem', A, { b: ['2', 'pi'], method: 'gauss' })!;
    expect(gauss.vectorResultLabels).toEqual(['√2', '1']);
    const cramer = runX('solveLinearSystem', A, { b: ['2', 'pi'], method: 'cramer' })!;
    expect(cramer.vectorResultLabels).toEqual(['√2', '1']);
    // b'de π/√ olup A rasyonelse de sembolik
    const onlyB = runX('solveLinearSystem', [['2', '0'], ['0', '4']], { b: ['√2', 'pi'] })!;
    expect(onlyB.vectorResultLabels).toEqual(['√2/2', 'π/4']);
    // çelişkili ve sonsuz çözüm mesajları
    expect(runX('solveLinearSystem', [['√2', '2'], ['1', '√2']], { b: ['1', '2'] })!.success).toBe(false);
  });

  test('üs: pozitif, sıfır ve negatif', () => {
    const A = [['√2', '1'], ['0', '√2']];
    expect(runX('power', A, { exponent: 2 })!.matrixResultLabels).toEqual([['2', '2√2'], ['0', '2']]);
    expect(runX('power', A, { exponent: 0 })!.matrixResultLabels).toEqual([['1', '0'], ['0', '1']]);
    const neg = runX('power', A, { exponent: -1 })!;
    expect(neg.matrixResultLabels![0][0]).toBe('√2/2');
  });

  test('döndürme matrisleri (√ içeren, det = 1): ters = transpoz, tam sembolik', () => {
    const R45 = [['√2/2', '-√2/2'], ['√2/2', '√2/2']];
    expect(runX('inverse', R45)!.matrixResultLabels).toEqual([['√2/2', '√2/2'], ['-√2/2', '√2/2']]);
    const R30 = [['√3/2', '-1/2'], ['1/2', '√3/2']];
    expect(runX('inverse', R30)!.matrixResultLabels).toEqual([['√3/2', '1/2'], ['-1/2', '√3/2']]);
    expect(runX('determinant', R30)!.scalarResultLabel).toBe('1');
    // R·Rᵀ = I  (çarpma sembolik olarak tam 1 ve 0 verir)
    const RT = R30[0].map((_, j) => R30.map((row) => row[j]));
    expect(run('multiply', R30, RT)!.matrixResultLabels).toEqual([['1', '0'], ['0', '1']]);
    expect(runX('power', R45, { exponent: 8 })!.matrixResultLabels).toEqual([['1', '0'], ['0', '1']]);
  });

  test('π\'siz çok terimli pivotlar artık eşlenikle sembolik kalır (eskiden ondalığa düşüyordu)', () => {
    const A = [['1', '√2', '0'], ['1', '1', '1'], ['1', '1', '√3']];
    const r = runX('inverse', A)!;
    expect(r).not.toBeNull();
    expect(r.success).toBe(true);
    // Hiçbir etiket ondalık içermez
    const flat = r.matrixResultLabels!.flat().concat(r.steps.map((st) => st.description));
    expect(flat.some((t) => /\d\.\d{3}/.test(t))).toBe(false);
    // A · A⁻¹ = I
    const a = num(A);
    const inv = r.matrixResult!;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const v = a[i].reduce((sum, _x, k) => sum + a[i][k] * inv[k][j], 0);
      expect(Math.abs(v - (i === j ? 1 : 0)) < 1e-9).toBe(true);
    }
  });

  test('π+kök KARIŞIK pivot: adjugate yedeği (det bölünebilirse)', () => {
    const A = [['pi√2', '1', '2'], ['1/2', '1', '1/2'], ['-1', '1', '1/2']];
    const r = runX('inverse', A)!;
    expect(r.steps.some((st) => st.title.includes('Adjugate'))).toBe(true);
    const a = num(A);
    const inv = r.matrixResult!;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const v = a[i].reduce((sum, _x, k) => sum + a[i][k] * inv[k][j], 0);
      expect(Math.abs(v - (i === j ? 1 : 0)) < 1e-9).toBe(true);
    }
  });

  test('π+kök karışık, bölünemeyen pivot/determinant → ondalık motora geri dönüş (null)', () => {
    expect(runX('inverse', [['-1', '√3', 'pi√2'], ['pi√2', '√2', 'pi√2'], ['pi', '√2', '1']])).toBeNull();
    // bölme hiç gerekmiyorsa (son pivot çok terimli) sembolik sürer:
    expect(runX('lu', [['1', '√2'], ['1', '1']])!.luResultLabels!.U[1][1]).toBe('1 - √2');
  });

  test('determinant çok terimli olsa da ters/denklem çözümü sembolik (π\'siz)', () => {
    const A = [['1', '√2'], ['√3', '1']]; // det = 1 - √6
    const inv = runX('inverse', A)!;
    expect(inv.success).toBe(true);
    expect(inv.matrixResultLabels!.flat().some((t) => /\d\.\d{3}/.test(t))).toBe(false);
    const sol = runX('solveLinearSystem', A, { b: ['1', '1'], method: 'cramer' })!;
    expect(sol.success).toBe(true);
    expect(sol.vectorResultLabels!.some((t) => /\d\.\d{3}/.test(t))).toBe(false);
    const ref = solveLinearSystem(num(A), [1, 1], 'gauss', 'tr', 'decimal');
    sol.vectorResult!.forEach((v, i) => expect(Math.abs(v - ref.vectorResult![i]) < 1e-9).toBe(true));
  });

  test('rastgele tutarlılık: sembolik ≈ sayısal (ters, denklem, rank)', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const pool = ['1', '2', '-1', '3', '√2', '√3', '2√2', 'pi', '-pi', 'pi√2', '1/2', '√2/2'];
    const cell = () => pool[Math.floor(rnd() * pool.length)];
    let hit = 0;
    for (let t = 0; t < 300; t++) {
      const n = 2 + Math.floor(rnd() * 2);
      const A = Array.from({ length: n }, () => Array.from({ length: n }, cell));
      const a = num(A);
      const inv = runX('inverse', A);
      if (inv && inv.success) {
        hit++;
        const ref = inverse(a, 'tr', 'decimal');
        if (ref.success) ref.matrixResult!.forEach((row, i) => row.forEach((v, j) => expect(Math.abs(v - inv.matrixResult![i][j]) < 1e-7 * Math.max(1, Math.abs(v))).toBe(true)));
      }
      const b = Array.from({ length: n }, cell);
      const sol = runX('solveLinearSystem', A, { b, method: t % 2 ? 'cramer' : 'gauss' });
      if (sol && sol.success) {
        const ref = solveLinearSystem(a, b.map(parseFractionalInput), 'gauss', 'tr', 'decimal');
        if (ref.success) ref.vectorResult!.forEach((v, i) => expect(Math.abs(v - sol.vectorResult![i]) < 1e-7 * Math.max(1, Math.abs(v))).toBe(true));
      }
      const rk = runX('rank', A);
      if (rk) expect(rk.scalarResult).toBe(rank(a, 'tr', 'decimal').scalarResult);
    }
    expect(hit).toBeGreaterThan(10); // sembolik yol (yapısal olarak mümkün olduğunda) gerçekten devreye giriyor
  });
});

describe('symSqrt (özdeğer desteği için karekök)', () => {
  test('tek terimli rasyonel: tam kare ise sade sonuç', () => {
    expect(symToString(symSqrt(P('4'))!)).toBe('2');
    expect(symToString(symSqrt(P('9/4'))!)).toBe('3/2');
    expect(symToString(symSqrt(P('0'))!)).toBe('0');
  });

  test('tek terimli rasyonel: tam kare olmayanlar kare-çarpansız köke indirgenir', () => {
    expect(symToString(symSqrt(P('8'))!)).toBe('2√2'); // √8 = √(4·2) = 2√2
    expect(symToString(symSqrt(P('2'))!)).toBe('√2');
    expect(symToString(symSqrt(P('3/4'))!)).toBe('√3/2'); // √(3/4) = (1/2)√3
    expect(symToString(symSqrt(P('12'))!)).toBe('2√3');
  });

  test('π kuvveti çift olmalı: √(π²) = π, √π temsil edilemez', () => {
    expect(symToString(symSqrt(symMul(P('pi'), P('pi')))!)).toBe('π');
    expect(symSqrt(P('pi'))).toBeNull();
  });

  test('negatif veya 3+ terimli ifadelerin karekökü temsil edilemez (null)', () => {
    expect(symSqrt(P('-4'))).toBeNull();
    expect(symSqrt(symAdd(symAdd(P('1'), P('√2')), P('√3')))).toBeNull();
  });

  test('kök içeren terimin (r>1) karekökü tek başına asla temsil edilemez (4. dereceden kök gerekir)', () => {
    // 4√3'ün karekökü, kare olmayan kare-çarpansız bir r için hiçbir zaman
    // c'·√r' biçiminde yazılamaz: (c'·√r')² her zaman rasyoneldir, oysa
    // hedefin karesi (4√3)² = 48 rasyonel olsa da BAŞLANGIÇ değeri (4√3)
    // irrasyoneldir - symSqrt burada "hedefin karesi = a" değil "sonucun
    // karesi = a" arıyor, ve r>1 iken bu asla tam sayı/rasyonel bir r' ile
    // kurulamaz.
    expect(symSqrt(P('4√3'))).toBeNull();
    expect(symSqrt(P('9√2'))).toBeNull();
  });

  test('iç içe kök çözme (denest): A0 + b√D biçiminde, AYNI kökten iki terim', () => {
    expect(symToString(symSqrt(symAdd(symFromRational(3), symMul(symFromRational(2), P('√2'))))!)).toBe('1 + √2');
    expect(symToString(symSqrt(symAdd(symFromRational(7), symMul(symFromRational(4), P('√3'))))!)).toBe('2 + √3');
    // Sonuç işareti her zaman gerçek (pozitif) karekökle eşleşmeli.
    const r = symSqrt(symSub(symFromRational(9), symMul(symFromRational(4), P('√2'))))!;
    expect(symIsZero(symSub(symMul(r, r), symSub(symFromRational(9), symMul(symFromRational(4), P('√2')))))).toBe(true);
  });

  test('iç içe kök: FARKLI iki kök üreten durumlar (√x ± √y)', () => {
    const sq = (a: number, k: string, c: number) => symAdd(symFromRational(a), symMul(symFromRational(c), P(k)));
    // √(5 − 2√6) = √3 − √2
    expect(symToString(symSqrt(sq(5, '√6', -2))!)).toBe('-√2 + √3');
    // √(5 + 2√6) = √3 + √2
    expect(symToString(symSqrt(sq(5, '√6', 2))!)).toBe('√2 + √3');
    // √(8 + 2√15) = √5 + √3
    expect(symToString(symSqrt(sq(8, '√15', 2))!)).toBe('√3 + √5');
    // √(6 − 2√5) = √5 − 1   (x=5, y=1)
    expect(symToString(symSqrt(sq(6, '√5', -2))!)).toBe('-1 + √5');
    // S = 61/16 tam kare değil ⇒ denest edilemez
    const a = symAdd(P('9/4'), symMul(P('1/2'), P('√5'))); // x,y = (9/4 ± √(81/16−5/4))/2 → S=61/16, tam kare değil
    expect(symSqrt(a)).toBeNull();
    // Sonuç her zaman ≥ 0 ve karesi girdiye TAM eşit
    for (const [A0, D, b] of [[5, 6, -2], [5, 6, 2], [7, 3, 4], [11, 30, -2], [12, 35, 2], [3, 2, 2], [10, 21, -2], [14, 13, -6]] as const) {
      const v = symAdd(symFromRational(A0), symMul(symFromRational(b), P(`√${D}`)));
      const root = symSqrt(v);
      if (root === null) continue;
      expect(symIsZero(symSub(symMul(root, root), v))).toBe(true);
      expect(symToNumber(root)).toBeGreaterThanOrEqual(0);
    }
  });

  test('denest edilemeyen ikili terimler null döner', () => {
    // A0² − D·b² tam kare değil ⇒ √x ± √y biçimi yok.
    expect(symSqrt(symAdd(symFromRational(2), P('√2')))).toBeNull(); // S = 4−2 = 2
    // Diskriminant negatif (gerçel kök yok).
    expect(symSqrt(symAdd(symFromRational(3), symMul(symFromRational(5), P('√2'))))).toBeNull();
    // Radikand negatif (A0 < 0): karekök gerçel değil.
    expect(symSqrt(symSub(symFromRational(-5), symMul(symFromRational(2), P('√6'))))).toBeNull();
    // İki FARKLI kökün toplamı (rasyonel + tek kök biçiminde değil).
    expect(symSqrt(symAdd(P('√2'), P('√3')))).toBeNull();
  });

  test('sonuç gerçekten karekök: (symSqrt(x))² = x', () => {
    for (const t of ['4', '9/4', '25/16', '100', '8', '12', '2']) {
      const root = symSqrt(P(t));
      expect(root).not.toBeNull();
      expect(symIsZero(symSub(symMul(root!, root!), P(t)))).toBe(true);
    }
  });
});

describe('İfade girişi: toplam/fark, parantez (madde 8)', () => {
  test('sembolik ayrıştırma: toplam, fark, parantez', () => {
    expect(S('1+π')).toBe('1 + π');
    expect(S('π+1')).toBe('1 + π');
    expect(S('2√3-1/2')).toBe('-1/2 + 2√3');
    expect(S('(1+π)/2')).toBe('1/2 + π/2');
    expect(S('-(1+π)')).toBe('-1 - π');
    expect(S('1/2+1/3')).toBe('5/6');
    expect(S('√2√2')).toBe('2');
    expect(S('(√2+1)(√2-1)')).toBe('1'); // bitişik yazım = çarpma, √ farkı kesin sadeleşir
    expect(S('1-π+π')).toBe('1');
    expect(S('1/(√2+√3)')).toBe('-√2 + √3'); // eşlenikle rasyonelleştirilir
    expect(S('2*π')).toBe('2π');
  });

  test('eski tek-terim biçimi AYNEN korunur (1/2π = 1/(2π))', () => {
    expect(S('1/2π')).toBe('1/(2π)');
    expect(S('-1/2π')).toBe('-1/(2π)');
    expect(S('3√2/4')).toBe('3√2/4');
    expect(S('-2pi√3/5')).toBe('-2π√3/5');
  });

  test('geçersiz / yazılmakta olan / temsil edilemeyen ifadeler null', () => {
    for (const t of ['1+', '(1+π', '1+π)', '()', '2 3', '√', '1//2', '1/(π-π)', '++', '1+*2', '2^', '√(', '2^(1/3)']) {
      expect(parseSymbolicInput(t)).toBeNull();
    }
    expect(parseSymbolicInput('1/(π+√2)')).toBeNull(); // π+kök karışık bölen (madde 4)
  });

  test('sanitize: ifade modu "+", "-", parantezi korur; tek-terim davranışı değişmez', () => {
    expect(sanitizeFractionalInputText('1+π')).toBe('1+pi');
    expect(sanitizeFractionalInputText('1-π')).toBe('1-pi');
    expect(sanitizeFractionalInputText('(1+π)/2')).toBe('(1+pi)/2');
    expect(sanitizeFractionalInputText('1+-2')).toBe('1-2');
    expect(sanitizeFractionalInputText('1.2.3+4')).toBe('1.23+4');
    expect(sanitizeFractionalInputText('-3pi/4')).toBe('-3pi/4');
    expect(sanitizeFractionalInputText('2^-0.5')).toBe('2^-0.5');
    expect(sanitizeFractionalInputText('abc')).toBe('');
    // idempotent
    for (const t of ['1+π', '1-π', '(1+π)/2', '--', '-+', '3-', '2*√3+1', '1,5-2,5', '((1']) {
      const once = sanitizeFractionalInputText(t);
      expect(sanitizeFractionalInputText(once)).toBe(once);
    }
  });

  test('parseFractionalInput: ifade değeri (sembolik olmayanlar dahil), yarım giriş 0', () => {
    expect(parseFractionalInput('1+pi')).toBeCloseTo(1 + Math.PI, 12);
    expect(parseFractionalInput('(1+pi)/2')).toBeCloseTo((1 + Math.PI) / 2, 12);
    expect(parseFractionalInput('1/(pi+√2)')).toBeCloseTo(1 / (Math.PI + Math.SQRT2), 12);
    expect(parseFractionalInput('2√3-1/2')).toBeCloseTo(2 * Math.sqrt(3) - 0.5, 12);
    expect(parseFractionalInput('1+')).toBe(0);
    expect(parseFractionalInput('1e-7')).toBe(1e-7); // bilimsel gösterim ifade sayılmaz
    expect(parseFractionalInput('1e+21')).toBe(1e21);
  });

  test('hücrede toplam: sembolik motor uçtan uca', () => {
    const r = trySymbolicOperation('add', [[0]], [[0]], { A: [['1+π']], B: [['1-π']] }, 'tr', 'fraction')!;
    expect(r.matrixResultLabels).toEqual([['2']]); // π'ler KESİN sadeleşir
    const d = trySymbolicOperation('determinant', [[0, 0], [0, 0]], [[0]], { A: [['1+√2', '1'], ['1', '√2-1']] }, 'tr', 'fraction')!;
    expect(d.scalarResultLabel).toBe('0'); // (1+√2)(√2−1) − 1 = 0, KESİN
  });
});

describe('Büyük sayılar (bigint, taşma yok)', () => {
  const dims = (m: string[][]) => m.map((r) => r.map(() => 0));
  const run = (type: any, A: string[][], extra: { B?: string[][]; exponent?: number } = {}) =>
    runOperation(type, dims(A), extra.B ? dims(extra.B) : dims(A), 0, extra.exponent ?? 2, [], 'gauss', 'tr', 'fraction', { A, B: extra.B, exponent: extra.exponent });

  test('A^50, A = [[1,√2],[√2,1]]: Pell benzeri tam sayılar, hiç yuvarlama yok', () => {
    // (1+√2)^n = a + b√2  ⇒  Aⁿ = [[a, b√2],[b√2, a]]
    let a = BigInt(1), b = BigInt(0);
    for (let i = 0; i < 50; i++) [a, b] = [a + BigInt(2) * b, a + b];
    expect(a > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true); // gerçekten bigint bölgesi
    const r = run('power', [['1', '√2'], ['√2', '1']], { exponent: 50 });
    expect(r.success).toBe(true);
    expect(r.matrixResultLabels).toEqual([[`${a}`, `${b}√2`], [`${b}√2`, `${a}`]]);
  });

  test('2⁵³ üstü tam sayılar kesin (double ile yuvarlanırdı)', () => {
    const r = run('multiply', [['9007199254740993', 'pi']], { B: [['3'], ['0']] });
    expect(r.matrixResultLabels).toEqual([['27021597764222979']]);
  });

  test('büyük katsayılı 2x2 ters: A·A⁻¹ = I (sayısal doğrulama)', () => {
    const A = [['123456789012345678', 'pi'], ['1', '987654321098765432']];
    const r = run('inverse', A);
    expect(r.success).toBe(true);
    expect(r.matrixResult![0][0]).toBeCloseTo(1 / 123456789012345678, 30);
  });

  test('ondalık girişte 15 haneden uzun sayı artık taşma sayılmaz', () => {
    const r = run('multiply', [['0.123456789012345678901234567890', 'pi']], { B: [['1'], ['0']] });
    expect(r.matrixResultLabels?.[0][0]).toBe('12345678901234567890123456789/100000000000000000000000000000');
  });

  test('kök işaretinin altında dev sayı ⇒ hâlâ güvenli (ondalık motora düşer, hata yok)', () => {
    const r = run('multiply', [['√999999999999999999']], { B: [['2']] });
    expect(r.success).toBe(true);
  });
});

describe('Karmaşık sayı girişi (a + bi)', () => {
  const C = (t: string) => {
    const z = parseComplexInput(t);
    return z && `${symToString(z.re, 'fraction')} | ${symToString(z.im, 'fraction')}`;
  };
  test('kesin ayrıştırma: gerçel | sanal', () => {
    expect(C('3+2i')).toBe('3 | 2');
    expect(C('i')).toBe('0 | 1');
    expect(C('-i')).toBe('0 | -1');
    expect(C('2-3i')).toBe('2 | -3');
    expect(C('i*i')).toBe('-1 | 0');
    expect(C('(1+i)(1-i)')).toBe('2 | 0');
    expect(C('(1+i)/2')).toBe('1/2 | 1/2');
    expect(C('1/(1+i)')).toBe('1/2 | -1/2'); // karmaşık bölme, eşlenikle
    expect(C('i/i')).toBe('1 | 0');
    expect(C('2πi')).toBe('0 | 2π');
    expect(C('√2i')).toBe('0 | √2');
    expect(C('(√2+i√2)/2')).toBe('√2/2 | √2/2');
    expect(C('')).toBe('0 | 0');
  });
  test('geçersiz / temsil edilemeyen ⇒ null', () => {
    for (const t of ['2+', '(1+i', 'i^(1/3)', '1/(π+√2+i·0)', '1/0', 'i i i +']) expect(parseComplexInput(t)).toBeNull();
  });
  test('gerçel ayrıştırıcı i kabul ETMEZ (mod dışında i anlamsız)', () => {
    expect(parseSymbolicInput('3+2i')).toBeNull();
    expect(parseFractionalInput('3+2i')).toBe(0);
  });
  test('sayısal karmaşık değer ve gerçel kısım', () => {
    expect(parseComplexNumber('3+2i')).toEqual({ re: 3, im: 2 });
    expect(parseComplexNumber('(1+i)/√2')!.im).toBeCloseTo(Math.SQRT1_2, 12);
    expect(parseComplexRealPart('3+2i')).toBe(3);
    expect(parseComplexRealPart('2i')).toBe(0);
  });
  test('hasImaginaryUnit: pi içindeki i sayılmaz', () => {
    expect(hasImaginaryUnit('2pi')).toBe(false);
    expect(hasImaginaryUnit('pi i')).toBe(true);
    expect(hasImaginaryUnit('3+i')).toBe(true);
  });
  test('sanitize (karmaşık mod): i korunur, ifade modu', () => {
    expect(sanitizeFractionalInputText('3+2i', true)).toBe('3+2i');
    expect(sanitizeFractionalInputText('2I', true)).toBe('2i');
    expect(sanitizeFractionalInputText('-i/2', true)).toBe('-i/2');
    expect(sanitizeFractionalInputText('3+2i')).toBe('3+2i'.replace('i', 'i')); // gerçel modda i yine süzülmez ama ayrıştırılamaz
    const once = sanitizeFractionalInputText('(1+i)/2', true);
    expect(sanitizeFractionalInputText(once, true)).toBe(once);
  });
});

describe('Üs (^) ve √(ifade) girişi', () => {
  const S = (t: string) => {
    const v = parseSymbolicInput(t);
    return v && symToString(v, 'fraction');
  };
  test('tamsayı üs, negatif üs, ondalık üs', () => {
    expect(S('2^3')).toBe('8');
    expect(S('2^-3')).toBe('1/8');
    expect(S('π^2')).toBe('π²');
    expect(S('2π^2')).toBe('2π²'); // üs bitişik yazımdan güçlü bağlanır
    expect(S('(1+√2)^2')).toBe('3 + 2√2');
    expect(S('(1+√2)^-1')).toBe('-1 + √2'); // eşlenikle
    expect(S('(-2)^3')).toBe('-8');
    expect(S('0^0')).toBe('1');
    expect(S('√2^4')).toBe('4');
  });
  test('yarım üs = karekök: kesin', () => {
    expect(S('2^0.5')).toBe('√2');
    expect(S('2^(1/2)')).toBe('√2');
    expect(S('2^-0.5')).toBe('√2/2');
    expect(S('4^1.5')).toBe('8');
    expect(S('(5-2√6)^0.5')).toBe('-√2 + √3'); // iç içe kök çözülür
  });
  test('√(ifade)', () => {
    expect(S('√(2)')).toBe('√2');
    expect(S('√(1/4)')).toBe('1/2');
    expect(S('√(5-2√6)')).toBe('-√2 + √3');
    expect(S('√(π^2)')).toBe('π');
    expect(S('2√(3)')).toBe('2√3');
    expect(S('√(-1)')).toBeNull(); // gerçel modda karmaşık
    expect(S('√(π+1)')).toBeNull(); // sadeleşmeyen kök
  });
  test('sayısal değerlendirme (temsil edilemeyenler dahil)', () => {
    expect(parseExpressionNumber('2^(1/3)')).toBeCloseTo(Math.cbrt(2), 12);
    expect(parseExpressionNumber('√(π+1)')).toBeCloseTo(Math.sqrt(Math.PI + 1), 12);
    expect(parseExpressionNumber('2^-2')).toBe(0.25);
    expect(Number.isNaN(parseExpressionNumber('√(-1)'))).toBe(true);
  });
  test('karmaşık: i², √(-1), (1+i)^2, (2i)^0.5, √(-3-4i)', () => {
    const C = (t: string) => {
      const z = parseComplexInput(t);
      return z && `${symToString(z.re, 'fraction')} | ${symToString(z.im, 'fraction')}`;
    };
    expect(C('i^2')).toBe('-1 | 0');
    expect(C('i^3')).toBe('0 | -1');
    expect(C('(1+i)^2')).toBe('0 | 2');
    expect(C('(1+i)^-2')).toBe('0 | -1/2');
    expect(C('√(-1)')).toBe('0 | 1');
    expect(C('√(3+4i)')).toBe('2 | 1');
    expect(C('√(-3-4i)')).toBe('1 | -2');
    expect(C('(2i)^0.5')).toBe('1 | 1');
    expect(C('√(i)')).toBe('√2/2 | √2/2'); // √i = (1+i)/√2, kesin
  });
  test('karmaşık sayısal (kesin olmayanlar): (1+i)^(1/3), √(i)', () => {
    const z = parseComplexNumber('√(i)')!;
    expect(z.re).toBeCloseTo(Math.SQRT1_2, 12);
    expect(z.im).toBeCloseTo(Math.SQRT1_2, 12);
    const w = parseComplexNumber('(1+i)^(1/3)')!;
    const mag = Math.pow(Math.SQRT2, 1 / 3);
    expect(w.re).toBeCloseTo(mag * Math.cos(Math.PI / 12), 12);
    expect(w.im).toBeCloseTo(mag * Math.sin(Math.PI / 12), 12);
  });
  test('sanitize: ifade modunda ^ korunur', () => {
    expect(sanitizeFractionalInputText('2^3+1')).toBe('2^3+1');
    expect(sanitizeFractionalInputText('π^(1/2)-1')).toBe('pi^(1/2)-1');
    expect(sanitizeFractionalInputText('(1+i)^2', true)).toBe('(1+i)^2');
    const once = sanitizeFractionalInputText('2^-1+3');
    expect(sanitizeFractionalInputText(once)).toBe(once);
  });
  test('parseFractionalInput: üslü toplam sayısal', () => {
    expect(parseFractionalInput('2^3+1')).toBe(9);
    expect(parseFractionalInput('2^-2+pi')).toBeCloseTo(0.25 + Math.PI, 12);
  });
});

describe('Ondalık basamak ayarı: sembolik ↔ sayısal TUTARLI (displaySettings.ts)', () => {
  const { setDecimalPlaces, getDecimalPlaces } = require('../displaySettings');
  afterEach(() => setDecimalPlaces(6));

  test('symToString(mode=decimal) yeni basamak sayısını kullanır', () => {
    const v = symAdd(symFromRational(1, 3), P('√2')); // 0.333333... + √2 (irrasyonel, sadeleşmez)
    setDecimalPlaces(2);
    expect(symToString(v, 'decimal')).toBe('1.75'); // 0.3333 + 1.4142 tek ondalık sayı
    setDecimalPlaces(0);
    expect(symToString(v, 'decimal')).toBe('2');
  });

  test('numberFormat.formatNumber ile displaySettings AYNI durumu paylaşır', () => {
    const { formatNumber } = require('../numberFormat');
    setDecimalPlaces(3);
    expect(getDecimalPlaces()).toBe(3);
    expect(formatNumber(1 / 3, 'decimal')).toBe('0.333');
    const v = symAdd(symFromRational(1, 3), P('√2'));
    expect(symToString(v, 'decimal')).toBe('1.748');
  });
});
