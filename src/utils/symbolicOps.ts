// Division is done only by a single-term pivot or a pi-free multi-term one (rationalized with
// the conjugate). A pivot mixing π and roots (e.g. π + √2) is not tracked symbolically and
// the numeric engine takes over.
//
// Eigenvalues: 2x2 uses λ = (trace ± √Δ) / 2 when √Δ can be taken with symSqrt, and the
// eigenvectors are division-free (-b, a). For 3x3, a triangular matrix has its diagonal as
// eigenvalues; otherwise a root of the characteristic polynomial is built from a numeric
// candidate and verified exactly, the polynomial is divided, and the remaining quadratic is
// solved. For repeated eigenvalues the eigenspace dimension is computed exactly.
// Other cases (4x4+, irreducible cubic, 3+ term discriminant, ...) return null and the caller
// falls back to matrixUtils.eigen.
//
// trySymbolicOperation() returns a result only when all of the following hold; otherwise it
// returns null and runOperation uses the numeric engine:
//   1. the operation is supported,
//   2. all cells/scalars can be parsed symbolically (parseSymbolicInput does not return null),
//   3. at least one cell/scalar contains π or √ (purely rational input stays numeric),
//   4. no intermediate value overflows under a radical (rational coefficients use bigint),
//   5. no result cell has more than MAX_RESULT_TERMS terms.

import { buildLuSteps, permFromP } from './luSteps';
import { LanguageCode, MatrixData, OperationResult, OperationType, SolutionStep } from '@/types';
import { strings } from './matrixStepText';
import {
  SymNum,
  I,
  iMul,
  iGcd,
  iAbs,
  iNeg,
  iDivExact,
  SYM_ZERO,
  symAdd,
  symSub,
  symMul,
  symNeg,
  symIsIrrational,
  symIsZero,
  symDiv,
  symIsInvertible,
  symSqrt,
  SYM_ONE,
  symFromRational,
  symToNumber,
  symToString,
  symToLatex,
  parseSymbolicInput,
} from './symbolic';

import {
  QuadCtx,
  Ext,
  ext,
  extConj,
  extSub,
  extToNumber,
  extToString,
  extNullVector2,
  extNullVector3,
  cabs,
} from './quadExt';
import { realRootsCubic } from './complexEigen';
import {
  SymFrac,
  fracNormalize,
  fracAdd,
  fracMul,
  fracToNumber,
  fracToString,
  fracToLatex,
  fracTermCount,
  FRAC_ZERO,
} from './symFrac';

type Mode = 'decimal' | 'fraction';
type SymMatrix = SymNum[][];

export interface SymbolicInputs {
  A?: string[][];
  B?: string[][];
  scalar?: string;
  b?: string[];
  exponent?: number;
  /** Denklem çözme yöntemi (varsayılan 'gauss'). */
  method?: 'cramer' | 'gauss';
  complex?: boolean;
}

/** Sonuç hücresi başına en fazla terim; aşılırsa ondalık motora geri düşülür. */
export const MAX_RESULT_TERMS = 24;

export const SYMBOLIC_OPERATIONS: OperationType[] = [
  'add',
  'subtract',
  'scalarMultiply',
  'multiply',
  'transpose',
  'trace',
  'determinant',
  // Division required (limited to pivots that do not mix π and roots)
  'inverse',
  'rref',
  'rank',
  'gaussElimination',
  'lu',
  'power',
  'solveLinearSystem',
];

const T = (lang: LanguageCode, tr: string, en: string) => (lang === 'en' ? en : tr);

function parseMatrix(texts: string[][] | undefined, m: MatrixData): SymMatrix | null {
  if (!texts || texts.length !== m.length) return null;
  const out: SymMatrix = [];
  for (let i = 0; i < m.length; i++) {
    const row = texts[i];
    if (!row || row.length !== m[i].length) return null;
    const parsed: SymNum[] = [];
    for (let j = 0; j < row.length; j++) {
      const v = parseSymbolicInput(row[j]);
      if (v === null) return null;
      parsed.push(v);
    }
    out.push(parsed);
  }
  return out;
}

const anyIrrational = (m: SymMatrix) => m.some((row) => row.some(symIsIrrational));

/**
 * Sembolik takip sürdürülemiyor (çok terimli bölen, terim patlaması ...).
 * Error alt sınıfı + instanceof kullanılmıyor; Babel'in sınıf dönüşümü bazı ortamlarda
 * instanceof'u bozar. Bunun yerine işaretli düz bir Error.
 */
const noSym = (): never => {
  const e = new Error('SymNum: sembolik takip sürdürülemiyor');
  (e as Error & { noSymbolic?: boolean }).noSymbolic = true;
  throw e;
};
const isNoSym = (e: unknown): boolean => !!e && (e as { noSymbolic?: boolean }).noSymbolic === true;

function fail(message: string): OperationResult {
  return { success: false, errorMessage: message, steps: [] };
}

function numericOf(m: SymMatrix): MatrixData {
  return m.map((row) => row.map(symToNumber));
}

function toLabels(m: SymMatrix, mode: Mode): string[][] {
  return m.map((row) => row.map((v) => symToString(v, mode)));
}

/** Bir hücre okunabilirlik eşiğinden fazla terim içeriyorsa sembolik takibi bırak. */
function checkTerms(m: SymMatrix): void {
  for (const row of m) for (const v of row) if (v.length > MAX_RESULT_TERMS) noSym();
}

function snapshot(m: SymMatrix, mode: Mode) {
  checkTerms(m);
  return { matrixSnapshot: numericOf(m), matrixSnapshotLabels: toLabels(m, mode) };
}

function matrixResult(m: SymMatrix, steps: SolutionStep[]): OperationResult {
  checkTerms(m);
  return {
    success: true,
    matrixResult: numericOf(m),
    matrixResultLabels: toLabels(m, 'fraction'),
    matrixResultLatex: m.map((row) => row.map(symToLatex)),
    steps,
  };
}

type FracMatrix = SymFrac[][];

/** Paydalı sonuçlar bir hücrede pay + payda toplam bu kadar terimi aşarsa okunamaz: ondalığa dön. */
const MAX_FRAC_TERMS = 12;

function checkFracTerms(m: FracMatrix): void {
  for (const row of m) for (const c of row) if (fracTermCount(c) > MAX_FRAC_TERMS) noSym();
}

function snapshotFrac(m: FracMatrix, mode: Mode) {
  checkFracTerms(m);
  return {
    matrixSnapshot: m.map((row) => row.map(fracToNumber)),
    matrixSnapshotLabels: m.map((row) => row.map((c) => fracToString(c, mode))),
  };
}

function matrixResultFrac(m: FracMatrix, steps: SolutionStep[]): OperationResult {
  checkFracTerms(m);
  return {
    success: true,
    matrixResult: m.map((row) => row.map(fracToNumber)),
    matrixResultLabels: m.map((row) => row.map((c) => fracToString(c, 'fraction'))),
    matrixResultLatex: m.map((row) => row.map(fracToLatex)),
    steps,
  };
}

const orNoSym = <V,>(v: V | null): V => (v === null ? noSym() : v);

function scalarResult(v: SymNum, steps: SolutionStep[]): OperationResult {
  checkTerms([[v]]);
  return {
    success: true,
    scalarResult: symToNumber(v),
    scalarResultLabel: symToString(v, 'fraction'),
    scalarResultLatex: symToLatex(v),
    steps,
  };
}

function minorOf(m: SymMatrix, col: number): SymMatrix {
  return m.slice(1).map((row) => row.filter((_, j) => j !== col));
}

function detSym(m: SymMatrix): SymNum {
  const n = m.length;
  if (n === 1) return m[0][0];
  if (n === 2) return symSub(symMul(m[0][0], m[1][1]), symMul(m[0][1], m[1][0]));
  let sum: SymNum = SYM_ZERO;
  for (let j = 0; j < n; j++) {
    if (m[0][j].length === 0) continue;
    const term = symMul(m[0][j], detSym(minorOf(m, j)));
    sum = j % 2 === 0 ? symAdd(sum, term) : symSub(sum, term);
  }
  return sum;
}

function mulCells(X: SymMatrix, Y: SymMatrix, S: ReturnType<typeof strings>, mode: Mode) {
  const f = (v: SymNum) => symToString(v, mode);
  const fp = (v: SymNum) => `(${f(v)})`;
  const rows = X.length;
  const inner = X[0].length;
  const cols = Y[0].length;
  const R: SymMatrix = Array.from({ length: rows }, () => Array.from({ length: cols }, () => SYM_ZERO));
  const cellSteps: SolutionStep[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum: SymNum = SYM_ZERO;
      const termParts: string[] = [];
      const valueParts: string[] = [];
      for (let k = 0; k < inner; k++) {
        const product = symMul(X[i][k], Y[k][j]);
        sum = symAdd(sum, product);
        termParts.push(`${fp(X[i][k])}${fp(Y[k][j])}`);
        valueParts.push(fp(product));
      }
      R[i][j] = sum;
      cellSteps.push({
        title: S.cellCalcTitle(i + 1, j + 1),
        description: `C[${i + 1}][${j + 1}] = ${termParts.join(' + ')}\n= ${valueParts.join(' + ')} = ${f(sum)}`,
      });
    }
  }
  return { R, cellSteps };
}

const LINEAR_OPERATIONS: OperationType[] = [
  'inverse',
  'rref',
  'rank',
  'gaussElimination',
  'lu',
  'power',
  'solveLinearSystem',
];

const cloneSym = (m: SymMatrix): SymMatrix => m.map((row) => [...row]);

const isOne = (v: SymNum) =>
  v.length === 1 && v[0].c.n === 1 && v[0].c.d === 1 && v[0].p === 0 && v[0].r === 1;

function identitySym(n: number): SymMatrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? SYM_ONE : SYM_ZERO)));
}

function divide(a: SymNum, b: SymNum): SymNum {
  return symDiv(a, b) ?? noSym();
}

/**
 * pivotRow'dan başlayarak `col` sütununda pivot seçer. Sembolik cebirde
 * "en büyük mutlak değer" seçimi anlamsızdır (sıfır testi KESİNDİR); bunun
 * yerine önce sıfırdan farklı TEK TERİMLİ bir eleman aranır (en sade bölme),
 * yoksa bölünebilir (π'siz) çok terimli bir eleman, o da yoksa ilk sıfırdan
 * farklı eleman seçilir; bölme gerektiğinde `divide` sembolik takibi bırakır
 * (bölme hiç gerekmiyorsa - ör. Gauss'ta son pivot - hesap sembolik sürer).
 *  -1 → sütunun aşağı kısmı tamamen 0 (pivot yok).
 */
function pickPivot(m: SymMatrix, pivotRow: number, col: number): number {
  let firstNonZero = -1;
  let firstInvertible = -1;
  for (let r = pivotRow; r < m.length; r++) {
    const v = m[r][col];
    if (v.length === 0) continue;
    if (v.length === 1) return r;
    if (firstInvertible === -1 && symIsInvertible(v)) firstInvertible = r;
    if (firstNonZero === -1) firstNonZero = r;
  }
  return firstInvertible !== -1 ? firstInvertible : firstNonZero;
}

