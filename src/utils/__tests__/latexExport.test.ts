import { buildStepsLatexDocument, unicodeToLatex } from '../latexExport';
import { runOperation } from '../runOperation';
import { parseFractionalInput } from '../numberFormat';

// XeLaTeX'in varsayılan fontunda (Latin Modern) glifi OLMAYAN karakterler (gerçek derlemeyle tespit edildi):
// bunlar .tex içinde ham kalırsa PDF'te sessizce kaybolurlar.
const MISSING_IN_DEFAULT_FONT = /[αεθλμπρᴴᵀᵢ⁰⁴-⁹⁻₀-₉ₖℝ↔⇒∈∛≈≠≡≤≥⊕✓ⱼ]/;

const num = (t: string[][]) => t.map((r) => r.map(parseFractionalInput));
const go = (op: any, A: string[][], B: string[][] = [['0']], extra: any = {}) =>
  runOperation(op, num(A), num(B), parseFractionalInput(extra.scalar ?? '2'), extra.exponent ?? 2, (extra.b ?? []).map(parseFractionalInput), extra.method ?? 'gauss', 'tr', 'fraction', {
    A, B, scalar: extra.scalar ?? '2', b: extra.b, exponent: extra.exponent ?? 2, method: extra.method ?? 'gauss', complex: extra.complex,
  });

describe('unicodeToLatex (metin modu)', () => {
  test('Yunan harfleri ve indisler birleşik matematik parçasına çevrilir', () => {
    expect(unicodeToLatex('λ₁ = 1 + √2')).toBe('$\\lambda_{1}$ = 1 + √2');
    expect(unicodeToLatex('π ve λ')).toBe('$\\pi$ ve $\\lambda$');
    expect(unicodeToLatex('λπ')).toBe('$\\lambda\\pi$');
  });

  test('üst indis dizileri tek grupta toplanır: A⁻¹, Aᵀ, x²⁰', () => {
    expect(unicodeToLatex('A⁻¹')).toBe('A$^{-1}$');
    expect(unicodeToLatex('Aᵀ')).toBe('A$^{\\mathsf{T}}$');
    expect(unicodeToLatex('Aᴴ')).toBe('A$^{\\mathsf{H}}$');
    expect(unicodeToLatex('x²')).toBe('x$^{2}$');
    expect(unicodeToLatex('xᵢⱼ')).toBe('x$_{ij}$');
  });

  test('matematik işaretleri: ℝ ↔ ⇒ ≤ ≥ ≠ ≈ ∈ ✓', () => {
    expect(unicodeToLatex('R2 ↔ R3')).toBe('R2 $\\leftrightarrow$ R3');
    expect(unicodeToLatex('x ∈ ℝ')).toBe('x $\\in$ $\\mathbb{R}$');
    expect(unicodeToLatex('a ≤ b ≥ c ≠ d ≈ e ⇒ f ✓')).toBe(
      'a $\\leq$ b $\\geq$ c $\\neq$ d $\\approx$ e $\\Rightarrow$ f $\\checkmark$'
    );
  });

  test('zaten sorunsuz render olan karakterler (Türkçe harfler, √, →, Δ, ·, ×, −, ²\'ye kadar) dokunulmadan kalır', () => {
    const keep = 'İşlem çözümü ğüşıöç √2 → Δ · × − ±';
    expect(unicodeToLatex(keep)).toBe(keep);
  });

  test('düz ASCII metin değişmez', () => {
    expect(unicodeToLatex('Determinant = -19')).toBe('Determinant = -19');
  });
});

describe('unicodeToLatex (matematik modu: matris içi)', () => {
  test('$ eklenmez, komutlardan sonra boşluk bırakılır', () => {
    expect(unicodeToLatex('A − λI', true)).toBe('A − \\lambda I');
    expect(unicodeToLatex('λ₁', true)).toBe('\\lambda _{1}');
  });
});

describe('buildStepsLatexDocument', () => {
  test('amssymb yüklenir (\\mathbb, \\checkmark için)', () => {
    const doc = buildStepsLatexDocument({ success: true, steps: [] } as any, 'Test');
    expect(doc).toContain('\\usepackage{amssymb}');
  });

  test('özel karakterler yine doğru kaçırılır ve eklenen $ / \\ tekrar kaçırılmaz', () => {
    const doc = buildStepsLatexDocument(
      { success: true, steps: [{ title: '50% & λ₁ #1', description: 'a_b ve x⁻¹ ve $5' }] } as any,
      'Etiket {x}'
    );
    expect(doc).toContain('\\title{Etiket \\{x\\}}');
    expect(doc).toContain('\\textbf{50\\% \\& $\\lambda_{1}$ \\#1}');
    expect(doc).toContain('a\\_b ve x$^{-1}$ ve \\$5');
    expect(doc).not.toMatch(MISSING_IN_DEFAULT_FONT);
  });

  test('hata sayfası da güvenli', () => {
    const doc = buildStepsLatexDocument({ success: false, errorMessage: 'λ ≠ 0 olmalı', steps: [] } as any, 'x');
    expect(doc).toContain('$\\lambda$ $\\neq$ 0 olmalı');
  });

  const M3 = [['2', '1', '3'], ['0', '-1', '4'], ['1', '2', '5']];
  const S3 = [['2', '1', '0'], ['1', '3', '1'], ['0', '1', '4']];
  const CX = [['1+2i', '3'], ['0', '2-i']];
  const ops: Array<[string, () => any]> = [
    ['determinant', () => go('determinant', M3)],
    ['inverse', () => go('inverse', S3)],
    ['transpose', () => go('transpose', M3)],
    ['rank', () => go('rank', M3)],
    ['rref', () => go('rref', M3)],
    ['gaussElimination', () => go('gaussElimination', M3)],
    ['eigen', () => go('eigen', [['4', '1'], ['2', '3']])],
    ['eigen 3x3', () => go('eigen', S3)],
    ['eigen √', () => go('eigen', [['√2', '1'], ['1', '√2']])],
    ['eigen π', () => go('eigen', [['π', '1'], ['2', '3']])],
    ['eigen dönme (karmaşık)', () => go('eigen', [['0', '-1'], ['1', '0']])],
    ['lu', () => go('lu', S3)],
    ['power', () => go('power', S3, [['0']], { exponent: 3 })],
    ['power negatif', () => go('power', [['2', '1'], ['1', '1']], [['0']], { exponent: -2 })],
    ['solve gauss', () => go('solveLinearSystem', [['2', '1'], ['1', '3']], [['0']], { b: ['5', '10'], method: 'gauss' })],
    ['solve cramer', () => go('solveLinearSystem', [['2', '1'], ['1', '3']], [['0']], { b: ['5', '10'], method: 'cramer' })],
    ['solve sonsuz çözüm', () => go('solveLinearSystem', [['1', '2'], ['2', '4']], [['0']], { b: ['1', '2'], method: 'gauss' })],
    ['karmaşık çarpma', () => go('multiply', CX, CX, { complex: true })],
    ['karmaşık eigen', () => go('eigen', CX, [['0']], { complex: true })],
    ['hermitian', () => go('hermitian', CX, [['0']], { complex: true })],
  ];

  test.each(ops)('%s: üretilen .tex içinde font-bağımlı (kaybolacak) karakter kalmaz', (_name, run) => {
    const r = run();
    const doc = buildStepsLatexDocument(r, 'İşlem', 'fraction');
    expect(doc).not.toMatch(MISSING_IN_DEFAULT_FONT);
    expect(doc.startsWith('% XeLaTeX')).toBe(true);
    expect(doc.trim().endsWith('\\end{document}')).toBe(true);
  });
});
