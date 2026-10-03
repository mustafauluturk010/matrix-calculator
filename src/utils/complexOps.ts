// Complex number mode: all operations. Used when cells contain entries like `3+2i`, `i` or
// `(1+i)/√2` (Settings -> Complex number mode). The algorithms are written over a generic
// Field<T> and instantiated twice:
//   1) exact complex (re + im·i; re/im: π, √, bigint rational), tried first;
//   2) numeric complex (double precision), a fallback when exact tracking fails (multi-term
//      divisor mixing π and roots, term explosion).
// Returns null when the input has no `i`, so the existing real engines run unchanged.
// Supported: add, subtract, scalar multiply, multiply, transpose, trace, determinant, inverse,
// rank, RREF, Gauss, LU, power, equation solving (Gauss/Cramer), eigenvalues/eigenvectors
// (see eigenGeneral.ts).

import { buildLuSteps } from './luSteps';
import { LanguageCode, MatrixData, OperationResult, OperationType, SolutionStep } from '@/types';
import { strings } from './matrixStepText';
import { Field, Mode, CxSym, exactField, numericField, resetExactBudget, bail } from './complexField';
import { parseComplexInput, parseComplexNumber, hasImaginaryUnit, SymOverflowError } from './symbolic';
import type { SymbolicInputs } from './symbolicOps';
import type { C } from './complexEigen';
import { eigenGeneral } from './eigenGeneral';

type Mat<T> = T[][];

export interface CxCtx<T> {
  /** true: GERÇEL sayılar (SymFrac cismi) - adım metinleri "karmaşık" demez. */
  real?: boolean;
  /** Sonuç hücresi bu boyutu (F.size) aşarsa okunamaz sayılır ⇒ takip bırakılır (bail). */
  maxResultSize?: number;
  F: Field<T>;
  lang: LanguageCode;
  mode: Mode;
  S: ReturnType<typeof strings>;
}

const T2 = (lang: LanguageCode, tr: string, en: string) => (lang === 'en' ? en : tr);

const isBail = (e: unknown): boolean =>
  (!!e && (e as { noSymbolic?: boolean }).noSymbolic === true) || e instanceof SymOverflowError || (e as Error)?.name === 'SymOverflowError';

class InputError extends Error {}

// ---------- genel yardımcılar ----------

export const lab = <T,>(c: CxCtx<T>, x: T): string => c.F.fmt(x, c.mode);

export function snap<T>(c: CxCtx<T>, m: Mat<T>) {
  return { matrixSnapshot: m.map((r) => r.map((x) => c.F.re(x))), matrixSnapshotLabels: m.map((r) => r.map((x) => lab(c, x))) };
}

function fail(message: string, steps: SolutionStep[] = []): OperationResult {
  return { success: false, errorMessage: message, steps };
}

/** Okunabilirlik: sonuç hücreleri maxResultSize'ı aşıyorsa kesin takibi bırak. */
function readable<T>(c: CxCtx<T>, cells: T[]): void {
  if (c.maxResultSize === undefined) return;
  for (const x of cells) if (c.F.size(x) > c.maxResultSize) bail();
}

export function matrixResult<T>(c: CxCtx<T>, m: Mat<T>, steps: SolutionStep[]): OperationResult {
  readable(c, m.flat());
  return {
    success: true,
    matrixResult: m.map((r) => r.map((x) => c.F.re(x))),
    matrixResultLabels: m.map((r) => r.map((x) => lab(c, x))),
    steps,
  };
}

const identity = <T,>(F: Field<T>, n: number): Mat<T> =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? F.one : F.zero)));

export function matMul<T>(F: Field<T>, A: Mat<T>, B: Mat<T>): Mat<T> {
  return A.map((row) =>
    B[0].map((_, j) => row.reduce((acc, a, k) => F.add(acc, F.mul(a, B[k][j])), F.zero))
  );
}

/** Pivot: sıfır olmayan adaylardan (kesin: en kısa ve TERS ALINABİLİR; sayısal: en büyük |x|). */
function pickPivot<T>(F: Field<T>, m: Mat<T>, from: number, col: number): number {
  const cands: { r: number; key: number }[] = [];
  for (let r = from; r < m.length; r++) {
    const x = m[r][col];
    if (F.isZero(x)) continue;
    cands.push({ r, key: F.exact ? F.size(x) : -Math.hypot(F.re(x), F.im(x)) });
  }
  cands.sort((a, b) => a.key - b.key || a.r - b.r);
  for (const { r } of cands) if (F.div(F.one, m[r][col]) !== null) return r;
  if (cands.length > 0) throw Object.assign(new Error('ters alınamayan pivot'), { noSymbolic: true });
  return -1;
}