interface ElimText {
  skip?: (col: number) => SolutionStep;
  swap: (a: number, b: number) => SolutionStep;
  normalize: (row: number, pivot: string) => SolutionStep;
  rowOp: (r: number, factor: string, pivotRow: number, col: number) => SolutionStep;
}

/**
 * Sembolik eliminasyon çekirdeği (RREF, Gauss ve ters için ortak).
 *  jordan=true  → pivot sütunu TÜM diğer satırlarda sıfırlanır (RREF/ters),
 *  jordan=false → yalnızca pivotun altında (ileri eliminasyon).
 *  normalize    → pivot satırı pivota bölünsün mü ('always': ters,
 *                 'ifNotOne': RREF, 'never': Gauss - çarpan bölmeyle bulunur).
 * Pivot sayısını döndürür.
 */
function eliminate(
  m: SymMatrix,
  pivotCols: number,
  opts: { jordan: boolean; normalize: 'always' | 'ifNotOne' | 'never' },
  text: ElimText,
  mode: Mode,
  steps: SolutionStep[]
): number {
  const rows = m.length;
  const f = (v: SymNum) => symToString(v, mode);
  let pivotRow = 0;
  let count = 0;
  for (let col = 0; col < pivotCols && pivotRow < rows; col++) {
    const pr = pickPivot(m, pivotRow, col);
    if (pr === -1) {
      if (text.skip) steps.push(text.skip(col));
      continue;
    }
    if (pr !== pivotRow) {
      [m[pivotRow], m[pr]] = [m[pr], m[pivotRow]];
      steps.push({ ...text.swap(pivotRow, pr), ...snapshot(m, mode) });
    }
    const pivot = m[pivotRow][col];
    if (opts.normalize === 'always' || (opts.normalize === 'ifNotOne' && !isOne(pivot))) {
      m[pivotRow] = m[pivotRow].map((v) => divide(v, pivot));
      steps.push({ ...text.normalize(pivotRow, f(pivot)), ...snapshot(m, mode) });
    }
    for (let r = opts.jordan ? 0 : pivotRow + 1; r < rows; r++) {
      if (r === pivotRow || m[r][col].length === 0) continue;
      const factor = opts.normalize === 'never' ? divide(m[r][col], m[pivotRow][col]) : m[r][col];
      m[r] = m[r].map((v, c) => symSub(v, symMul(factor, m[pivotRow][c])));
      steps.push({ ...text.rowOp(r, f(factor), pivotRow, col), ...snapshot(m, mode) });
    }
    pivotRow++;
    count++;
  }
  return count;
}

function parseVector(texts: string[] | undefined, n: number): SymNum[] | null {
  if (!texts || texts.length !== n) return null;
  const out: SymNum[] = [];
  for (const t of texts) {
    const v = parseSymbolicInput(t);
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

function invertSym(A: SymMatrix, S: ReturnType<typeof strings>, mode: Mode, steps: SolutionStep[]): SymMatrix | null {
  const n = A.length;
  const det = detSym(A);
  if (symIsZero(det)) return null;
  const f = (v: SymNum) => symToString(v, mode);
  const aug: SymMatrix = A.map((row, i) => [...row, ...identitySym(n)[i]]);
  steps.push({ title: S.inverseDetCheckTitle(), description: S.inverseDetCheckDesc(f(det)) });
  steps.push({ title: S.inverseAugmentedTitle(), description: S.inverseAugmentedDesc(), ...snapshot(aug, mode) });
  eliminate(
    aug,
    n,
    { jordan: true, normalize: 'always' },
    {
      swap: (a, b) => ({ title: S.inverseSwapTitle(), description: S.inverseSwapDesc(a + 1, b + 1) }),
      normalize: (row, pivot) => ({ title: S.inverseNormalizeTitle(), description: S.inverseNormalizeDesc(row + 1, pivot) }),
      rowOp: (r, factor, pr, col) => ({
        title: S.inverseRowOpTitle(),
        description: S.inverseRowOpDesc(r + 1, factor, pr + 1, col + 1),
      }),
    },
    mode,
    steps
  );
  steps.push({ title: S.inverseReduceDoneTitle(), description: S.inverseReduceDoneDesc(), ...snapshot(aug, mode) });
  const result = aug.map((row) => row.slice(n));
  steps.push({ title: S.inverseResultTitle(), description: S.inverseResultDesc(), ...snapshot(result, mode) });
  return result;
}

function mulFrac(X: FracMatrix, Y: FracMatrix): FracMatrix {
  const n = X.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let sum: SymFrac = FRAC_ZERO;
      for (let k = 0; k < n; k++) sum = orNoSym(fracAdd(sum, orNoSym(fracMul(X[i][k], Y[k][j]))));
      return sum;
    })
  );
}

/**
 * Ters matris: önce Gauss-Jordan; çok terimli bir pivota bölmek gerekirse
 * ek olarak "adjugate / determinant" yolu denenir (yalnızca determinant TEK
 * TERİMLİ ise mümkündür - planın kuralı). result === null → tekil matris.
 */
function invertAny(
  A: SymMatrix,
  S: ReturnType<typeof strings>,
  lang: LanguageCode,
  mode: Mode
): { result: SymMatrix | null; frac?: FracMatrix; steps: SolutionStep[] } {
  try {
    const steps: SolutionStep[] = [];
    const result = invertSym(A, S, mode, steps);
    return { result, steps };
  } catch (e) {
    if (!isNoSym(e)) throw e;
  }
  const n = A.length;
  const det = detSym(A);
  const f = (v: SymNum) => symToString(v, mode);
  const detInvertible = symIsInvertible(det);
  const steps: SolutionStep[] = [
    { title: S.inverseDetCheckTitle(), description: S.inverseDetCheckDesc(f(det)) },
    {
      title: T(lang, 'Adjugate yöntemi', 'Adjugate method'),
      description: T(
        lang,
        'Gauss-Jordan sırasında çok terimli bir pivota bölmek gerektiği için ters, A⁻¹ = adj(A) / det(A) formülüyle bulunuyor (det(A) ifadesine bölme sembolik yapılabildiğinden sonuç sembolik kalır).',
        'Gauss-Jordan would require dividing by a multi-term pivot, so the inverse is computed as A⁻¹ = adj(A) / det(A) (dividing by det(A) can be done symbolically, so the result stays exact).'
      ),
    },
  ];
  const cof: SymMatrix = Array.from({ length: n }, () => Array.from({ length: n }, () => SYM_ZERO));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const minor = A.filter((_, r) => r !== i).map((row) => row.filter((_, c) => c !== j));
      const d = n === 1 ? SYM_ONE : detSym(minor);
      cof[i][j] = (i + j) % 2 === 0 ? d : symNeg(d);
    }
  }
  steps.push({
    title: T(lang, 'Kofaktör matrisi', 'Cofactor matrix'),
    description: T(lang, 'Cᵢⱼ = (−1)^(i+j)·Mᵢⱼ', 'Cᵢⱼ = (−1)^(i+j)·Mᵢⱼ'),
    ...snapshot(cof, mode),
  });
  const adj: SymMatrix = cof[0].map((_, j) => cof.map((row) => row[j]));
  steps.push({
    title: T(lang, 'Adjugate (kofaktörlerin transpozu)', 'Adjugate (transpose of cofactors)'),
    description: 'adj(A) = Cᵀ',
    ...snapshot(adj, mode),
  });
  if (!detInvertible) {
    // det(A), π ile kökün KARIŞIK olduğu çok terimli bir ifade (ör. π + √2): SymNum
    // bunu ters çeviremez. Her hücre pay/payda olarak tutulur, payda eşlenikle
    // köksüzleştirilir: 1/(π+√2) = (π−√2)/(π²−2)  (bkz. symFrac.ts).
    steps.push({
      title: T(lang, 'Paydanın rasyonelleştirilmesi', 'Rationalizing the denominator'),
      description: T(
        lang,
        `det(A) = ${f(det)} hem π hem kök içerdiği için tek bir sayıya bölünemez; her hücre adj(A)ᵢⱼ / det(A) kesri olarak tutulur ve payda eşleniğiyle çarpılarak kökler paydadan atılır (π aşkın olduğu için sonuç π'de bir polinom paydasıdır).`,
        `det(A) = ${f(det)} mixes π and roots, so it cannot be inverted as a single number; each cell is kept as the fraction adj(A)ᵢⱼ / det(A) and the roots are removed from the denominator with its conjugate (π is transcendental, so the denominator is a polynomial in π).`
      ),
    });
    const frac: FracMatrix = adj.map((row) => row.map((v) => orNoSym(fracNormalize(v, det))));
    steps.push({ title: S.inverseResultTitle(), description: S.inverseResultDesc(), ...snapshotFrac(frac, mode) });
    return { result: null, frac, steps };
  }
  const result = adj.map((row) => row.map((v) => divide(v, det)));
  steps.push({ title: S.inverseResultTitle(), description: S.inverseResultDesc(), ...snapshot(result, mode) });
  return { result, steps };
}

function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (start: number) => {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let i = start; i < n; i++) {
      cur.push(i);
      rec(i + 1);
      cur.pop();
    }
  };
  rec(0);
  return out;
}

/** Rank = sıfırdan farklı en büyük minörün mertebesi (BÖLME YOK, sıfır testi KESİN). */
function rankByMinors(A: SymMatrix, lang: LanguageCode, mode: Mode): OperationResult {
  const rows = A.length;
  const cols = A[0].length;
  let rank = 0;
  let witness = '';
  for (let k = Math.min(rows, cols); k >= 1 && rank === 0; k--) {
    const rs = combinations(rows, k);
    const cs = combinations(cols, k);
    if (rs.length * cs.length > 400) noSym();
    for (const r of rs) {
      for (const c of cs) {
        const sub = r.map((i) => c.map((j) => A[i][j]));
        const d = detSym(sub);
        if (!symIsZero(d)) {
          rank = k;
          witness = symToString(d, mode);
          break;
        }
      }
      if (rank) break;
    }
  }
  const steps: SolutionStep[] = [
    {
      title: T(lang, 'Rank (minörlerle)', 'Rank (via minors)'),
      description: T(
        lang,
        `Eliminasyon, π ile kökün karıştığı çok terimli bir pivota bölmeyi gerektirdiği için rank, bölmesiz yolla bulundu: sıfırdan farklı en büyük minörün mertebesi. Sıfırdan farklı bir ${rank}×${rank} minör bulundu (det = ${witness}); daha büyük tüm minörler KESİN sıfır.`,
        `Elimination would divide by a multi-term pivot that mixes π and roots, so the rank was found without division: the order of the largest non-zero minor. A non-zero ${rank}×${rank} minor was found (det = ${witness}); all larger minors are exactly zero.`
      ),
    },
  ];
  return { success: true, scalarResult: rank, steps };
}

