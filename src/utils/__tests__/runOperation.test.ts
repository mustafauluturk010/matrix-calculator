import { runOperation } from '../runOperation';
import { parseFractionalInput, sanitizeFractionalInputText } from '../numberFormat';

const num = (t: string[][]) => t.map((r) => r.map(parseFractionalInput));
const go = (op: any, A: string[][], B: string[][] = [['0']], extra: any = {}, mode: 'decimal' | 'fraction' = 'fraction') =>
  runOperation(op, num(A), num(B), parseFractionalInput(extra.scalar ?? '2'), extra.exponent ?? 2, (extra.b ?? []).map(parseFractionalInput), extra.method ?? 'gauss', 'tr', mode, {
    A,
    B,
    scalar: extra.scalar ?? '2',
    b: extra.b,
    exponent: extra.exponent ?? 2,
    method: extra.method ?? 'gauss',
  });

describe('runOperation: sembolik motor + sayısal geri dönüş entegrasyonu', () => {
  test('π/√ içeren giriş sembolik; yalnızca rasyonel giriş eski sayısal motorla', () => {
    const sym = go('add', [['√2', '1']], [['√3', '2']]);
    expect(sym.matrixResultLabels).toEqual([['√2 + √3', '3']]);
    const plain = go('add', [['1', '2']], [['3', '4']]);
    expect(plain.matrixResultLabels).toBeUndefined();
    expect(plain.matrixResult).toEqual([[4, 6]]);
  });

  test('sembolik girdi (sym) verilmezse davranış eskisi gibi', () => {
    const r = runOperation('add', [[Math.SQRT2]], [[1]], 2, 2, [], 'gauss', 'tr', 'fraction');
    expect(r.success).toBe(true);
    expect(r.matrixResultLabels).toBeUndefined();
  });

  test('eigen (2x2, π/√): tam sembolik hesaplanıyor', () => {
    const eig = go('eigen', [['√2', '1'], ['1', '√2']]);
    expect(eig.success).toBe(true);
    expect(eig.matrixResultLabels).toBeUndefined(); // eigenResult farklı bir alan, matrixResultLabels'ı hiç kullanmaz
    expect(eig.eigenResult!.radicalExpressions).toEqual(['1 + √2', '-1 + √2']);
    // π ile kök KARIŞIK çok terimli determinant/pivot: sembolik temsil edilemez → sayısal motor
    const inv = go('inverse', [['-1', '√3', 'pi√2'], ['pi√2', '√2', 'pi√2'], ['pi', '√2', '1']]);
    expect(inv.success).toBe(true);
    expect(inv.matrixResultLabels).toBeUndefined();
    expect(inv.matrixResult![0].every((v) => Number.isFinite(v))).toBe(true);
  });

  test('eigen 2x2: diskriminant iç içe kök çözerek (denest) tam sembolik sonuç verir', () => {
    // tr=4, det=1, Δ=16-4=12=4·3: not a perfect square, but reduces to 2√3, giving λ=2±√3.
    const eig = go('eigen', [['1', '√2'], ['√2', '3']]);
    expect(eig.success).toBe(true);
    expect(eig.eigenResult!.radicalExpressions).toEqual(['2 + √3', '2 - √3']);
  });

  test('eigen 3x3 üçgen (yalnızca √ girişli): köşegen özdeğer + çok-köklü özvektörler tam sembolik', () => {
    const eig = go('eigen', [['√2', '1', '2'], ['0', '√3', '3'], ['0', '0', '5']]);
    expect(eig.success).toBe(true);
    expect(eig.eigenResult!.radicalExpressions).toEqual(['√2', '√3', '5']);
    expect(eig.eigenResult!.eigenvectorRadicals![0]).toEqual(['1', '0', '0']);
  });

  test('eigen 3x3 üçgen (yalnızca π girişli, alt üçgen): tam sembolik, özvektörlerde 1/π gibi terimler oluşabilir', () => {
    const eig = go('eigen', [['pi', '0', '0'], ['1', '2pi', '0'], ['3', '4', '3pi']]);
    expect(eig.success).toBe(true);
    expect(eig.eigenResult!.radicalExpressions).toEqual(['π', '2π', '3π']);
  });

  test('eigen 3x3 üçgen (π VE √ karışık): özvektörler bölmesiz hesaplandığı için artık TAM sembolik', () => {
    // Division-free: eigenvectors come from the cross product of the rows of (A−λI).
    const eig = go('eigen', [['pi', '1', '2'], ['0', '√2', '3'], ['0', '0', '5']]);
    expect(eig.success).toBe(true);
    expect(eig.eigenResult!.radicalExpressions).toEqual(['π', '√2', '5']);
    expect(eig.eigenResult!.eigenvectorRadicals![1]).toEqual(['1', '√2 - π', '0']);
  });

  test('eigen 3x3 genel, indirgenemez kübik (π/√ girişli): tam kök yok ⇒ sayısal motora düşer', () => {
    const eig = go('eigen', [['√2', '1', '0'], ['1', 'pi', '1'], ['0', '1', '√3']]);
    expect(eig.success).toBe(true);
    expect(eig.eigenResult!.eigenvalues.length).toBe(3);
    expect(eig.eigenResult!.eigenvalues.every((v) => Number.isFinite(v))).toBe(true);
  });

  test('π\'siz çok terimli pivot artık sembolik çözülür (eskiden sayısal motora düşüyordu)', () => {
    const inv = go('inverse', [['1', '√2', '0'], ['1', '1', '1'], ['1', '1', '√3']]);
    expect(inv.success).toBe(true);
    expect(inv.matrixResultLabels).toBeDefined();
    expect(inv.matrixResultLabels![2]).toEqual(['0', '-1/2 - √3/2', '1/2 + √3/2']);
  });

  test('sembolik hata mesajları (boyut uyuşmazlığı, tekil matris)', () => {
    expect(go('add', [['√2']], [['1', '2']]).success).toBe(false);
    expect(go('inverse', [['√2', '2'], ['1', '√2']]).success).toBe(false);
  });

  test('mod değişimi: ondalık modda sembol yok, kesirli modda tam ifade', () => {
    const a = go('scalarMultiply', [['√2', '1/2']], [['0']], { scalar: '√2' }, 'decimal');
    expect(a.matrixResultLabels).toBeUndefined(); // sembolik etiket yok; sayılar canlı ondalık biçimlenir
    expect(a.matrixResult![0][0]).toBeCloseTo(2, 9);
    expect(a.matrixResult![0][1]).toBeCloseTo(Math.SQRT2 / 2, 9);
    const b = go('scalarMultiply', [['√2', '1/2']], [['0']], { scalar: '√2' }, 'fraction');
    expect(b.matrixResultLabels).toEqual([['2', '√2/2']]);
  });

  test('bozuk / yarım giriş asla istisna fırlatmaz (fuzz)', () => {
    let seed = 99;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const alphabet = ['0', '1', '2', '7', '.', ',', '/', '-', '√', 'pi', 'p', 'i', '^', 'sqrt', ' ', '9'];
    const junk = () => Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
    const ops = ['add', 'subtract', 'scalarMultiply', 'multiply', 'determinant', 'inverse', 'transpose', 'trace', 'rank', 'rref', 'gaussElimination', 'lu', 'power', 'solveLinearSystem', 'eigen'];
    for (let t = 0; t < 1500; t++) {
      const n = 1 + Math.floor(rnd() * 3);
      const mk = () => Array.from({ length: n }, () => Array.from({ length: n }, () => sanitizeFractionalInputText(junk())));
      const A = mk();
      const B = mk();
      const b = Array.from({ length: n }, () => sanitizeFractionalInputText(junk()));
      const op = ops[Math.floor(rnd() * ops.length)];
      const r = go(op, A, B, { b, scalar: sanitizeFractionalInputText(junk()), exponent: Math.floor(rnd() * 7) - 3 });
      expect(typeof r.success).toBe('boolean');
    }
  });
});