const need = <T,>(x: T | null): T => {
  if (x === null) throw Object.assign(new Error('bölme temsil edilemiyor'), { noSymbolic: true });
  return x;
};

// ---------- determinant ----------

function detElim<T>(F: Field<T>, m: Mat<T>): T {
  const A = m.map((r) => r.slice());
  const n = A.length;
  let det = F.one;
  for (let col = 0; col < n; col++) {
    const pr = pickPivot(F, A, col, col);
    if (pr < 0) return F.zero;
    if (pr !== col) {
      [A[pr], A[col]] = [A[col], A[pr]];
      det = F.neg(det);
    }
    det = F.mul(det, A[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (F.isZero(A[r][col])) continue;
      const f = need(F.div(A[r][col], A[col][col]));
      A[r] = A[r].map((x, j) => (j === col ? F.zero : F.sub(x, F.mul(f, A[col][j]))));
    }
  }
  return det;
}

const minor = <T,>(m: Mat<T>, i: number, j: number): Mat<T> => m.filter((_, r) => r !== i).map((row) => row.filter((_, c) => c !== j));

/**
 * Bölme gerektiren işlemlerde (ters, kuvvet, Cramer) determinant yalnızca "sıfır mı"
 * ve gösterim için gerekir: 4x4 ve üstünde eliminasyonla (çok terimli çarpım
 * patlaması olmadan; temsil edilemeyen pivotta hemen sayısala düşer).
 */
function detQuick<T>(F: Field<T>, m: Mat<T>): T {
  return m.length >= 4 ? detElim(F, m) : detOf(F, m);
}

export function detOf<T>(F: Field<T>, m: Mat<T>): T {
  const n = m.length;
  if (n === 1) return m[0][0];
  if (n === 2) return F.sub(F.mul(m[0][0], m[1][1]), F.mul(m[0][1], m[1][0]));
  if (n <= 4) {
    let acc = F.zero;
    for (let j = 0; j < n; j++) {
      const term = F.mul(m[0][j], detOf(F, minor(m, 0, j)));
      acc = j % 2 === 0 ? F.add(acc, term) : F.sub(acc, term);
    }
    return acc;
  }
  return detElim(F, m);
}

// ---------- eliminasyon (RREF / basamaklı form) ----------

interface ElimResult<T> {
  R: Mat<T>;
  pivots: number[];
  swaps: number;
}

export function eliminate<T>(
  c: CxCtx<T>,
  A0: Mat<T>,
  kind: 'rref' | 'echelon',
  pivotCols: number,
  log: SolutionStep[] | null
): ElimResult<T> {
  const { F, lang } = c;
  const R = A0.map((r) => r.slice());
  const rows = R.length;
  const pivots: number[] = [];
  let swaps = 0;
  let row = 0;
  const ab = (x: T) => lab(c, x);
  for (let col = 0; col < pivotCols && row < rows; col++) {
    const pr = pickPivot(F, R, row, col);
    if (pr < 0) {
      log?.push({
        title: T2(lang, `Sütun ${col + 1}: pivot yok`, `Column ${col + 1}: no pivot`),
        description: T2(lang, `Sütun ${col + 1}'de (bu satırdan itibaren) sıfırdan farklı eleman yok; sonraki sütuna geçiliyor.`, `No nonzero entry in column ${col + 1} (from this row down); moving to the next column.`),
      });
      continue;
    }
    if (pr !== row) {
      [R[pr], R[row]] = [R[row], R[pr]];
      swaps++;
      log?.push({
        title: T2(lang, 'Satır Değiştir', 'Swap Rows'),
        description: T2(lang, `R${row + 1} ↔ R${pr + 1}`, `R${row + 1} ↔ R${pr + 1}`),
        ...snap(c, R),
      });
    }
    if (kind === 'rref') {
      const piv = R[row][col];
      const inv = need(F.div(F.one, piv));
      const isOne = F.isZero(F.sub(piv, F.one));
      if (!isOne) {
        R[row] = R[row].map((x, j) => (j === col ? F.one : F.mul(x, inv)));
        log?.push({
          title: T2(lang, 'Pivotu 1 Yap', 'Normalize Pivot'),
          description: T2(lang, `R${row + 1} ← R${row + 1} / (${ab(piv)})`, `R${row + 1} ← R${row + 1} / (${ab(piv)})`),
          ...snap(c, R),
        });
      }
    }
    for (let r = kind === 'rref' ? 0 : row + 1; r < rows; r++) {
      if (r === row || F.isZero(R[r][col])) continue;
      const factor = kind === 'rref' ? R[r][col] : need(F.div(R[r][col], R[row][col]));
      const pivRow = R[row];
      R[r] = R[r].map((x, j) => (j === col ? F.zero : F.sub(x, F.mul(factor, pivRow[j]))));
      log?.push({
        title: T2(lang, 'Satır İşlemi', 'Row Operation'),
        description: `R${r + 1} ← R${r + 1} − (${ab(factor)})·R${row + 1}`,
        ...snap(c, R),
      });
    }
    pivots.push(col);
    row++;
  }
  return { R, pivots, swaps };
}

// ---------- işlemler ----------

function needSquare<T>(c: CxCtx<T>, A: Mat<T>, msg: string): OperationResult | null {
  return A.length === A[0].length ? null : fail(msg);
}

/** Bir sonucu kesin/sayısal cisimde hesaplayan ana dağıtıcı. */
export function runGeneric<T>(
  c: CxCtx<T>,
  type: OperationType,
  A: Mat<T>,
  B: Mat<T> | null,
  scalar: T | null,
  vecB: T[] | null,
  exponent: number,
  method: 'cramer' | 'gauss'
): OperationResult {
  const { F, lang, S } = c;
  const rows = A.length;
  const cols = A[0].length;
  const ab = (x: T) => lab(c, x);
  const start = (title: string, desc: string, m: Mat<T> = A): SolutionStep => ({ title, description: desc, ...snap(c, m) });

  switch (type) {
    case 'add':
    case 'subtract': {
      if (!B || B.length !== rows || B[0].length !== cols) return fail(type === 'add' ? S.addDimError() : S.subtractDimError());
      const sign = type === 'add' ? '+' : '−';
      const C_ = A.map((row, i) => row.map((x, j) => (type === 'add' ? F.add(x, B[i][j]) : F.sub(x, B[i][j]))));
      const lines = A.map((row, i) => row.map((x, j) => `C[${i + 1}][${j + 1}] = (${ab(x)}) ${sign} (${ab(B[i][j])}) = ${ab(C_[i][j])}`)).flat();
      return matrixResult(c, C_, [
        start(T2(lang, 'Matris A', 'Matrix A'), c.real ? '' : T2(lang, 'Karmaşık girişli A matrisi.', 'Matrix A with complex entries.')),
        start(T2(lang, 'Matris B', 'Matrix B'), c.real ? '' : T2(lang, 'Karmaşık girişli B matrisi.', 'Matrix B with complex entries.'), B),
        { title: T2(lang, 'Hücre Hesapları', 'Cell Calculations'), description: lines.join('\n') },
        start(T2(lang, 'Sonuç', 'Result'), c.real ? '' : type === 'add' ? T2(lang, 'Karmaşık sayılar bileşen bileşen toplandı (gerçel + gerçel, sanal + sanal).', 'Complex numbers were added componentwise (real + real, imaginary + imaginary).') : T2(lang, 'Karmaşık sayılar bileşen bileşen çıkarıldı.', 'Complex numbers were subtracted componentwise.'), C_),
      ]);
    }
    case 'scalarMultiply': {
      if (!scalar) return fail(S.invalidMatrixError());
      const C_ = A.map((row) => row.map((x) => F.mul(scalar, x)));
      const lines = A.map((row, i) => row.map((x, j) => `C[${i + 1}][${j + 1}] = (${ab(scalar)})·(${ab(x)}) = ${ab(C_[i][j])}`)).flat();
      return matrixResult(c, C_, [
        start(T2(lang, 'Matris A', 'Matrix A'), T2(lang, `Skaler k = ${ab(scalar)}`, `Scalar k = ${ab(scalar)}`)),
        { title: T2(lang, 'Hücre Hesapları', 'Cell Calculations'), description: lines.join('\n') + (c.real ? '' : '\n' + T2(lang, '(a+bi)(c+di) = (ac−bd) + (ad+bc)i', '(a+bi)(c+di) = (ac−bd) + (ad+bc)i')) },
        start(T2(lang, 'Sonuç', 'Result'), '', C_),
      ]);
    }
    case 'multiply': {
      if (!B || B.length !== cols) return fail(S.multiplyDimError(cols, B ? B.length : 0));
      const C_ = matMul(F, A, B);
      const lines: string[] = [];
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < B[0].length; j++)
          lines.push(`C[${i + 1}][${j + 1}] = ${A[i].map((x, k) => `(${ab(x)})(${ab(B[k][j])})`).join(' + ')} = ${ab(C_[i][j])}`);
      return matrixResult(c, C_, [
        { title: T2(lang, 'Boyut Kontrolü', 'Dimension Check'), description: S.multiplyDimCheckDesc(rows, cols, B.length, B[0].length) },
        { title: T2(lang, 'Hücre Hesapları', 'Cell Calculations'), description: lines.join('\n') },
        start(T2(lang, 'Sonuç Matrisi', 'Result Matrix'), '', C_),
      ]);
    }
    case 'transpose': {
      const C_ = A[0].map((_, j) => A.map((row) => row[j]));
      return matrixResult(c, C_, [start(T2(lang, 'Başlangıç', 'Start'), c.real ? T2(lang, 'Aᵀ: satırlar sütun olur.', 'Aᵀ: rows become columns.') : T2(lang, 'Aᵀ: satırlar sütun olur (eşlenik alınmaz).', 'Aᵀ: rows become columns (no conjugation).')), start(T2(lang, 'Sonuç', 'Result'), '', C_)]);
    }
    case 'hermitian': {
      const conj = A.map((row) => row.map((x) => F.conj(x)));
      const C_ = conj[0].map((_, j) => conj.map((row) => row[j]));
      const lines = A.map((row, i) => row.map((x, j) => `conj(${ab(x)}) = ${ab(conj[i][j])}`)).flat();
      return matrixResult(c, C_, [
        start(
          T2(lang, 'Başlangıç', 'Start'),
          T2(
            lang,
            'Hermitian eşlenik transpoz (Aᴴ): önce her elemanın karmaşık eşleniği alınır, sonra matrisin transpozu alınır.\nAᴴ = (Ā)ᵀ, yani (Aᴴ)[j][i] = conj(A[i][j])\nEşlenik: a+bi → a−bi (gerçel kısım aynı kalır, sanal kısmın işareti değişir).',
            'Hermitian conjugate transpose (Aᴴ): first take the complex conjugate of every entry, then transpose the matrix.\nAᴴ = (Ā)ᵀ, i.e. (Aᴴ)[j][i] = conj(A[i][j])\nConjugate: a+bi → a−bi (the real part stays, the imaginary part changes sign).'
          )
        ),
        { title: T2(lang, 'Adım 1: Eşlenik (Ā)', 'Step 1: Conjugate (Ā)'), description: lines.join('\n'), ...snap(c, conj) },
        { title: T2(lang, 'Adım 2: Transpoz', 'Step 2: Transpose'), description: T2(lang, 'Ā matrisinin satırları sütun olur: (Aᴴ)[j][i] = Ā[i][j].', 'The rows of Ā become columns: (Aᴴ)[j][i] = Ā[i][j].'), ...snap(c, C_) },
        start(T2(lang, 'Sonuç', 'Result'), T2(lang, 'Aᴴ = (Ā)ᵀ', 'Aᴴ = (Ā)ᵀ'), C_),
      ]);
    }
    case 'trace': {
      const e = needSquare(c, A, S.traceDimError());
      if (e) return e;
      const diag = A.map((row, i) => row[i]);
      const tr = diag.reduce((a, x) => F.add(a, x), F.zero);
      readable(c, [tr]);
      return {
        success: true,
        scalarResult: F.re(tr),
        scalarResultLabel: ab(tr),
        steps: [
          start(T2(lang, 'Köşegen', 'Diagonal'), T2(lang, `Ana köşegen: [${diag.map(ab).join(', ')}]`, `Main diagonal: [${diag.map(ab).join(', ')}]`)),
          { title: T2(lang, 'Toplam', 'Sum'), description: `iz(A) = ${diag.map((x) => `(${ab(x)})`).join(' + ')} = ${ab(tr)}` },
        ],
      };
    }
    case 'determinant': {
      const e = needSquare(c, A, S.determinantDimError());
      if (e) return e;
      const det = detOf(F, A);
      readable(c, [det]);
      const steps: SolutionStep[] = [start(T2(lang, 'Matris', 'Matrix'), '')];
      const n = rows;
      if (n === 2) {
        steps.push({ title: T2(lang, '2x2 Formül', '2x2 Formula'), description: `det = a·d − b·c = (${ab(A[0][0])})(${ab(A[1][1])}) − (${ab(A[0][1])})(${ab(A[1][0])}) = ${ab(det)}` });
      } else if (n >= 3 && n <= 4) {
        const parts = A[0].map((x, j) => `${j % 2 === 0 ? '+' : '−'} (${ab(x)})·det${j + 1}`).join(' ');
        const minors = A[0].map((_, j) => `det${j + 1} = det(M1${j + 1}) = ${ab(detOf(F, minor(A, 0, j)))}`).join('\n');
        steps.push({ title: T2(lang, '1. Satıra Göre Açılım', 'Expansion Along Row 1'), description: `det(A) = ${parts}\n${minors}` });
      } else if (n >= 5) {
        steps.push({ title: T2(lang, 'Gauss Eliminasyonu ile', 'By Gaussian Elimination'), description: T2(lang, 'Determinant, pivotların çarpımı (satır değişimlerinde işaret değişir) olarak hesaplandı.', 'The determinant is the product of the pivots (sign flips per row swap).') });
      }
      steps.push({ title: T2(lang, 'Sonuç', 'Result'), description: `det(A) = ${ab(det)}` });
      return { success: true, scalarResult: F.re(det), scalarResultLabel: ab(det), steps };
    }
    case 'inverse': {
      const e = needSquare(c, A, S.inverseDimError());
      if (e) return e;
      const n = rows;
      const det = detQuick(F, A);
      if (F.isZero(det)) return fail(S.inverseSingularError());
      const aug = A.map((row, i) => [...row, ...identity(F, n)[i]]);
      const log: SolutionStep[] = [
        { title: T2(lang, 'Determinant Kontrolü', 'Determinant Check'), description: `det(A) = ${ab(det)} ≠ 0` },
        start(T2(lang, 'Genişletilmiş Matris [A | I]', 'Augmented Matrix [A | I]'), '', aug),
      ];
      const { R, pivots } = eliminate(c, aug, 'rref', n, log);
      if (pivots.length < n) return fail(S.inverseSingularError());
      const inv = R.map((row) => row.slice(n));
      log.push(start(T2(lang, 'Sonuç: A⁻¹', 'Result: A⁻¹'), T2(lang, 'Sol blok birim matris oldu; sağ blok A⁻¹.', 'The left block became the identity; the right block is A⁻¹.'), inv));
      return matrixResult(c, inv, log);
    }
    case 'rref':
    case 'rank':
    case 'gaussElimination': {
      const log: SolutionStep[] = [start(T2(lang, 'Başlangıç Matrisi', 'Starting Matrix'), '')];
      const { R, pivots } = eliminate(c, A, type === 'gaussElimination' ? 'echelon' : 'rref', cols, log);
      if (type === 'rank') {
        log.push({ title: T2(lang, 'Rank', 'Rank'), description: T2(lang, `Sıfırdan farklı pivot sayısı = ${pivots.length}`, `Number of nonzero pivots = ${pivots.length}`) });
        return { success: true, scalarResult: pivots.length, scalarResultLabel: String(pivots.length), steps: log };
      }
      log.push(start(type === 'rref' ? T2(lang, 'İndirgenmiş Basamaklı Form', 'Reduced Row Echelon Form') : T2(lang, 'Basamaklı Form', 'Row Echelon Form'), '', R));
      return matrixResult(c, R, log);
    }
    case 'lu': {
      const e = needSquare(c, A, S.luDimError());
      if (e) return e;
      const n = rows;
      const U = A.map((r) => r.slice());
      const L: Mat<T> = A.map((r) => r.map(() => F.zero));
      const perm = Array.from({ length: n }, (_, i) => i);
      const candidates: string[][] = [];
      const swaps: { step: number; to: number }[] = [];
      for (let k = 0; k < n; k++) {
        candidates.push(Array.from({ length: n - k }, (_, t) => ab(U[k + t][k])));
        const pr = pickPivot(F, U, k, k);
        if (pr >= 0 && pr !== k) {
          [U[pr], U[k]] = [U[k], U[pr]];
          [perm[pr], perm[k]] = [perm[k], perm[pr]];
          for (let j = 0; j < k; j++) [L[pr][j], L[k][j]] = [L[k][j], L[pr][j]];
          swaps.push({ step: k, to: pr });
        }
        L[k][k] = F.one;
        if (pr < 0) continue; // sütun sıfır: eleme yok
        for (let i = k + 1; i < n; i++) {
          if (F.isZero(U[i][k])) continue;
          const f = need(F.div(U[i][k], U[k][k]));
          L[i][k] = f;
          const pk = U[k];
          U[i] = U[i].map((x, j) => (j === k ? F.zero : F.sub(x, F.mul(f, pk[j]))));
        }
      }
      const Pn = perm.map((p) => perm.map((_, j) => (j === p ? 1 : 0)));
      const PAm: Mat<T> = perm.map((pi) => A[pi].slice());
      const numOf = (m: Mat<T>) => m.map((r) => r.map((x) => F.re(x)));
      const labOf = (m: Mat<T>) => m.map((r) => r.map(ab));
      const log = buildLuSteps({
        lang,
        n,
        A: { num: numOf(A), lab: labOf(A) },
        P: Pn,
        PA: { num: numOf(PAm), lab: labOf(PAm) },
        L: { num: numOf(L), lab: labOf(L) },
        U: { num: numOf(U), lab: labOf(U) },
        candidates,
        swaps,
        maxAbs: false,
      });
      return {
        success: true,
        luResult: { L: numOf(L), U: numOf(U), P: Pn },
        luResultLabels: { L: labOf(L), U: labOf(U) },
        steps: log,
      };
    }
    case 'power': {
      const e = needSquare(c, A, S.powerDimError());
      if (e) return e;
      if (!Number.isInteger(exponent)) return fail(S.powerIntegerError());
      if (Math.abs(exponent) > 200) return fail(T2(lang, 'Üs |n| ≤ 200 olmalıdır.', 'The exponent must satisfy |n| ≤ 200.'));
      const n = rows;
      let base = A;
      const log: SolutionStep[] = [start(S.powerStartTitle(), S.powerStartDesc(exponent))];
      if (exponent === 0) {
        const I_ = identity(F, n);
        log.push(start(S.powerStartTitle(), S.powerZeroResultDesc(), I_));
        return matrixResult(c, I_, log);
      }
      if (exponent < 0) {
        const det = detQuick(F, A);
        if (F.isZero(det)) return fail(S.powerNegativeInverseError(S.inverseSingularError()));
        const aug = A.map((row, i) => [...row, ...identity(F, n)[i]]);
        const { R, pivots } = eliminate(c, aug, 'rref', n, null);
        if (pivots.length < n) return fail(S.powerNegativeInverseError(S.inverseSingularError()));
        base = R.map((row) => row.slice(n));
        log.push(start(T2(lang, 'A⁻¹ hesaplandı', 'A⁻¹ computed'), T2(lang, 'Negatif üs için önce ters matris alınır.', 'For a negative exponent the inverse is taken first.'), base));
      }
      const k = Math.abs(exponent);
      let acc = base;
      for (let i = 2; i <= k; i++) {
        acc = matMul(F, acc, base);
        if (i <= 6 || i === k) log.push(start(T2(lang, `A^${exponent < 0 ? -i : i}`, `A^${exponent < 0 ? -i : i}`), '', acc));
        else if (i === 7) log.push({ title: '…', description: T2(lang, 'Ara kuvvetler atlandı.', 'Intermediate powers skipped.') });
      }
      return matrixResult(c, acc, log);
    }
    case 'solveLinearSystem': {
      if (!vecB || vecB.length !== rows) return fail(S.dimMismatchVector());
      const aug = A.map((row, i) => [...row, vecB[i]]);
      const log: SolutionStep[] = [start(T2(lang, 'Genişletilmiş Matris [A | b]', 'Augmented Matrix [A | b]'), '', aug)];
      const finish = (x: T[]): OperationResult => (readable(c, x), {
        success: true,
        vectorResult: x.map((v) => F.re(v)),
        vectorResultLabels: x.map(ab),
        steps: log,
      });
      if (method === 'cramer') {
        if (rows !== cols) return fail(S.cramerDimError());
        const det = detQuick(F, A);
        log.push({ title: S.cramerMainDetTitle(), description: `det(A) = ${ab(det)}` });
        if (F.isZero(det)) return fail(S.cramerSingularError(), log);
        const x: T[] = [];
        for (let j = 0; j < cols; j++) {
          const Aj = A.map((row, i) => row.map((v, k) => (k === j ? vecB[i] : v)));
          const dj = detOf(F, Aj);
          const xj = need(F.div(dj, det));
          x.push(xj);
          log.push({ title: `x${j + 1}`, description: `x${j + 1} = det(A${j + 1}) / det(A) = (${ab(dj)}) / (${ab(det)}) = ${ab(xj)}` });
        }
        return finish(x);
      }
      const { R, pivots } = eliminate(c, aug, 'rref', cols, log);
      for (let i = pivots.length; i < rows; i++) {
        if (!F.isZero(R[i][cols])) return fail(S.inconsistentError(), log);
      }
      if (pivots.length < cols) return fail(S.infiniteError(), log);
      const x = Array.from({ length: cols }, (_, j) => R[j][cols]);
      log.push({ title: S.uniqueSolutionTitle(), description: x.map((v, j) => `x${j + 1} = ${ab(v)}`).join('\n') });
      return finish(x);
    }
    case 'eigen': {
      const e = needSquare(c, A, S.eigenDimError());
      if (e) return e;
      return eigenGeneral(c, A);
    }
    default:
      return fail(S.invalidMatrixError());
  }
}