function computeLinear(
  type: OperationType,
  A: SymMatrix,
  inputs: SymbolicInputs,
  lang: LanguageCode,
  mode: Mode
): OperationResult | null {
  const S = strings(lang);
  const f = (v: SymNum) => symToString(v, mode);
  const rows = A.length;
  const cols = A[0].length;

  const rrefText: ElimText = {
    skip: (c) => ({ title: S.rrefSkipColTitle(c + 1), description: S.rrefSkipColDesc(c + 1) }),
    swap: (a, b) => ({ title: S.rrefSwapTitle(), description: S.rrefSwapDesc(a + 1, b + 1) }),
    normalize: (row, pivot) => ({ title: S.rrefNormalizeTitle(), description: S.rrefNormalizeDesc(row + 1, pivot) }),
    rowOp: (r, factor, pr) => ({ title: S.rrefRowOpTitle(), description: S.rrefRowOpDesc(r + 1, factor, pr + 1) }),
  };

  let b: SymNum[] | null = null;
  if (type === 'solveLinearSystem') {
    b = parseVector(inputs.b, rows);
    if (b === null) return null; // boyut uyuşmazlığı vb.: sayısal motor kendi hata mesajını versin
  }

  const irrational = anyIrrational(A) || (b !== null && b.some(symIsIrrational));
  if (!irrational) return null;

  if (type === 'rref' || type === 'rank') {
    const m = cloneSym(A);
    const steps: SolutionStep[] = [{ title: S.rrefStartTitle(), description: S.rrefStartDesc(), ...snapshot(m, mode) }];
    let count: number;
    try {
      count = eliminate(m, cols, { jordan: true, normalize: 'ifNotOne' }, rrefText, mode, steps);
    } catch (e) {
      // Eliminasyon π+kök karışık çok terimli bir pivota bölmek zorunda kaldı:
      // rank, bölmesiz minörlerle KESİN hesaplanabilir (rref için böyle bir yol yok).
      if (type === 'rank' && isNoSym(e)) return rankByMinors(A, lang, mode);
      throw e;
    }
    if (type === 'rank') {
      steps.push({ title: S.rankResultTitle(), description: S.rankResultDesc(count) });
      return { success: true, scalarResult: count, steps };
    }
    steps.push({ title: S.rrefResultTitle(), description: S.rrefResultDesc(), ...snapshot(m, mode) });
    return matrixResult(m, steps);
  }

  if (type === 'gaussElimination') {
    const m = cloneSym(A);
    const steps: SolutionStep[] = [{ title: S.gaussStartTitle(), description: S.gaussStartDesc(), ...snapshot(m, mode) }];
    eliminate(m, cols, { jordan: false, normalize: 'never' }, rrefText, mode, steps);
    steps.push({ title: S.gaussResultTitle(), description: S.gaussResultDesc(), ...snapshot(m, mode) });
    return matrixResult(m, steps);
  }

  if (type === 'inverse') {
    if (rows !== cols) return fail(S.inverseDimError());
    const { result: inv, frac, steps } = invertAny(A, S, lang, mode);
    if (frac) return matrixResultFrac(frac, steps);
    if (!inv) return fail(S.inverseSingularError());
    return matrixResult(inv, steps);
  }

  if (type === 'power') {
    if (rows !== cols) return fail(S.powerDimError());
    const n = inputs.exponent;
    if (n === undefined || !Number.isInteger(n) || Math.abs(n) > 50) return null;
    const steps: SolutionStep[] = [{ title: S.powerStartTitle(), description: S.powerStartDesc(n) }];
    if (n === 0) {
      const id = identitySym(rows);
      steps.push({ title: S.powerResultTitle(), description: S.powerZeroResultDesc(), ...snapshot(id, mode) });
      return matrixResult(id, steps);
    }
    let base = A;
    const negative = n < 0;
    if (negative) {
      const { result: inv, frac } = invertAny(A, S, lang, mode);
      if (frac) {
        // Ters, π+kök karışık paydalı: kalan çarpımlar SymFrac hücreleriyle yapılır.
        steps.push({ title: S.powerNegativeTitle(), description: S.powerNegativeDesc() });
        const absN = Math.abs(n);
        let acc: FracMatrix = frac;
        for (let i = 1; i < absN; i++) {
          acc = mulFrac(acc, frac);
          steps.push({
            title: S.powerRoundResultTitle(i + 1, absN),
            description: S.powerRoundResultDesc(i + 1, absN),
            ...snapshotFrac(acc, mode),
          });
        }
        steps.push({ title: S.powerResultTitle(), description: S.powerResultDesc(n), ...snapshotFrac(acc, mode) });
        return matrixResultFrac(acc, steps);
      }
      if (!inv) return fail(S.powerNegativeInverseError(S.inverseSingularError()));
      base = inv;
      steps.push({ title: S.powerNegativeTitle(), description: S.powerNegativeDesc() });
    }
    let result = identitySym(rows);
    const absN = Math.abs(n);
    for (let i = 0; i < absN; i++) {
      steps.push({
        title: S.powerMulTitle(i + 1, absN),
        description: negative ? S.powerMulDescNeg() : S.powerMulDescPos(),
      });
      const { R, cellSteps } = mulCells(result, base, S, mode);
      steps.push(...cellSteps);
      result = R;
      steps.push({
        title: S.powerRoundResultTitle(i + 1, absN),
        description: S.powerRoundResultDesc(i + 1, absN),
        ...snapshot(result, mode),
      });
    }
    steps.push({ title: S.powerResultTitle(), description: S.powerResultDesc(n), ...snapshot(result, mode) });
    return matrixResult(result, steps);
  }

  if (type === 'lu') {
    if (rows !== cols) return fail(S.luDimError());
    const n = rows;
    const W = cloneSym(A);
    const L = identitySym(n);
    const U: SymMatrix = Array.from({ length: n }, () => Array.from({ length: n }, () => SYM_ZERO));
    const P: MatrixData = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    const candidates: string[][] = [];
    const swaps: { step: number; to: number }[] = [];
    for (let i = 0; i < n; i++) {
      candidates.push(Array.from({ length: n - i }, (_, k) => f(W[i + k][i])));
      const pr = pickPivot(W, i, i);
      if (pr === -1) return fail(S.luZeroPivotError());
      if (pr !== i) {
        [W[i], W[pr]] = [W[pr], W[i]];
        [P[i], P[pr]] = [P[pr], P[i]];
        for (let k = 0; k < i; k++) [L[i][k], L[pr][k]] = [L[pr][k], L[i][k]];
        swaps.push({ step: i, to: pr });
      }
      for (let r = i + 1; r < n; r++) {
        const factor = divide(W[r][i], W[i][i]);
        L[r][i] = factor;
        for (let c = i; c < n; c++) W[r][c] = symSub(W[r][c], symMul(factor, W[i][c]));
      }
      for (let c = i; c < n; c++) U[i][c] = W[i][c];
    }
    const perm = permFromP(P);
    const PAs: SymMatrix = perm.map((pi) => A[pi].map((v) => v));
    const steps = buildLuSteps({
      lang,
      n,
      A: { num: numericOf(A), lab: toLabels(A, mode) },
      P,
      PA: { num: numericOf(PAs), lab: toLabels(PAs, mode) },
      L: { num: numericOf(L), lab: toLabels(L, mode) },
      U: { num: numericOf(U), lab: toLabels(U, mode) },
      candidates,
      swaps,
      maxAbs: false,
    });
    checkTerms(L);
    checkTerms(U);
    return {
      success: true,
      luResult: { L: numericOf(L), U: numericOf(U), P },
      luResultLabels: { L: toLabels(L, 'fraction'), U: toLabels(U, 'fraction') },
      steps,
    };
  }

  const bb = b as SymNum[];
  const vectorResult = (x: SymNum[], steps: SolutionStep[]): OperationResult => {
    checkTerms([x]);
    return {
      success: true,
      vectorResult: x.map(symToNumber),
      vectorResultLabels: x.map((v) => symToString(v, 'fraction')),
      vectorResultLatex: x.map(symToLatex),
      steps,
    };
  };

  const cramerSolve = (prefix: SolutionStep[]): OperationResult => {
    if (rows !== cols) return fail(S.cramerDimError());
    const detA = detSym(A);
    const steps: SolutionStep[] = [
      ...prefix,
      { title: S.cramerMainDetTitle(), description: S.cramerMainDetDesc(f(detA)) },
    ];
    if (symIsZero(detA)) return fail(S.cramerSingularError());
    // det(A) π ile kökün karıştığı çok terimli bir ifadeyse (ters çevrilemez):
    // xᵢ = det(Aᵢ)/det(A) kesri olarak tutulur, payda köksüzleştirilir (symFrac.ts).
    const useFrac = !symIsInvertible(detA);
    const x: SymNum[] = [];
    const xf: SymFrac[] = [];
    for (let i = 0; i < rows; i++) {
      const Ai = A.map((row, r) => row.map((v, c) => (c === i ? bb[r] : v)));
      const detAi = detSym(Ai);
      if (useFrac) {
        const xi = orNoSym(fracNormalize(detAi, detA));
        xf.push(xi);
        steps.push({
          title: S.cramerXiTitle(i + 1),
          description: S.cramerXiDesc(i + 1, f(detAi), f(detA), fracToString(xi, mode)),
        });
      } else {
        const xi = divide(detAi, detA);
        x.push(xi);
        steps.push({ title: S.cramerXiTitle(i + 1), description: S.cramerXiDesc(i + 1, f(detAi), f(detA), f(xi)) });
      }
    }
    if (useFrac) {
      if (xf.some((c) => fracTermCount(c) > MAX_FRAC_TERMS)) noSym();
      steps.push({ title: S.solutionTitle(), description: S.solutionDesc(xf.map((c) => fracToString(c, mode)).join(', ')) });
      return {
        success: true,
        vectorResult: xf.map(fracToNumber),
        vectorResultLabels: xf.map((c) => fracToString(c, 'fraction')),
        vectorResultLatex: xf.map(fracToLatex),
        steps,
      };
    }
    steps.push({ title: S.solutionTitle(), description: S.solutionDesc(x.map(f).join(', ')) });
    return vectorResult(x, steps);
  };

  const gaussSolve = (): OperationResult => {
  // Gauss (RREF ile): [A|b]. Pivotlar yalnızca A'nın sütunlarında aranır
  // (b sütununa bölmek gerekmez); pivotsuz kalan satırların b girdisi
  // KESİN olarak sıfırdan farklıysa sistem çelişkilidir.
  const aug: SymMatrix = A.map((row, i) => [...row, bb[i]]);
  const steps: SolutionStep[] = [{ title: S.rrefStartTitle(), description: S.rrefStartDesc(), ...snapshot(aug, mode) }];
  const rankA = eliminate(aug, cols, { jordan: true, normalize: 'ifNotOne' }, rrefText, mode, steps);
  const inconsistent = aug.slice(rankA).some((row) => row[cols].length > 0);
  if (inconsistent) {
    steps.push({ title: S.inconsistentTitle(), description: S.inconsistentDesc() });
    return { success: false, errorMessage: S.inconsistentError(), steps };
  }
  if (rankA < cols) {
    steps.push({ title: S.infiniteTitle(), description: S.infiniteDesc(rankA, cols) });
    return { success: false, errorMessage: S.infiniteError(), steps };
  }
  const x = aug.slice(0, cols).map((row) => row[cols]);
  steps.push({ title: S.uniqueSolutionTitle(), description: S.solutionDesc(x.map(f).join(', ')) });
  return vectorResult(x, steps);
  };

  if ((inputs.method ?? 'gauss') === 'cramer') return cramerSolve([]);

  try {
    return gaussSolve();
  } catch (e) {
    if (!isNoSym(e) || rows !== cols) throw e;
    // Gauss çok terimli bir pivota bölmek zorunda kaldı: determinant tek
    // terimliyse Cramer yöntemiyle yine tam sembolik çözülebilir.
    return cramerSolve([
      {
        title: T(lang, 'Yöntem değişikliği', 'Method change'),
        description: T(
          lang,
          'Gauss eliminasyonunda çok terimli bir pivota bölmek gerektiği için çözüm, determinantlarla (Cramer) sembolik olarak hesaplandı.',
          'Gauss elimination would require dividing by a multi-term pivot, so the solution was computed symbolically with determinants (Cramer).'
        ),
      },
    ]);
  }
}

export function trySymbolicOperation(
  type: OperationType,
  matrixA: MatrixData,
  matrixB: MatrixData,
  inputs: SymbolicInputs | undefined,
  lang: LanguageCode,
  mode: Mode
): OperationResult | null {
  if (!inputs || !SYMBOLIC_OPERATIONS.includes(type)) return null;
  try {
    const result = compute(type, matrixA, matrixB, inputs, lang, mode);
    if (!result) return null;
    return result;
  } catch {
    // Taşma veya beklenmeyen bir durum: sessizce sayısal motora geri dön.
    return null;
  }
}

function compute(
  type: OperationType,
  matrixA: MatrixData,
  matrixB: MatrixData,
  inputs: SymbolicInputs,
  lang: LanguageCode,
  mode: Mode
): OperationResult | null {
  const S = strings(lang);
  const f = (v: SymNum) => symToString(v, mode);
  const fp = (v: SymNum) => `(${symToString(v, mode)})`;

  const A = parseMatrix(inputs.A, matrixA);
  if (!A) return null;

  if (LINEAR_OPERATIONS.includes(type)) return computeLinear(type, A, inputs, lang, mode);

  if (type === 'transpose') {
    if (!anyIrrational(A)) return null;
    const rows = A.length;
    const cols = A[0].length;
    const R: SymMatrix = Array.from({ length: cols }, () => Array.from({ length: rows }, () => SYM_ZERO));
    const steps: SolutionStep[] = [{ title: S.transposeStartTitle(), description: S.transposeStartDesc(cols, rows) }];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        R[j][i] = A[i][j];
        steps.push({
          title: S.transposeCellTitle(j + 1, i + 1),
          description: S.transposeCellDesc(i + 1, j + 1, f(A[i][j]), j + 1, i + 1),
        });
      }
    }
    steps.push({ title: S.transposeResultTitle(), description: S.transposeResultDesc(), ...snapshot(R, mode) });
    return matrixResult(R, steps);
  }

  if (type === 'trace') {
    if (!anyIrrational(A)) return null;
    if (A.length !== A[0].length) return fail(S.traceDimError());
    let sum: SymNum = SYM_ZERO;
    const diag: SymNum[] = [];
    for (let i = 0; i < A.length; i++) {
      sum = symAdd(sum, A[i][i]);
      diag.push(A[i][i]);
    }
    return scalarResult(sum, [
      { title: S.traceDiagTitle(), description: S.traceDiagDesc(diag.map(f).join(', ')) },
      { title: S.traceSumTitle(), description: S.traceSumDesc(diag.map(f).join(' + '), f(sum)) },
    ]);
  }

  if (type === 'determinant') {
    if (!anyIrrational(A)) return null;
    const n = A.length;
    if (n !== A[0].length) return fail(S.determinantDimError());
    const steps: SolutionStep[] = [];
    let det: SymNum;
    if (n === 1) {
      steps.push({ title: S.detDepth1Title(1), description: S.detDepth1Desc(f(A[0][0])) });
      det = A[0][0];
    } else if (n === 2) {
      det = detSym(A);
      steps.push({
        title: S.detDepth2Title(1),
        description: S.detDepth2Desc(f(A[0][0]), f(A[1][1]), f(A[0][1]), f(A[1][0]), f(det)),
      });
    } else {
      steps.push({
        title: T(lang, 'Kofaktör açılımı (1. satır)', 'Cofactor expansion (row 1)'),
        description: T(
          lang,
          'Determinant, birinci satırın elemanları ve minörleri ile hesaplanır: det(A) = a₁₁·M₁₁ − a₁₂·M₁₂ + a₁₃·M₁₃ − … Bölme gerekmediği için sonuç tam sembolik kalır (ondalığa çevrilmez).',
          'The determinant is computed from the first-row entries and their minors: det(A) = a₁₁·M₁₁ − a₁₂·M₁₂ + a₁₃·M₁₃ − … No division is needed, so the result stays fully symbolic (never converted to a decimal).'
        ),
        ...snapshot(A, mode),
      });
      const expr: string[] = [];
      for (let j = 0; j < n; j++) {
        const minor = minorOf(A, j);
        const minorDet = detSym(minor);
        steps.push({
          title: T(lang, `M₁${j + 1} minörü`, `Minor M₁${j + 1}`),
          description: T(lang, `M₁${j + 1} = det(alt matris) = ${f(minorDet)}`, `M₁${j + 1} = det(submatrix) = ${f(minorDet)}`),
          ...snapshot(minor, mode),
        });
        expr.push(`${j === 0 ? '' : j % 2 === 0 ? ' + ' : ' - '}${fp(A[0][j])}${fp(minorDet)}`);
      }
      det = detSym(A);
      steps.push({
        title: T(lang, 'Kofaktörlerin toplamı', 'Sum of cofactor terms'),
        description: `det(A) = ${expr.join('')}\n= ${f(det)}`,
      });
    }
    steps.push({ title: S.detResultTitle(), description: S.detResultDesc(f(det)) });
    return scalarResult(det, steps);
  }

  if (type === 'scalarMultiply') {
    const k = parseSymbolicInput(inputs.scalar ?? '');
    if (k === null) return null;
    if (!anyIrrational(A) && !symIsIrrational(k)) return null;
    const rows = A.length;
    const cols = A[0].length;
    const R: SymMatrix = Array.from({ length: rows }, () => Array.from({ length: cols }, () => SYM_ZERO));
    const steps: SolutionStep[] = [{ title: S.scalarStartTitle(), description: S.scalarStartDesc(f(k)) }];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        R[i][j] = symMul(A[i][j], k);
        steps.push({
          title: S.cellCalcTitle(i + 1, j + 1),
          description: S.scalarCellDesc(f(k), i + 1, j + 1, f(A[i][j]), f(R[i][j])),
        });
      }
    }
    steps.push({ title: S.scalarResultTitle(), description: S.scalarResultDesc(), ...snapshot(R, mode) });
    return matrixResult(R, steps);
  }

  const B = parseMatrix(inputs.B, matrixB);
  if (!B) return null;
  if (!anyIrrational(A) && !anyIrrational(B)) return null;

  const ra = A.length, ca = A[0].length, rb = B.length, cb = B[0].length;

  if (type === 'add' || type === 'subtract') {
    const isAdd = type === 'add';
    if (ra !== rb || ca !== cb) return fail(isAdd ? S.addDimError() : S.subtractDimError());
    const R: SymMatrix = Array.from({ length: ra }, () => Array.from({ length: ca }, () => SYM_ZERO));
    const steps: SolutionStep[] = [
      {
        title: S.addSubDimCheckTitle(),
        description: isAdd ? S.addDimCheckDesc(ra, ca, rb, cb) : S.subtractDimCheckDesc(ra, ca, rb, cb),
      },
    ];
    for (let i = 0; i < ra; i++) {
      for (let j = 0; j < ca; j++) {
        R[i][j] = isAdd ? symAdd(A[i][j], B[i][j]) : symSub(A[i][j], B[i][j]);
        steps.push({
          title: S.cellCalcTitle(i + 1, j + 1),
          description: isAdd
            ? S.addCellDesc(i + 1, j + 1, f(A[i][j]), f(B[i][j]), f(R[i][j]))
            : S.subtractCellDesc(i + 1, j + 1, f(A[i][j]), f(B[i][j]), f(R[i][j])),
        });
      }
    }
    steps.push({
      title: S.addResultTitle(),
      description: isAdd ? S.addResultDesc() : S.subtractResultDesc(),
      ...snapshot(R, mode),
    });
    return matrixResult(R, steps);
  }

  if (type === 'multiply') {
    if (ca !== rb) return fail(S.multiplyDimError(ca, rb));
    const steps: SolutionStep[] = [
      { title: S.addSubDimCheckTitle(), description: S.multiplyDimCheckDesc(ra, ca, rb, cb) },
    ];
    const { R, cellSteps } = mulCells(A, B, S, mode);
    steps.push(...cellSteps);
    steps.push({ title: S.addResultTitle(), description: S.multiplyResultDesc(), ...snapshot(R, mode) });
    return matrixResult(R, steps);
  }

  return null;
}

// Eigenvalues/eigenvectors (symbolic, 2x2 and 3x3). runOperation calls this separately for 'eigen':
// the result fills OperationResult.eigenResult instead of matrixResult/scalarResult, so it is
// not part of the trySymbolicOperation flow above.

/**
 * (A - λI)'nin (2x2, tek satırı bilinen λ için) null uzayından bir taban
 * çıkarır. Bölme GEREKMEZ: ax + by = 0 denkleminin bir çözümü her zaman
 * v = (-b, a)'dır (a ve b'nin ikisi de sıfır değilse; ikisi de sıfırsa o
 * satır bilgi taşımaz, diğer satır kullanılır). Matrisin HER İKİ satırı da
 * sıfırsa (A = λI durumu, yalnızca tekrarlı özdeğerde olur), özuzay
 * 2 boyutludur ve standart taban [(1,0), (0,1)] döner.
 */