// ---------- giriş ayrıştırma ve dağıtım ----------

const usesB = (t: OperationType) => t === 'add' || t === 'subtract' || t === 'multiply';

/**
 * Karmaşık sayı modunda işlemi çalıştırır. Kullanılan girişlerin hiçbirinde
 * karmaşık birim `i` yoksa null döner (gerçel motorlar devralır).
 */
export function tryComplexOperation(
  type: OperationType,
  matrixA: MatrixData,
  matrixB: MatrixData,
  inputs: SymbolicInputs | undefined,
  lang: LanguageCode,
  mode: Mode
): OperationResult | null {
  if (!inputs || !inputs.A) return null;
  const S = strings(lang);
  const textsA = inputs.A;
  const textsB = usesB(type) ? inputs.B : undefined;
  const scalarText = type === 'scalarMultiply' ? inputs.scalar ?? '' : undefined;
  const vecTexts = type === 'solveLinearSystem' ? inputs.b : undefined;

  const all: string[] = [...textsA.flat(), ...(textsB?.flat() ?? []), ...(scalarText !== undefined ? [scalarText] : []), ...(vecTexts ?? [])];
  if (!all.some(hasImaginaryUnit)) return null;

  if (textsA.length !== matrixA.length || (usesB(type) && (!textsB || textsB.length !== matrixB.length))) return null;

  try {
    // 1) KESİN cisim
    const exactParsed = <U,>(texts: string[][] | undefined): Mat<CxSym> | null => {
      if (!texts) return null;
      const out: Mat<CxSym> = [];
      for (const row of texts) {
        const r: CxSym[] = [];
        for (const t of row) {
          const z = parseComplexInput(t);
          if (z === null) return null;
          r.push(z);
        }
        out.push(r);
      }
      return out;
    };
    const cellsOk = (texts: string[][] | undefined) => !texts || texts.every((row) => row.every((t) => parseComplexNumber(t) !== null));
    if (!cellsOk(textsA) || !cellsOk(textsB) || (scalarText !== undefined && parseComplexNumber(scalarText) === null) || (vecTexts && !vecTexts.every((t) => parseComplexNumber(t) !== null))) {
      throw new InputError(T2(lang, 'Karmaşık girişlerden biri geçersiz (ör. "3+2i", "i", "(1+i)/2" biçiminde olmalı).', 'One of the complex entries is invalid (use forms like "3+2i", "i", "(1+i)/2").'));
    }

    const eA = exactParsed(textsA);
    const eB = textsB ? exactParsed(textsB) : null;
    const eS = scalarText !== undefined ? parseComplexInput(scalarText) : null;
    const eV = vecTexts ? vecTexts.map((t) => parseComplexInput(t)) : null;
    const exactOk = !!eA && (!textsB || !!eB) && (scalarText === undefined || !!eS) && (!vecTexts || eV!.every((z) => z !== null));
    const exponent = inputs.exponent ?? 2;
    const method = inputs.method ?? 'gauss';

    if (exactOk) {
      try {
        resetExactBudget();
        const c: CxCtx<CxSym> = { F: exactField, lang, mode, S };
        return runGeneric(c, type, eA!, eB, eS, eV as CxSym[] | null, exponent, method);
      } catch (e) {
        if (!isBail(e)) throw e;
        // kesin takip sürdürülemedi → sayısal yedek
      }
    }

    // 2) SAYISAL cisim
    const num = (texts: string[][]): Mat<C> => texts.map((row) => row.map((t) => parseComplexNumber(t)!));
    const nA = num(textsA);
    let maxAbs = 1;
    for (const row of nA) for (const z of row) maxAbs = Math.max(maxAbs, Math.hypot(z.re, z.im));
    const F = numericField(1e-11 * maxAbs);
    const c: CxCtx<C> = { F, lang, mode, S };
    const nS = scalarText !== undefined ? parseComplexNumber(scalarText)! : null;
    const nV = vecTexts ? vecTexts.map((t) => parseComplexNumber(t)!) : null;
    return runGeneric(c, type, nA, textsB ? num(textsB) : null, nS, nV, exponent, method);
  } catch (e) {
    if (e instanceof InputError) return { success: false, errorMessage: e.message, steps: [] };
    if (isBail(e)) return { success: false, errorMessage: T2(lang, 'Bu işlem karmaşık modda hesaplanamadı (bölen sıfıra çok yakın ya da sonuç çok karmaşık).', 'This operation could not be computed in complex mode (divisor too close to zero or the result is too complex).'), steps: [] };
    return null;
  }
}