function nullVectors2x2(shifted: SymMatrix): SymNum[][] {
  const [[s00, s01], [s10, s11]] = shifted;
  const rowIsZero = (x: SymNum, y: SymNum) => symIsZero(x) && symIsZero(y);
  if (rowIsZero(s00, s01) && rowIsZero(s10, s11)) {
    return [
      [SYM_ONE, SYM_ZERO],
      [SYM_ZERO, SYM_ONE],
    ];
  }
  const [a, b] = rowIsZero(s00, s01) ? [s10, s11] : [s00, s01];
  // a·x + b·y = 0'ın en sade çözümü: a=0 ise y=0 (x serbest) ⇒ v=(1,0);
  // b=0 ise x=0 (y serbest) ⇒ v=(0,1); aksi halde genel çözüm v=(-b,a).
  // Bu özel durumlar, örn. köşegen bir matriste özvektörün irrasyonel bir
  // katsayıyla ölçeklenmiş (-b, 0) yerine sade (1, 0) olarak çıkmasını sağlar.
  if (symIsZero(a)) return [[SYM_ONE, SYM_ZERO]];
  if (symIsZero(b)) return [[SYM_ZERO, SYM_ONE]];
  return [[symNeg(b), a]];
}

/**
 * 2x2 ve 3x3 matrislerin özdeğer/özvektörlerini, girişler π/√ içerdiğinde
 * tam sembolik hesaplamaya çalışır. Temsil edilemeyen durumlarda
 * (indirgenemez kübik, 4x4+, karmaşık özdeğer, diskriminantın karekökü
 * çözülemiyor, terim patlaması) null döner - çağıran taraf mevcut
 * ondalık motora (matrixUtils.eigen) geri düşer.
 */
export function trySymbolicEigen(
  matrixA: MatrixData,
  inputs: SymbolicInputs | undefined,
  lang: LanguageCode,
  mode: Mode
): OperationResult | null {
  if (!inputs) return null;
  try {
    if (matrixA.length === 2) return computeEigen2x2(matrixA, inputs, lang, mode);
    if (matrixA.length === 3) return computeEigen3x3(matrixA, inputs, lang, mode);
    return null;
  } catch (e) {
    if (isNoSym(e)) return null;
    return null;
  }
}

function computeEigen2x2(matrixA: MatrixData, inputs: SymbolicInputs, lang: LanguageCode, mode: Mode): OperationResult | null {
  if (matrixA[0]?.length !== 2) return null;
  const A = parseMatrix(inputs.A, matrixA);
  if (!A) return null;
  // Saf rasyonel girişlerde GERÇEL özdeğerler için mevcut köklü destek
  // (eigenvalues2x2) yeterli; ama KARMAŞIK özdeğer (Δ < 0) yalnızca burada
  // tam gösterilebildiği için o durum aşağıda ayrıca ele alınır.
  const rationalInput = !anyIrrational(A);

  const f = (v: SymNum) => symToString(v, mode);
  const a00 = A[0][0], a01 = A[0][1], a10 = A[1][0], a11 = A[1][1];

  const steps: SolutionStep[] = [
    {
      title: T(lang, 'Matris (Sembolik)', 'Matrix (Symbolic)'),
      description: T(
        lang,
        'Girişler π ve/veya √ içerdiğinden özdeğerler ondalığa çevrilmeden tam sembolik hesaplanır.',
        'Since the entries contain π and/or √, the eigenvalues are computed fully symbolically (never converted to decimal).'
      ),
      ...snapshot(A, mode),
    },
  ];

  let lambda1: SymNum;
  let lambda2: SymNum;

  // Hızlı yol: üçgen matris (bir alt köşegen sıfır) ⇒ özdeğerler doğrudan
  // köşegen elemanlarıdır, karekök hiç gerekmez, her zaman tam temsil
  // edilebilir (ör. tam köşegen matrisler bu dalın özel bir hâlidir).
  const isTriangular = symIsZero(a10) || symIsZero(a01);
  if (isTriangular) {
    if (rationalInput) return null; // rasyonel üçgen ⇒ gerçel özdeğerler, ondalık/köklü motor
    lambda1 = a00;
    lambda2 = a11;
    steps.push({
      title: T(lang, 'Üçgen Matris', 'Triangular Matrix'),
      description: T(
        lang,
        `Matris üçgen olduğundan özdeğerler doğrudan köşegen elemanlarıdır: λ₁ = ${f(lambda1)}, λ₂ = ${f(lambda2)}`,
        `Since the matrix is triangular, the eigenvalues are simply the diagonal entries: λ₁ = ${f(lambda1)}, λ₂ = ${f(lambda2)}`
      ),
    });
  } else {
    const tr = symAdd(a00, a11);
    const det = symSub(symMul(a00, a11), symMul(a01, a10));
    const disc = symSub(symMul(tr, tr), symMul(symFromRational(4), det));
    checkTerms([[tr, det, disc]]);
    const complexCase = !symIsZero(disc) && symToNumber(disc) < 0;
    if (rationalInput && !complexCase) return null;
    steps.push({
      title: T(lang, 'Karakteristik Polinom', 'Characteristic Polynomial'),
      description: T(
        lang,
        `İz(A) = ${f(tr)}, det(A) = ${f(det)}\nΔ = İz² − 4·det = ${f(disc)}`,
        `trace(A) = ${f(tr)}, det(A) = ${f(det)}\nΔ = trace² − 4·det = ${f(disc)}`
      ),
    });

    if (complexCase) {
      // Δ < 0 ⇒ karmaşık eşlenik özdeğerler.
      return quadEigen2x2(A, tr, disc, symSqrt(symNeg(disc)), steps, lang, mode);
    }
    if (symIsZero(disc)) {
      // Tekrarlı özdeğer: λ = İz/2 (2'ye bölme her zaman temsil edilebilir).
      const lambda = symDiv(tr, symFromRational(2));
      if (lambda === null) return null;
      lambda1 = lambda;
      lambda2 = lambda;
      steps.push({
        title: T(lang, 'Tekrarlı Özdeğer', 'Repeated Eigenvalue'),
        description: T(lang, `Δ = 0 olduğundan tek bir özdeğer tekrarlanır: λ = İz(A)/2 = ${f(lambda)}`, `Since Δ = 0, a single eigenvalue is repeated: λ = trace(A)/2 = ${f(lambda)}`),
      });
    } else {
      const sqrtDisc = symSqrt(disc);
      // Δ'nın karekökü sadeleşmiyor (3+ terimli, π+kök karışık ...): √Δ olduğu
      // gibi (opak) bırakılarak yine tam sembolik sonuç verilir.
      if (sqrtDisc === null) return quadEigen2x2(A, tr, disc, null, steps, lang, mode);
      const l1 = symDiv(symAdd(tr, sqrtDisc), symFromRational(2));
      const l2 = symDiv(symSub(tr, sqrtDisc), symFromRational(2));
      if (l1 === null || l2 === null) return null;
      lambda1 = l1;
      lambda2 = l2;
      steps.push({
        title: T(lang, 'Özdeğerler', 'Eigenvalues'),
        description: T(
          lang,
          `√Δ = ${f(sqrtDisc)}\nλ = (İz ± √Δ) / 2  →  λ₁ = ${f(lambda1)}, λ₂ = ${f(lambda2)}`,
          `√Δ = ${f(sqrtDisc)}\nλ = (trace ± √Δ) / 2  →  λ₁ = ${f(lambda1)}, λ₂ = ${f(lambda2)}`
        ),
      });
    }
  }

  checkTerms([[lambda1, lambda2]]);

  // Özvektörler: λ1 ≡ λ2 (sembolik/kesin eşitlik) ise TEK bir kaydırılmış
  // matristen (A - λI) taban çıkarılır (özuzay 2 boyutlu olabilir - bkz.
  // nullVectors2x2); aksi halde her özdeğer kendi kaydırılmış matrisinden
  // ayrı ayrı hesaplanır.
  const repeated = symIsZero(symSub(lambda1, lambda2));
  let v1: SymNum[];
  let v2: SymNum[];
  if (repeated) {
    const shifted: SymMatrix = [
      [symSub(a00, lambda1), a01],
      [a10, symSub(a11, lambda1)],
    ];
    const basis = nullVectors2x2(shifted);
    v1 = basis[0];
    v2 = basis.length > 1 ? basis[1] : basis[0];
  } else {
    const shifted1: SymMatrix = [
      [symSub(a00, lambda1), a01],
      [a10, symSub(a11, lambda1)],
    ];
    const shifted2: SymMatrix = [
      [symSub(a00, lambda2), a01],
      [a10, symSub(a11, lambda2)],
    ];
    v1 = nullVectors2x2(shifted1)[0];
    v2 = nullVectors2x2(shifted2)[0];
  }
  checkTerms([v1, v2]);

  steps.push({
    title: T(lang, 'Özvektörler', 'Eigenvectors'),
    description: T(
      lang,
      `λ₁ = ${f(lambda1)} için v₁ = [${f(v1[0])}, ${f(v1[1])}]\nλ₂ = ${f(lambda2)} için v₂ = [${f(v2[0])}, ${f(v2[1])}]`,
      `For λ₁ = ${f(lambda1)}, v₁ = [${f(v1[0])}, ${f(v1[1])}]\nFor λ₂ = ${f(lambda2)}, v₂ = [${f(v2[0])}, ${f(v2[1])}]`
    ),
  });

  return {
    success: true,
    eigenResult: {
      eigenvalues: [symToNumber(lambda1), symToNumber(lambda2)],
      eigenvectors: [
        [symToNumber(v1[0]), symToNumber(v1[1])],
        [symToNumber(v2[0]), symToNumber(v2[1])],
      ],
      radicalExpressions: [f(lambda1), f(lambda2)],
      eigenvectorRadicals: [
        [f(v1[0]), f(v1[1])],
        [f(v2[0]), f(v2[1])],
      ],
    },
    steps,
  };
}

/** A·v = λ·v'nin sayısal (ondalık) sağlaması; s'nin cisim dışı olduğu varsayımına karşı emniyet. */
function extResidualOk(A: SymMatrix, ctx: QuadCtx, lam: Ext, v: Ext[]): boolean {
  const An = A.map((row) => row.map(symToNumber));
  const l = extToNumber(ctx, lam);
  const vn = v.map((x) => extToNumber(ctx, x));
  const scale = Math.max(...vn.map(cabs));
  if (!(scale > 1e-9)) return false;
  for (let i = 0; i < A.length; i++) {
    let re = 0, im = 0;
    for (let j = 0; j < A.length; j++) {
      re += An[i][j] * vn[j].re;
      im += An[i][j] * vn[j].im;
    }
    const lr = l.re * vn[i].re - l.im * vn[i].im;
    const li = l.re * vn[i].im + l.im * vn[i].re;
    if (Math.hypot(re - lr, im - li) > 1e-7 * (1 + cabs(l)) * scale) return false;
  }
  return true;
}

function extTermCount(list: Ext[]): number {
  return list.reduce((sum, x) => sum + x.a.length + x.b.length, 0);
}

interface QuadEigenEntry {
  lam: Ext;
  vec: Ext[];
}

function quadEigenResult(ctx: QuadCtx, entries: QuadEigenEntry[], complex: boolean, mode: Mode, steps: SolutionStep[]): OperationResult {
  checkTerms([entries.map((e) => e.lam.a), entries.map((e) => e.lam.b)]);
  if (extTermCount(entries.flatMap((e) => e.vec)) > MAX_RESULT_TERMS * 3) noSym();
  const lamN = entries.map((e) => extToNumber(ctx, e.lam));
  const vecN = entries.map((e) => e.vec.map((x) => extToNumber(ctx, x)));
  return {
    success: true,
    eigenResult: {
      eigenvalues: lamN.map((z) => z.re),
      eigenvectors: vecN.map((v) => v.map((z) => z.re)),
      ...(complex
        ? { eigenvaluesIm: lamN.map((z) => z.im), eigenvectorsIm: vecN.map((v) => v.map((z) => z.im)) }
        : {}),
      radicalExpressions: entries.map((e) => extToString(ctx, e.lam, mode)),
      eigenvectorRadicals: entries.map((e) => e.vec.map((x) => extToString(ctx, x, mode))),
    },
    steps,
  };
}

function quadNote(ctx: QuadCtx, complex: boolean, exactSqrt: boolean, lang: LanguageCode): string {
  if (complex && exactSqrt) {
    return T(lang, 'Δ < 0 olduğundan özdeğerler karmaşık eşlenik çifttir: λ = (İz ± i·√(−Δ)) / 2.', 'Since Δ < 0 the eigenvalues are a complex conjugate pair: λ = (trace ± i·√(−Δ)) / 2.');
  }
  if (complex) {
    return T(
      lang,
      'Δ < 0 olduğundan özdeğerler karmaşık eşlenik çifttir. √(−Δ) daha sade bir biçime indirgenemediği için ifade olduğu gibi bırakıldı.',
      'Since Δ < 0 the eigenvalues are a complex conjugate pair. √(−Δ) cannot be simplified further, so the expression is kept as is.'
    );
  }
  return T(
    lang,
    'Δ\'nın karekökü daha sade bir biçime indirgenemediği için √Δ ifade olarak bırakıldı: λ = (İz ± √Δ) / 2.',
    'The square root of Δ cannot be simplified further, so √Δ is kept as an expression: λ = (trace ± √Δ) / 2.'
  );
}

/**
 * 2x2 (üçgen olmayan): karmaşık eşlenik özdeğerler (Δ < 0) ya da karekökü
 * sadeleşmeyen gerçel özdeğerler (Δ > 0). sqNegDisc = √(−Δ) (varsa, karmaşık durumda).
 */
function quadEigen2x2(
  A: SymMatrix,
  tr: SymNum,
  disc: SymNum,
  sqNegDisc: SymNum | null,
  steps: SolutionStep[],
  lang: LanguageCode,
  mode: Mode
): OperationResult | null {
  const complex = symToNumber(disc) < 0;
  const half = symFromRational(1, 2);
  const trHalf = symDiv(tr, symFromRational(2));
  if (trHalf === null) return null;

  let ctx: QuadCtx;
  let lam1: Ext;
  if (complex && sqNegDisc !== null) {
    ctx = { M: symFromRational(-1), kind: 'i' };
    lam1 = ext(trHalf, symMul(sqNegDisc, half));
  } else {
    ctx = { M: disc, kind: complex ? 'isqrt' : 'sqrt' };
    lam1 = ext(trHalf, half);
  }
  const lam2 = extConj(lam1);

  const shifted = (lam: Ext): Ext[][] => [
    [extSub(ext(A[0][0]), lam), ext(A[0][1])],
    [ext(A[1][0]), extSub(ext(A[1][1]), lam)],
  ];
  const v1 = extNullVector2(ctx, shifted(lam1));
  if (v1 === null || !extResidualOk(A, ctx, lam1, v1)) return null;
  const v2 = v1.map(extConj);

  const f = (x: Ext) => extToString(ctx, x, mode);
  steps.push({
    title: T(lang, 'Özdeğerler', 'Eigenvalues'),
    description: `${quadNote(ctx, complex, ctx.kind === 'i', lang)}\nλ₁ = ${f(lam1)}, λ₂ = ${f(lam2)}`,
  });
  steps.push({
    title: T(lang, 'Özvektörler', 'Eigenvectors'),
    description: T(
      lang,
      `λ₁ için v₁ = [${v1.map(f).join(', ')}]\nλ₂ için v₂ = [${v2.map(f).join(', ')}] (v₁'in eşleniği)`,
      `For λ₁, v₁ = [${v1.map(f).join(', ')}]\nFor λ₂, v₂ = [${v2.map(f).join(', ')}] (conjugate of v₁)`
    ),
  });
  return quadEigenResult(ctx, [{ lam: lam1, vec: v1 }, { lam: lam2, vec: v2 }], complex, mode, steps);
}

// Özdeğerler iki yoldan biriyle KESİN (tam sembolik) bulunur:
//   (a) Matris üçgense: özdeğerler köşegen elemanlarıdır.
//   (b) Genel matris: karakteristik polinom p(λ) = λ³ − t·λ² + c₂·λ − d
//       SymNum katsayılıdır. Sayısal köklerden ve köşegen elemanlarından
//       ADAY üretilir (rasyonel, q·s, q₁ + q₂·s; s ∈ {√r, π, π√r}) ve p(aday)
//       KESİN aritmetikle (SymNum kanonik biçimi sayesinde sıfır testi kesindir)
//       doğrulanır. Bir kök bulununca polinom tam olarak bölünür
//       (p = (λ − λ₁)(λ² + uλ + w)) ve kalan ikinci derece denklem symSqrt
//       ile çözülür. Doğrulanmış aday yoksa (ör. indirgenemez kübik —
//       "casus irreducibilis": üç gerçel kök varken gerçel köklerle ifade
//       MÜMKÜN DEĞİL) null döner ⇒ ondalık motor.
// Özvektörler BÖLMESİZ hesaplanır: rank 2 ise (A−λI)'nın iki satırının
// vektörel çarpımı, rank 1 ise satırın tanımladığı düzlemin tabanı, rank 0
// ise birim vektörler. Bu, tekrarlı özdeğerlerde özuzay boyutunu (1 mi 2 mi)
// KESİN verir ve π−√2 gibi çok terimli payda gerektiren durumlardan kaçınır.

/**
 * Üçgen bir (n×n) kaydırılmış matrisin ((A−λI), diagonal[k]=0 olacak
 * şekilde) null uzayından TEK bir taban vektörü çıkarır - bölme
 * GEREKİR (2x2'nin aksine), bu yüzden symDiv temsil edemezse null döner.
 * isUpper=true ⇒ üst üçgen (i<j dışındaki alt taraf sıfır): v[j>k]=0,
 * v[k]=1, sonra i=k-1..0 için geriye doğru yerine koyma.
 * isUpper=false ⇒ alt üçgen: v[j<k]=0, v[k]=1, sonra i=k+1..n-1 için
 * ileriye doğru yerine koyma.
 */
function triangularNullVector(shifted: SymMatrix, isUpper: boolean, k: number): SymNum[] | null {
  const n = shifted.length;
  const v: SymNum[] = new Array(n);
  v[k] = SYM_ONE;
  if (isUpper) {
    for (let j = 0; j < n; j++) if (j > k) v[j] = SYM_ZERO;
    for (let i = k - 1; i >= 0; i--) {
      let sum: SymNum = SYM_ZERO;
      for (let j = i + 1; j <= k; j++) sum = symAdd(sum, symMul(shifted[i][j], v[j]));
      const vi = symDiv(symNeg(sum), shifted[i][i]);
      if (vi === null) return null;
      v[i] = vi;
    }
  } else {
    for (let j = 0; j < n; j++) if (j < k) v[j] = SYM_ZERO;
    for (let i = k + 1; i < n; i++) {
      let sum: SymNum = SYM_ZERO;
      for (let j = k; j < i; j++) sum = symAdd(sum, symMul(shifted[i][j], v[j]));
      const vi = symDiv(symNeg(sum), shifted[i][i]);
      if (vi === null) return null;
      v[i] = vi;
    }
  }
  return v;
}

const symLenOf = (v: SymNum[]) => v.reduce((sum, x) => sum + symToString(x, 'fraction').length, 0);
const termCountOf = (v: SymNum[]) => v.reduce((sum, x) => sum + x.length, 0);
const isRationalSym = (x: SymNum) => x.length === 0 || (x.length === 1 && x[0].p === 0 && x[0].r === 1);

function gcdInt(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

/** Sürekli kesirle x ≈ n/d (d ≤ maxDen, |x − n/d| ≤ tol) ise [n, d], değilse null. */
function approxRational(x: number, maxDen = 360, tol = 1e-9): [number, number] | null {
  if (!Number.isFinite(x) || Math.abs(x) > 1e6) return null;
  const sign = x < 0 ? -1 : 1;
  const v = Math.abs(x);
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0;
  let b = v;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) return null;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(v - h1 / k1) <= tol) return [sign * h1, k1];
    const frac = b - a;
    if (frac < 1e-13) return null;
    b = 1 / frac;
  }
  return null;
}

function primeFactors(n: number): number[] {
  const out: number[] = [];
  let rem = n;
  for (let i = 2; i * i <= rem; i++) {
    if (rem % i === 0) {
      out.push(i);
      while (rem % i === 0) rem /= i;
    }
  }
  if (rem > 1) out.push(rem);
  return out;
}

/**
 * Matrisin içinde geçen kök/π yapılarından aday "baz" elemanları: √r (r, matristeki
 * radikandlardan ve asal çarpanlarının alt-çarpımlarından), π ve π√r.
 * Böylece q·s ve q₁ + q₂·s biçimindeki kökler aranabilir.
 */
function candidateBasis(A: SymMatrix): SymNum[] {
  const primes = new Set<number>();
  let hasPi = false;
  for (const row of A) {
    for (const v of row) {
      for (const t of v) {
        if (t.p !== 0) hasPi = true;
        if (t.r > 1) primeFactors(t.r).forEach((q) => primes.add(q));
      }
    }
  }
  const plist = Array.from(primes).sort((x, y) => x - y).slice(0, 4); // en çok 15 alt çarpım (en kötü durum süresini sınırlar)
  const radicands: number[] = [];
  for (let mask = 1; mask < 1 << plist.length; mask++) {
    let r = 1;
    for (let k = 0; k < plist.length; k++) if (mask & (1 << k)) r *= plist[k];
    radicands.push(r);
  }
  const out: SymNum[] = [];
  const add = (txt: string) => {
    const v = parseSymbolicInput(txt);
    if (v) out.push(v);
  };
  for (const r of radicands) add(`√${r}`);
  if (hasPi) {
    add('pi');
    for (const r of radicands) add(`pi√${r}`);
  }
  return out;
}

interface CubicSolution {
  lambdas: SymNum[]; // gerçel/SymNum durumda azalan sırada 3 özdeğer; `quad` varsa yalnızca [kök]
  /** Kalan ikinci derece denklemin kökleri SymNum olamıyorsa (karmaşık ya da opak √Δ): genişleme bağlamı ve çift. */
  quad?: { ctx: QuadCtx; pair: [Ext, Ext]; complex: boolean; exactSqrt: boolean };
  t: SymNum;
  c2: SymNum;
  d: SymNum;
  root: SymNum;
  u: SymNum;
  w: SymNum;
  disc: SymNum;
  quadRoots: [SymNum, SymNum];
}