/**
 * GERÇEL girişli 3x3 (yalnızca kesirli modda, bkz. runOperation) ve 4x4+ matrislerin
 * özdeğer/özvektörleri (2x2 için bkz. symbolicOps.trySymbolicEigen / matrixUtils.eigen). Önce hücre metinlerinden KESİN
 * cisimde (rasyonel/π/√), olmazsa sayısal karmaşık cisimde eigenGeneral çalışır.
 * Uygulanamıyorsa null.
 */
export function tryLargeEigen(
  matrixA: MatrixData,
  inputs: SymbolicInputs | undefined,
  lang: LanguageCode,
  mode: Mode
): OperationResult | null {
  const n = matrixA.length;
  if (n < 2 || matrixA.some((r) => r.length !== n)) return null;
  const S = strings(lang);
  try {
    if (inputs?.A && inputs.A.length === n && inputs.A.every((r) => r.length === n)) {
      const eA: Mat<CxSym> = [];
      let ok = true;
      for (const row of inputs.A) {
        const r: CxSym[] = [];
        for (const t of row) {
          const z = parseComplexInput(t);
          if (z === null) {
            ok = false;
            break;
          }
          r.push(z);
        }
        if (!ok) break;
        eA.push(r);
      }
      if (ok) {
        try {
          resetExactBudget(20000);
          return eigenGeneral({ F: exactField, lang, mode, S }, eA);
        } catch (e) {
          if (!isBail(e)) throw e;
        }
      }
    }
    let maxAbs = 1;
    for (const row of matrixA) for (const x of row) maxAbs = Math.max(maxAbs, Math.abs(x));
    const F = numericField(1e-11 * maxAbs);
    const An: Mat<C> = matrixA.map((row) => row.map((x) => ({ re: x, im: 0 })));
    return eigenGeneral({ F, lang, mode, S }, An);
  } catch {
    return null;
  }
}

/** Karmaşık giriş metinlerini gösterim etiketlerine çevirir ("3+2i" → "3 + 2i"); ayrıştırılamayan ham kalır. */
export function formatComplexInputs(texts: string[][], mode: Mode): string[][] {
  return texts.map((row) =>
    row.map((t) => {
      const z = parseComplexInput(t);
      return z ? exactField.fmt(z, mode) : t;
    })
  );
}