function solveCubicExact(A: SymMatrix): CubicSolution | null {
  const a = A;
  const t = symAdd(symAdd(a[0][0], a[1][1]), a[2][2]);
  const m = (i: number, j: number, k: number, l: number) => symSub(symMul(a[i][j], a[k][l]), symMul(a[i][l], a[k][j]));
  const c2 = symAdd(symAdd(m(0, 0, 1, 1), m(0, 0, 2, 2)), m(1, 1, 2, 2));
  const d = symAdd(
    symSub(symMul(a[0][0], m(1, 1, 2, 2)), symMul(a[0][1], symSub(symMul(a[1][0], a[2][2]), symMul(a[1][2], a[2][0])))),
    symMul(a[0][2], symSub(symMul(a[1][0], a[2][1]), symMul(a[1][1], a[2][0])))
  );
  checkTerms([[t, c2, d]]);

  // p(λ) = ((λ − t)·λ + c₂)·λ − d  (Horner, KESİN)
  const peval = (x: SymNum): SymNum => symSub(symMul(symAdd(symMul(symSub(x, t), x), c2), x), d);
  const isRoot = (x: SymNum): boolean => {
    try {
      return symIsZero(peval(x));
    } catch {
      return false; // taşma: bu adayı atla
    }
  };

  let root: SymNum | null = null;

  // 1) Köşegen elemanları (ayrık bloklu matrislerde özdeğerdir).
  for (let i = 0; i < 3 && !root; i++) if (isRoot(a[i][i])) root = a[i][i];

  // 2) Sayısal köklerden aday üret, KESİN doğrula.
  if (!root) {
    const numeric = realRootsCubic(-symToNumber(t), symToNumber(c2), -symToNumber(d));
    const basis = candidateBasis(A);
    const basisNum = basis.map(symToNumber);
    const DENS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12];
    // Ucuz biçimden pahalıya: (a) rasyonel, (b) q·s, (c) q₁ + q₂·s. Her aşama
    // TÜM sayısal kökler için denenir, böylece basit kök varsa hızla bulunur.
    for (const x of numeric) {
      const q0 = approxRational(x);
      if (!q0) continue;
      const cand = symFromRational(q0[0], q0[1]);
      if (isRoot(cand)) { root = cand; break; }
    }
    for (const x of numeric) {
      if (root) break;
      for (let k = 0; k < basis.length && !root; k++) {
        const q = approxRational(x / basisNum[k]);
        if (!q || q[0] === 0) continue;
        const cand = symMul(symFromRational(q[0], q[1]), basis[k]);
        if (isRoot(cand)) root = cand;
      }
    }
    for (const x of numeric) {
      if (root) break;
      for (let k = 0; k < basis.length && !root; k++) {
        for (const den of DENS) {
          for (let num = -48; num <= 48 && !root; num++) {
            if (num === 0 || gcdInt(num, den) !== 1) continue;
            const q1 = approxRational(x - (num / den) * basisNum[k], 360, 1e-10);
            if (!q1) continue;
            const cand = symAdd(symFromRational(q1[0], q1[1]), symMul(symFromRational(num, den), basis[k]));
            if (isRoot(cand)) root = cand;
          }
          if (root) break;
        }
      }
    }
  }
  if (!root) return null;

  // Tam bölme: p(λ) = (λ − r)(λ² + u·λ + w)
  const u = symSub(root, t);
  const w = symAdd(c2, symMul(root, u));
  if (!symIsZero(symSub(d, symMul(root, w)))) return null; // (savunma) r kök ⇒ d = r·w

  const disc = symSub(symMul(u, u), symMul(symFromRational(4), w));
  const discNeg = !symIsZero(disc) && symToNumber(disc) < 0;
  let l2: SymNum | null;
  let l3: SymNum | null;
  if (symIsZero(disc)) {
    l2 = l3 = symDiv(symNeg(u), symFromRational(2));
  } else {
    const sq = symSqrt(discNeg ? symNeg(disc) : disc);
    if (sq === null || discNeg) {
      // Kalan ikinci derece denklemin kökleri SymNum olarak temsil edilemiyor:
      // karmaşık (Δ < 0) ya da karekökü sadeleşmeyen (opak √Δ). Bunlar
      // ikinci derece genişleme (quadExt.ts) ile taşınır.
      const negHalfU = symDiv(symNeg(u), symFromRational(2));
      if (negHalfU === null) return null;
      let ctx: QuadCtx;
      let lam: Ext;
      if (discNeg && sq !== null) {
        ctx = { M: symFromRational(-1), kind: 'i' };
        lam = ext(negHalfU, symMul(sq, symFromRational(1, 2)));
      } else {
        ctx = { M: disc, kind: discNeg ? 'isqrt' : 'sqrt' };
        lam = ext(negHalfU, symFromRational(1, 2));
      }
      if (!isRoot(root)) return null;
      return { lambdas: [root], t, c2, d, root, u, w, disc, quadRoots: [negHalfU, negHalfU], quad: { ctx, pair: [lam, extConj(lam)], complex: discNeg, exactSqrt: sq !== null } };
    }
    l2 = symDiv(symSub(sq, u), symFromRational(2));
    l3 = symDiv(symNeg(symAdd(sq, u)), symFromRational(2));
  }
  if (l2 === null || l3 === null) return null;

  const lambdas = [root, l2, l3];
  for (const l of lambdas) if (!isRoot(l)) return null; // son güvenlik: her kök KESİN doğrulanır
  lambdas.sort((x, y) => symToNumber(y) - symToNumber(x));
  checkTerms([lambdas]);
  return { lambdas, t, c2, d, root, u, w, disc, quadRoots: [l2, l3] };
}

function crossSym(u: SymNum[], v: SymNum[]): SymNum[] {
  const c = (a: SymNum, b: SymNum, e: SymNum, f: SymNum) => symSub(symMul(a, b), symMul(e, f));
  return [c(u[1], v[2], u[2], v[1]), c(u[2], v[0], u[0], v[2]), c(u[0], v[1], u[1], v[0])];
}

/**
 * Bir özvektörü sadeleştirir (yönü değişmez): hepsi rasyonelse ilkel tam sayı
 * vektörü (ilk sıfırdan farklı bileşen pozitif); değilse, ilk sıfırdan farklı
 * bileşene bölmek (bölme temsil ediliyorsa) daha kısa sonuç veriyorsa onu seçer.
 */
function simplifyVector(v: SymNum[]): SymNum[] {
  const nz = v.findIndex((x) => !symIsZero(x));
  if (nz < 0) return v;
  if (v.every(isRationalSym)) {
    // İlkel tam sayı vektörü (bigint dahil): OKEK ile çarp, OBEB'e böl.
    const dens = v.map((x) => (x.length ? x[0].c.d : 1));
    let L: I = 1;
    for (const dn of dens) L = iMul(iDivExact(L, iGcd(L, dn)), dn);
    const ints = v.map((x, i) => (x.length ? iMul(x[0].c.n, iDivExact(L, dens[i])) : 0));
    let G: I = 0;
    for (const n of ints) G = G === 0 ? iAbs(n) : iGcd(G, n);
    if (G === 0) G = 1;
    const sgn = ints[nz] < 0 ? -1 : 1;
    return ints.map((n) => symFromRational(iDivExact(sgn < 0 ? iNeg(n) : n, G)));
  }
  // Tek sıfırdan farklı bileşen ⇒ yön birim vektördür (çok terimli olsa da).
  if (v.filter((x) => !symIsZero(x)).length === 1) {
    return v.map((x, i) => (i === nz ? SYM_ONE : SYM_ZERO));
  }
  // Bölen adayları: ilk sıfırdan farklı bileşen ve her TEK TERİMLİ bileşen
  // (tek terimliye bölme her zaman temsil edilir). En kısa sonuç seçilir.
  let best = v;
  const divisors = v.filter((x) => !symIsZero(x) && (x.length === 1 || x === v[nz]));
  for (const div of divisors) {
    try {
      const scaled = v.map((x) => symDiv(x, div));
      if (!scaled.every((x) => x !== null)) continue;
      const cand = scaled as SymNum[];
      if (termCountOf(cand) <= MAX_RESULT_TERMS * 3 && symLenOf(cand) < symLenOf(best)) best = cand;
    } catch {
      /* taşma: bu bölen atlanır */
    }
  }
  const lead = best.find((x) => !symIsZero(x))!;
  return symToNumber(lead) < 0 ? best.map(symNeg) : best;
}

/**
 * (A − λI)'nın null uzayının tabanı (3x3, λ özdeğer olduğundan det = 0), BÖLMESİZ:
 *   rank 2 → iki satırın vektörel çarpımı (tek vektör),
 *   rank 1 → satırın tanımladığı düzlemin iki vektörlü tabanı,
 *   rank 0 → e₁, e₂, e₃.
 * Sonuç (A−λI)·v = 0 olarak KESİN doğrulanır; tutmazsa null.
 */
function nullBasis3(shifted: SymMatrix): SymNum[][] | null {
  const rowZero = (r: SymNum[]) => r.every(symIsZero);
  const unit = (k: number): SymNum[] => [0, 1, 2].map((i) => (i === k ? SYM_ONE : SYM_ZERO));
  let basis: SymNum[][] | null = null;

  // Tek sıfırdan farklı girişi olan satır, o bileşeni sıfıra sabitler (v_k = 0);
  // bölme gerekmez ve çok terimli ortak çarpanların (π−3 gibi) vektöre
  // bulaşmasını önler. Sabitlenenler elenip kalan serbest bileşenlerde çözülür.
  const pinned = new Set<number>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const row of shifted) {
      const free = [0, 1, 2].filter((k) => !pinned.has(k) && !symIsZero(row[k]));
      if (free.length === 1) {
        pinned.add(free[0]);
        changed = true;
      }
    }
  }
  const F = [0, 1, 2].filter((k) => !pinned.has(k));

  if (F.length === 0) return null; // özdeğer olduğundan olmamalı (savunma)
  if (F.length === 1) {
    basis = [unit(F[0])];
  } else if (F.length === 2) {
    const rows2 = shifted.map((row) => [row[F[0]], row[F[1]]]).filter((r) => !r.every(symIsZero));
    if (rows2.length === 0) {
      basis = [unit(F[0]), unit(F[1])];
    } else {
      rows2.sort((x, y) => termCountOf(x) - termCountOf(y));
      const [ra, rb] = rows2[0]; // ikisi de ≠ 0 (aksi halde sabitlenmiş olurdu)
      const wv: SymNum[] = [SYM_ZERO, SYM_ZERO, SYM_ZERO];
      wv[F[0]] = symNeg(rb);
      wv[F[1]] = ra;
      basis = [simplifyVector(wv)];
    }
  } else if (shifted.every(rowZero)) {
    basis = [unit(0), unit(1), unit(2)];
  } else {
    const crosses = ([[0, 1], [0, 2], [1, 2]] as const)
      .map(([i, j]) => crossSym(shifted[i], shifted[j]))
      .filter((c) => !rowZero(c));
    if (crosses.length > 0) {
      crosses.sort((x, y) => termCountOf(x) - termCountOf(y));
      basis = [simplifyVector(crosses[0])];
    } else {
      const r = shifted.find((row) => !rowZero(row))!;
      const k = r.findIndex((x) => !symIsZero(x));
      basis = [];
      for (let j = 0; j < 3; j++) {
        if (j === k) continue;
        const wv: SymNum[] = [SYM_ZERO, SYM_ZERO, SYM_ZERO];
        if (symIsZero(r[j])) {
          wv[j] = SYM_ONE;
        } else {
          wv[j] = r[k];
          wv[k] = symNeg(r[j]);
        }
        basis.push(simplifyVector(wv));
      }
    }
  }
  for (const v of basis) {
    for (const row of shifted) {
      const dot = symAdd(symAdd(symMul(row[0], v[0]), symMul(row[1], v[1])), symMul(row[2], v[2]));
      if (!symIsZero(dot)) return null;
    }
  }
  return basis;
}

/**
 * 3x3: bir gerçel kök tam bulundu, kalan ikinci derece denklemin kökleri SymNum
 * olarak temsil edilemiyor (karmaşık çift ya da opak √Δ). Gerçel kökün özvektörü
 * bölmesiz (nullBasis3), çiftin özvektörü Ext aritmetiğiyle (vektörel çarpım)
 * hesaplanır; ikinci özvektör ilkinin Galois eşleniğidir.
 */
function quadEigen3x3(
  A: SymMatrix,
  sol: CubicSolution,
  quad: NonNullable<CubicSolution['quad']>,
  steps: SolutionStep[],
  lang: LanguageCode,
  mode: Mode
): OperationResult | null {
  const { ctx, pair, complex, exactSqrt } = quad;
  const f = (x: Ext) => extToString(ctx, x, mode);

  const rootBasis = nullBasis3(A.map((row, i) => row.map((val, j) => (i === j ? symSub(val, sol.root) : val))));
  if (rootBasis === null || rootBasis.length !== 1) return null;
  const rootLam = ext(sol.root);
  const rootVec = rootBasis[0].map((x) => ext(x));

  const shifted: Ext[][] = A.map((row, i) => row.map((val, j) => (i === j ? extSub(ext(val), pair[0]) : ext(val))));
  const v = extNullVector3(ctx, shifted);
  if (v === null) return null;

  let entries: QuadEigenEntry[] = [
    { lam: rootLam, vec: rootVec },
    { lam: pair[0], vec: v },
    { lam: pair[1], vec: v.map(extConj) },
  ];
  for (const e of entries) if (!extResidualOk(A, ctx, e.lam, e.vec)) return null;
  if (!complex) {
    entries = entries.sort((x, y) => extToNumber(ctx, y.lam).re - extToNumber(ctx, x.lam).re);
  }

  steps.push({
    title: T(lang, 'Özdeğerler', 'Eigenvalues'),
    description: `${quadNote(ctx, complex, exactSqrt, lang)}\n${entries.map((e, i) => `λ${i + 1} = ${f(e.lam)}`).join(', ')}`,
  });
  steps.push({
    title: T(lang, 'Özvektörler', 'Eigenvectors'),
    description: entries
      .map((e, i) =>
        T(lang, `λ${i + 1} için v${i + 1} = [${e.vec.map(f).join(', ')}]`, `For λ${i + 1}, v${i + 1} = [${e.vec.map(f).join(', ')}]`)
      )
      .join('\n'),
  });
  return quadEigenResult(ctx, entries, complex, mode, steps);
}

function computeEigen3x3(matrixA: MatrixData, inputs: SymbolicInputs, lang: LanguageCode, mode: Mode): OperationResult | null {
  if (matrixA[0]?.length !== 3) return null;
  const A = parseMatrix(inputs.A, matrixA);
  if (!A) return null;
  // Saf rasyonel 3x3'te GERÇEL özdeğerler için ondalık motor aynı kalır; yalnızca
  // KARMAŞIK özdeğerli durum (aşağıda sol.quad) burada tam gösterilir.
  const rationalInput = !anyIrrational(A);

  const f = (v: SymNum) => symToString(v, mode);
  const fp = (v: SymNum) => (v.length > 1 ? `(${f(v)})` : f(v));

  const isUpper = symIsZero(A[1][0]) && symIsZero(A[2][0]) && symIsZero(A[2][1]);
  const isLower = symIsZero(A[0][1]) && symIsZero(A[0][2]) && symIsZero(A[1][2]);
  const triangular = isUpper || isLower;
  if (triangular && rationalInput) return null;

  const steps: SolutionStep[] = [
    {
      title: T(lang, 'Matris (Sembolik)', 'Matrix (Symbolic)'),
      description: T(
        lang,
        'Girişler π ve/veya √ içerdiğinden özdeğerler ondalığa çevrilmeden tam sembolik hesaplanır.',
        'Since the entries contain π and/or √, the eigenvalues are computed fully symbolically (never converted to decimal).'
      ),
      ...snapshot(A, mode),
    },
  ];

  let lambdas: SymNum[];
  if (triangular) {
    lambdas = [A[0][0], A[1][1], A[2][2]];
    checkTerms([lambdas]);
    steps.push({
      title: T(lang, 'Üçgen Matris', 'Triangular Matrix'),
      description: T(
        lang,
        `Matris üçgen olduğundan özdeğerler doğrudan köşegen elemanlarıdır: λ₁ = ${f(lambdas[0])}, λ₂ = ${f(lambdas[1])}, λ₃ = ${f(lambdas[2])}`,
        `Since the matrix is triangular, the eigenvalues are simply the diagonal entries: λ₁ = ${f(lambdas[0])}, λ₂ = ${f(lambdas[1])}, λ₃ = ${f(lambdas[2])}`
      ),
    });
  } else {
    const sol = solveCubicExact(A);
    if (!sol) return null; // kök bulunamadı / temsil edilemiyor: kübik ⇒ ondalık motor
    if (rationalInput && !sol.quad) return null; // rasyonel + gerçel özdeğerler: ondalık/köklü motor
    lambdas = sol.lambdas;
    const poly = `λ³ − ${fp(sol.t)}λ² + ${fp(sol.c2)}λ − ${fp(sol.d)} = 0`;
    steps.push({
      title: T(lang, 'Karakteristik Polinom', 'Characteristic Polynomial'),
      description: T(
        lang,
        `İz(A) = ${f(sol.t)}, (asal minörler toplamı) = ${f(sol.c2)}, det(A) = ${f(sol.d)}\np(λ) = ${poly}`,
        `trace(A) = ${f(sol.t)}, (sum of principal minors) = ${f(sol.c2)}, det(A) = ${f(sol.d)}\np(λ) = ${poly}`
      ),
    });
    steps.push({
      title: T(lang, 'Kök ve Bölme', 'Root and Division'),
      description: T(
        lang,
        `λ = ${f(sol.root)} değeri p(λ) = 0'ı KESİN sağlar. Polinom bölünür:\np(λ) = (λ − ${fp(sol.root)})(λ² + ${fp(sol.u)}λ + ${fp(sol.w)})\nΔ = ${f(sol.disc)}`,
        `λ = ${f(sol.root)} satisfies p(λ) = 0 exactly. Dividing the polynomial:\np(λ) = (λ − ${fp(sol.root)})(λ² + ${fp(sol.u)}λ + ${fp(sol.w)})\nΔ = ${f(sol.disc)}`
      ),
    });
    if (sol.quad) return quadEigen3x3(A, sol, sol.quad, steps, lang, mode);
    steps.push({
      title: T(lang, 'Özdeğerler', 'Eigenvalues'),
      description: `λ₁ = ${f(lambdas[0])}, λ₂ = ${f(lambdas[1])}, λ₃ = ${f(lambdas[2])}`,
    });
  }

  const groups: { value: SymNum; idxs: number[] }[] = [];
  lambdas.forEach((l, i) => {
    const g = groups.find((gr) => symIsZero(symSub(gr.value, l)));
    if (g) g.idxs.push(i);
    else groups.push({ value: l, idxs: [i] });
  });

  const vectors: SymNum[][] = new Array(3);
  const notes: string[] = [];
  for (const g of groups) {
    const shifted: SymMatrix = A.map((row, i) => row.map((val, j) => (i === j ? symSub(val, g.value) : val)));
    let done = false;
    if (triangular && groups.length === 3) {
      // Ayrık özdeğerli üçgen matris: geriye/ileriye yerine koyma (ilk bileşen 1).
      const k = g.idxs[0];
      const vec = triangularNullVector(shifted, isUpper, k);
      if (vec !== null) {
        vectors[k] = vec;
        done = true;
      }
    }
    if (done) continue;
    const basis = nullBasis3(shifted);
    if (basis === null || basis.length > g.idxs.length) return null; // (savunma) tutarsız
    g.idxs.forEach((idx, occ) => {
      vectors[idx] = basis[Math.min(occ, basis.length - 1)];
    });
    if (g.idxs.length > 1) {
      const dim = basis.length;
      notes.push(
        dim === g.idxs.length
          ? T(lang, `λ = ${f(g.value)}: cebirsel katlılık ${g.idxs.length}, özuzay ${dim} boyutlu (bağımsız ${dim} özvektör).`, `λ = ${f(g.value)}: algebraic multiplicity ${g.idxs.length}, eigenspace dimension ${dim} (${dim} independent eigenvectors).`)
          : T(lang, `λ = ${f(g.value)}: cebirsel katlılık ${g.idxs.length}, ama özuzay yalnızca ${dim} boyutlu ⇒ matris köşegenleştirilemez (aynı özvektör tekrar gösterilir).`, `λ = ${f(g.value)}: algebraic multiplicity ${g.idxs.length}, but the eigenspace has dimension ${dim} only ⇒ the matrix is not diagonalizable (the same eigenvector is repeated).`)
      );
    }
  }
  checkTerms(vectors);

  const vecLines = vectors.map((v, i) =>
    T(lang, `λ${i + 1} = ${f(lambdas[i])} için v${i + 1} = [${v.map(f).join(', ')}]`, `For λ${i + 1} = ${f(lambdas[i])}, v${i + 1} = [${v.map(f).join(', ')}]`)
  );
  steps.push({
    title: T(lang, 'Özvektörler', 'Eigenvectors'),
    description: [...vecLines, ...notes].join('\n'),
  });

  return {
    success: true,
    eigenResult: {
      eigenvalues: lambdas.map(symToNumber),
      eigenvectors: vectors.map((v) => v.map(symToNumber)),
      radicalExpressions: lambdas.map(f),
      eigenvectorRadicals: vectors.map((v) => v.map(f)),
    },
    steps,
  };
}
