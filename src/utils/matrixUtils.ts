import { MatrixData, OperationResult, SolutionStep, LanguageCode } from '@/types';
import { buildLuSteps, permFromP } from './luSteps';
import { strings } from './matrixStepText';
import { formatNumber, formatNumberWithRadical, NumberDisplayMode, toRationalApproximation, tryRadical } from './numberFormat';
import { latexifyLabel } from './symbolic';
import { eigenComplexNumeric } from './complexEigen';

export const EPSILON = 1e-9;

// Keep extra precision during calculations to reduce floating-point errors.
// Display formatting is handled separately in formatNumber.
export const CALC_DECIMALS = 13;

export function round(value: number, decimals = CALC_DECIMALS): number {
  const factor = Math.pow(10, decimals);
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundMatrix(m: MatrixData, decimals = CALC_DECIMALS): MatrixData {
  return m.map((row) => row.map((v) => round(v, decimals)));
}

// ------------------------------------------------------------
// TEMEL YARDIMCI FONKSİYONLAR
// ------------------------------------------------------------

export function createEmptyMatrix(rows: number, cols: number): MatrixData {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

/**
 * Bir matrisi yeni boyutlara göre yeniden boyutlandırır.
 * - Ortak (kesişen) hücrelerdeki mevcut değerler korunur.
 * - Yeni eklenen satır/sütunlardaki hücreler 0 ile doldurulur.
 * - Taşan (yeni boyutun dışında kalan) satır/sütunlar kaldırılır.
 */
export function resizeMatrix(matrix: MatrixData, newRows: number, newCols: number): MatrixData {
  return Array.from({ length: newRows }, (_, i) =>
    Array.from({ length: newCols }, (_, j) => matrix[i]?.[j] ?? 0)
  );
}

export function identityMatrix(n: number): MatrixData {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
}

export function cloneMatrix(m: MatrixData): MatrixData {
  return m.map((row) => [...row]);
}

export function isValidMatrix(m: MatrixData): boolean {
  if (!Array.isArray(m) || m.length === 0) return false;
  const cols = m[0].length;
  // Number.isFinite also rejects NaN and +/-Infinity.
  return m.every((row) => Array.isArray(row) && row.length === cols && row.every((v) => Number.isFinite(v)));
}

export function dimensions(m: MatrixData): { rows: number; cols: number } {
  return { rows: m.length, cols: m[0]?.length ?? 0 };
}

// ------------------------------------------------------------
// LaTeX çıktı yardımcısı
// ------------------------------------------------------------

export function matrixToLatex(m: MatrixData, mode: NumberDisplayMode = 'decimal', labels?: string[][]): string {
  // latexifyLabel: √, π ve tek terimli kesirleri gerçek LaTeX komutlarına
  // çevirir (\sqrt{2}, \pi, \frac{3\pi}{4}); düz sayılar değişmez.
  const fmt = (v: number) => latexifyLabel(formatNumber(v, mode));
  const rows = m.map((row, i) => row.map((v, j) => (labels?.[i]?.[j] !== undefined ? latexifyLabel(labels[i][j]) : fmt(v))).join(' & ')).join(' \\\\\n');
  return `\\begin{bmatrix}\n${rows}\n\\end{bmatrix}`;
}

export function resultToLatex(result: OperationResult, opLabel: string, mode: NumberDisplayMode = 'decimal'): string {
  const fmt = (v: number) => formatNumber(v, mode);
  const fmtR = (v: number) => formatNumberWithRadical(v, mode);
  const lines: string[] = [`\\textbf{${opLabel}}`];

  if (!result.success) {
    lines.push(`\\text{Hata: ${result.errorMessage}}`);
    return lines.join('\n\n');
  }

  if (result.matrixResult) {
    // Sembolik sonuçta hazır LaTeX hücreleri varsa onlar kullanılır.
    lines.push(matrixToLatex(result.matrixResult, mode, result.matrixResultLatex ?? result.matrixResultLabels));
  }
  if (result.scalarResult !== undefined) {
    lines.push(`= ${result.scalarResultLatex ?? (result.scalarResultLabel ? latexifyLabel(result.scalarResultLabel) : fmt(result.scalarResult))}`);
  }
  if (result.vectorResult) {
    lines.push(`x = \\begin{bmatrix} ${result.vectorResult.map((v, i) => result.vectorResultLatex?.[i] ?? (result.vectorResultLabels?.[i] !== undefined ? latexifyLabel(result.vectorResultLabels[i]) : fmt(v))).join(' \\\\ ')} \\end{bmatrix}`);
  }
  if (result.eigenResult) {
    const vals = result.eigenResult.eigenvalues.map((v, i) => result.eigenResult!.radicalExpressions?.[i] ?? fmtR(v));
    lines.push(`\\lambda = \\{ ${vals.join(', ')} \\}`);
    result.eigenResult.eigenvectors.forEach((v, i) => {
      lines.push(`v_{${i + 1}} = \\begin{bmatrix} ${v.map(fmtR).join(' \\\\ ')} \\end{bmatrix}`);
    });
  }
  if (result.luResult) {
    lines.push(`L = ${matrixToLatex(result.luResult.L, mode, result.luResultLabels?.L)}`);
    lines.push(`U = ${matrixToLatex(result.luResult.U, mode, result.luResultLabels?.U)}`);
  }
  return lines.join('\n\n');
}

// ------------------------------------------------------------
// 1. TEMEL İŞLEMLER
// ------------------------------------------------------------

export function add(a: MatrixData, b: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  const da = dimensions(a);
  const db = dimensions(b);
  if (da.rows !== db.rows || da.cols !== db.cols) {
    return errorResult(S.addDimError());
  }
  const steps: SolutionStep[] = [
    { title: S.addSubDimCheckTitle(), description: S.addDimCheckDesc(da.rows, da.cols, db.rows, db.cols) },
  ];
  const result = createEmptyMatrix(da.rows, da.cols);
  for (let i = 0; i < da.rows; i++) {
    for (let j = 0; j < da.cols; j++) {
      const sum = round(a[i][j] + b[i][j]);
      result[i][j] = sum;
      steps.push({
        title: S.cellCalcTitle(i + 1, j + 1),
        description: S.addCellDesc(i + 1, j + 1, fmt(a[i][j]), fmt(b[i][j]), fmt(sum)),
      });
    }
  }
  steps.push({ title: S.addResultTitle(), description: S.addResultDesc(), matrixSnapshot: result });
  return { success: true, matrixResult: result, steps };
}

export function subtract(a: MatrixData, b: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  const da = dimensions(a);
  const db = dimensions(b);
  if (da.rows !== db.rows || da.cols !== db.cols) {
    return errorResult(S.subtractDimError());
  }
  const steps: SolutionStep[] = [
    { title: S.addSubDimCheckTitle(), description: S.subtractDimCheckDesc(da.rows, da.cols, db.rows, db.cols) },
  ];
  const result = createEmptyMatrix(da.rows, da.cols);
  for (let i = 0; i < da.rows; i++) {
    for (let j = 0; j < da.cols; j++) {
      const diff = round(a[i][j] - b[i][j]);
      result[i][j] = diff;
      steps.push({
        title: S.cellCalcTitle(i + 1, j + 1),
        description: S.subtractCellDesc(i + 1, j + 1, fmt(a[i][j]), fmt(b[i][j]), fmt(diff)),
      });
    }
  }
  steps.push({ title: S.addResultTitle(), description: S.subtractResultDesc(), matrixSnapshot: result });
  return { success: true, matrixResult: result, steps };
}

export function scalarMultiply(a: MatrixData, scalar: number, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  const { rows, cols } = dimensions(a);
  const steps: SolutionStep[] = [{ title: S.scalarStartTitle(), description: S.scalarStartDesc(fmt(scalar)) }];
  const result = createEmptyMatrix(rows, cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const product = round(a[i][j] * scalar);
      result[i][j] = product;
      steps.push({
        title: S.cellCalcTitle(i + 1, j + 1),
        description: S.scalarCellDesc(fmt(scalar), i + 1, j + 1, fmt(a[i][j]), fmt(product)),
      });
    }
  }
  steps.push({ title: S.scalarResultTitle(), description: S.scalarResultDesc(), matrixSnapshot: result });
  return { success: true, matrixResult: result, steps };
}

// Detaylandırılmış matris çarpımı adımları
export function multiply(a: MatrixData, b: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  const da = dimensions(a);
  const db = dimensions(b);
  if (da.cols !== db.rows) {
    return errorResult(S.multiplyDimError(da.cols, db.rows));
  }
  const steps: SolutionStep[] = [
    { title: S.addSubDimCheckTitle(), description: S.multiplyDimCheckDesc(da.rows, da.cols, db.rows, db.cols) },
  ];
  const result = createEmptyMatrix(da.rows, db.cols);
  for (let i = 0; i < da.rows; i++) {
    for (let j = 0; j < db.cols; j++) {
      let sum = 0;
      // Detaylı çarpım: her terimi ayrı ayrı göster
      const termParts: string[] = [];
      const valueParts: string[] = [];
      for (let k = 0; k < da.cols; k++) {
        const product = a[i][k] * b[k][j];
        sum += product;
        termParts.push(`(${fmt(a[i][k])})(${fmt(b[k][j])})`);
        valueParts.push(fmt(round(product)));
      }
      result[i][j] = round(sum);

      const desc = `C[${i + 1}][${j + 1}] = ${termParts.join(' + ')}\n= ${valueParts.join(' + ')} = ${fmt(round(sum))}`;
      steps.push({
        title: S.cellCalcTitle(i + 1, j + 1),
        description: desc,
      });
    }
  }
  steps.push({ title: S.addResultTitle(), description: S.multiplyResultDesc(), matrixSnapshot: result });
  return { success: true, matrixResult: result, steps };
}

// ------------------------------------------------------------
// 2. TRANSPOZ VE İZ (TRACE)
// ------------------------------------------------------------

export function transpose(a: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  const { rows, cols } = dimensions(a);
  const result = createEmptyMatrix(cols, rows);
  const steps: SolutionStep[] = [{ title: S.transposeStartTitle(), description: S.transposeStartDesc(cols, rows) }];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = a[i][j];
      steps.push({
        title: S.transposeCellTitle(j + 1, i + 1),
        description: S.transposeCellDesc(i + 1, j + 1, fmt(a[i][j]), j + 1, i + 1),
      });
    }
  }
  steps.push({ title: S.transposeResultTitle(), description: S.transposeResultDesc(), matrixSnapshot: result });
  return { success: true, matrixResult: result, steps };
}

export function trace(a: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  const { rows, cols } = dimensions(a);
  if (rows !== cols) return errorResult(S.traceDimError());
  let sum = 0;
  const diag: number[] = [];
  for (let i = 0; i < rows; i++) {
    sum += a[i][i];
    diag.push(a[i][i]);
  }
  return {
    success: true,
    scalarResult: round(sum),
    steps: [
      { title: S.traceDiagTitle(), description: S.traceDiagDesc(diag.map(fmt).join(', ')) },
      { title: S.traceSumTitle(), description: S.traceSumDesc(diag.map(fmt).join(' + '), fmt(round(sum))) },
    ],
  };
}

// ------------------------------------------------------------
// 3. DETERMINANT
// ------------------------------------------------------------

// Gaussian elimination with partial pivoting (O(n^3)) for n >= 3.
// No intermediate rounding; EPSILON is only used in the pivot check.
export function determinantValue(a: MatrixData): number {
  const n = a.length;
  if (n === 1) return a[0][0];
  if (n === 2) return a[0][0] * a[1][1] - a[0][1] * a[1][0];

  const m = cloneMatrix(a);
  let sign = 1;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(m[r][i]) > Math.abs(m[maxRow][i])) maxRow = r;
    }
    if (Math.abs(m[maxRow][i]) < EPSILON) return 0;
    if (maxRow !== i) {
      [m[i], m[maxRow]] = [m[maxRow], m[i]];
      sign = -sign;
    }
    for (let r = i + 1; r < n; r++) {
      const factor = m[r][i] / m[i][i];
      if (Math.abs(factor) < EPSILON) continue;
      for (let c = i; c < n; c++) {
        m[r][c] -= factor * m[i][c];
      }
    }
  }

  let det = sign;
  for (let i = 0; i < n; i++) det *= m[i][i];
  return det;
}

export function determinant(a: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  // An empty matrix passes the square check (0x0), so reject it explicitly.
  if (!isValidMatrix(a)) return errorResult(S.invalidMatrixError());
  const { rows, cols } = dimensions(a);
  if (rows !== cols) return errorResult(S.determinantDimError());

  const steps: SolutionStep[] = [];
  const n = a.length;
  let value: number;

  if (n === 1) {
    steps.push({ title: S.detDepth1Title(1), description: S.detDepth1Desc(fmt(a[0][0])) });
    value = a[0][0];
  } else if (n === 2) {
    const val = a[0][0] * a[1][1] - a[0][1] * a[1][0];
    steps.push({
      title: S.detDepth2Title(1),
      description: S.detDepth2Desc(fmt(a[0][0]), fmt(a[1][1]), fmt(a[0][1]), fmt(a[1][0]), fmt(round(val))),
    });
    value = val;
  } else {
    // Gaussian elimination with partial pivoting, one step per pivot.
    // The determinant is rounded only at the end.
    const m = cloneMatrix(a);
    let sign = 1;
    let singular = false;
    steps.push({ title: S.detEliminateStartTitle(), description: S.detEliminateStartDesc(), matrixSnapshot: cloneMatrix(m) });

    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let r = i + 1; r < n; r++) {
        if (Math.abs(m[r][i]) > Math.abs(m[maxRow][i])) maxRow = r;
      }
      if (Math.abs(m[maxRow][i]) < EPSILON) {
        singular = true;
        steps.push({ title: S.detZeroPivotTitle(), description: S.detZeroPivotDesc(i + 1) });
        break;
      }

      if (maxRow !== i) {
        [m[i], m[maxRow]] = [m[maxRow], m[i]];
        sign = -sign;
        steps.push({ title: S.detSwapTitle(), description: S.detSwapDesc(i + 1, maxRow + 1), matrixSnapshot: cloneMatrix(m) });
      }

      for (let r = i + 1; r < n; r++) {
        const factor = m[r][i] / m[i][i];
        if (Math.abs(factor) > EPSILON) {
          for (let c = i; c < n; c++) {
            m[r][c] -= factor * m[i][c];
          }
        }
      }

      steps.push({
        title: S.detEliminateTitle(i + 1),
        description: S.detEliminateDesc(i + 1, fmt(round(m[i][i]))),
        matrixSnapshot: cloneMatrix(m),
      });
    }

    if (singular) {
      value = 0;
    } else {
      let det = sign;
      const diagParts: string[] = [];
      for (let i = 0; i < n; i++) {
        det *= m[i][i];
        diagParts.push(fmt(round(m[i][i])));
      }
      steps.push({
        title: S.detResultTitle(),
        description: S.detPivotProductDesc(diagParts.join(' × '), sign, fmt(round(det))),
      });
      value = det;
    }
  }

  const finalValue = round(value);
  steps.push({ title: S.detResultTitle(), description: S.detResultDesc(fmt(finalValue)) });
  return { success: true, scalarResult: finalValue, steps };
}

// ------------------------------------------------------------
// 4. GAUSS ELİMİNASYONU / RREF
// ------------------------------------------------------------

export function rref(a: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): { result: MatrixData; steps: SolutionStep[]; pivotCount: number } {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  const m = cloneMatrix(a);
  const rows = m.length;
  const cols = m[0].length;
  const steps: SolutionStep[] = [{ title: S.rrefStartTitle(), description: S.rrefStartDesc(), matrixSnapshot: cloneMatrix(m) }];

  let pivotRow = 0;
  let pivotCount = 0;

  for (let col = 0; col < cols && pivotRow < rows; col++) {
    let maxRow = pivotRow;
    for (let r = pivotRow + 1; r < rows; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[maxRow][col])) maxRow = r;
    }
    if (Math.abs(m[maxRow][col]) < EPSILON) {
      steps.push({ title: S.rrefSkipColTitle(col + 1), description: S.rrefSkipColDesc(col + 1) });
      continue;
    }

    if (maxRow !== pivotRow) {
      [m[pivotRow], m[maxRow]] = [m[maxRow], m[pivotRow]];
      steps.push({ title: S.rrefSwapTitle(), description: S.rrefSwapDesc(pivotRow + 1, maxRow + 1), matrixSnapshot: cloneMatrix(m) });
    }

    // No intermediate rounding; round() is only used for step text and the final result.
    const pivotVal = m[pivotRow][col];
    if (Math.abs(pivotVal - 1) > EPSILON) {
      m[pivotRow] = m[pivotRow].map((v) => v / pivotVal);
      steps.push({ title: S.rrefNormalizeTitle(), description: S.rrefNormalizeDesc(pivotRow + 1, fmt(round(pivotVal))), matrixSnapshot: roundMatrix(m) });
    }

    for (let r = 0; r < rows; r++) {
      if (r === pivotRow) continue;
      const factor = m[r][col];
      if (Math.abs(factor) > EPSILON) {
        m[r] = m[r].map((v, c) => v - factor * m[pivotRow][c]);
        steps.push({ title: S.rrefRowOpTitle(), description: S.rrefRowOpDesc(r + 1, fmt(round(factor)), pivotRow + 1), matrixSnapshot: roundMatrix(m) });
      }
    }

    pivotRow++;
    pivotCount++;
  }

  return { result: m, steps, pivotCount };
}

export function rrefOperation(a: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const { result, steps } = rref(a, lang, mode);
  // Round the returned result once, at the end.
  const rounded = roundMatrix(result);
  steps.push({ title: S.rrefResultTitle(), description: S.rrefResultDesc(), matrixSnapshot: rounded });
  return { success: true, matrixResult: rounded, steps };
}

export function gaussElimination(a: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  const m = cloneMatrix(a);
  const rows = m.length;
  const cols = m[0].length;
  const steps: SolutionStep[] = [{ title: S.gaussStartTitle(), description: S.gaussStartDesc(), matrixSnapshot: cloneMatrix(m) }];

  let pivotRow = 0;
  for (let col = 0; col < cols && pivotRow < rows; col++) {
    let maxRow = pivotRow;
    for (let r = pivotRow + 1; r < rows; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[maxRow][col])) maxRow = r;
    }
    if (Math.abs(m[maxRow][col]) < EPSILON) {
      steps.push({ title: S.rrefSkipColTitle(col + 1), description: S.rrefSkipColDesc(col + 1) });
      continue;
    }

    if (maxRow !== pivotRow) {
      [m[pivotRow], m[maxRow]] = [m[maxRow], m[pivotRow]];
      steps.push({ title: S.rrefSwapTitle(), description: S.rrefSwapDesc(pivotRow + 1, maxRow + 1), matrixSnapshot: cloneMatrix(m) });
    }

    for (let r = pivotRow + 1; r < rows; r++) {
      const factor = m[r][col] / m[pivotRow][col];
      if (Math.abs(factor) > EPSILON) {
        // Rounding is applied to the snapshot only, not to m.
        m[r] = m[r].map((v, c) => v - factor * m[pivotRow][c]);
        steps.push({ title: S.rrefRowOpTitle(), description: S.rrefRowOpDesc(r + 1, fmt(round(factor)), pivotRow + 1), matrixSnapshot: roundMatrix(m) });
      }
    }

    pivotRow++;
  }

  const rounded = roundMatrix(m);
  steps.push({ title: S.gaussResultTitle(), description: S.gaussResultDesc(), matrixSnapshot: rounded });
  return { success: true, matrixResult: rounded, steps };
}

// ------------------------------------------------------------
// 5. RANK
// ------------------------------------------------------------

export function rank(a: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const { steps, pivotCount } = rref(a, lang, mode);
  steps.push({ title: S.rankResultTitle(), description: S.rankResultDesc(pivotCount) });
  return { success: true, scalarResult: pivotCount, steps };
}

// ------------------------------------------------------------
// 6. TERS MATRİS
// ------------------------------------------------------------

export function inverse(a: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  // Catch invalid or empty input before determinant() reports it as singular.
  if (!isValidMatrix(a)) return errorResult(S.invalidMatrixError());
  const { rows, cols } = dimensions(a);
  if (rows !== cols) return errorResult(S.inverseDimError());

  const detResult = determinant(a, lang, mode);
  // Use the unrounded determinant for the singularity check so very small
  // non-zero values (e.g. 1e-8) are not treated as singular.
  const detValue = determinantValue(a);
  if (Math.abs(detValue) < EPSILON) {
    return errorResult(S.inverseSingularError());
  }

  const n = rows;
  let augmented: MatrixData = a.map((row, i) => [...row, ...identityMatrix(n)[i]]);
  const steps: SolutionStep[] = [
    { title: S.inverseDetCheckTitle(), description: S.inverseDetCheckDesc(fmt(detResult.scalarResult!)) },
    { title: S.inverseAugmentedTitle(), description: S.inverseAugmentedDesc(), matrixSnapshot: cloneMatrix(augmented) },
  ];

  let pivotRow = 0;
  for (let col = 0; col < n && pivotRow < n; col++) {
    let maxRow = pivotRow;
    for (let r = pivotRow + 1; r < n; r++) {
      if (Math.abs(augmented[r][col]) > Math.abs(augmented[maxRow][col])) maxRow = r;
    }
    if (Math.abs(augmented[maxRow][col]) < EPSILON) continue;

    if (maxRow !== pivotRow) {
      [augmented[pivotRow], augmented[maxRow]] = [augmented[maxRow], augmented[pivotRow]];
      steps.push({ title: S.inverseSwapTitle(), description: S.inverseSwapDesc(pivotRow + 1, maxRow + 1), matrixSnapshot: cloneMatrix(augmented) });
    }

    // No intermediate rounding; roundMatrix() is only used for snapshots.
    const pivotVal = augmented[pivotRow][col];
    augmented[pivotRow] = augmented[pivotRow].map((v) => v / pivotVal);
    steps.push({ title: S.inverseNormalizeTitle(), description: S.inverseNormalizeDesc(pivotRow + 1, fmt(round(pivotVal))), matrixSnapshot: roundMatrix(augmented) });

    for (let r = 0; r < n; r++) {
      if (r === pivotRow) continue;
      const factor = augmented[r][col];
      if (Math.abs(factor) > EPSILON) {
        augmented[r] = augmented[r].map((v, c) => v - factor * augmented[pivotRow][c]);
        steps.push({
          title: S.inverseRowOpTitle(),
          description: S.inverseRowOpDesc(r + 1, fmt(round(factor)), pivotRow + 1, col + 1),
          matrixSnapshot: roundMatrix(augmented),
        });
      }
    }
    pivotRow++;
  }
  steps.push({ title: S.inverseReduceDoneTitle(), description: S.inverseReduceDoneDesc(), matrixSnapshot: roundMatrix(augmented) });

  // Round the final result.
  const result = augmented.map((row) => row.slice(n).map((v) => round(v)));
  steps.push({ title: S.inverseResultTitle(), description: S.inverseResultDesc(), matrixSnapshot: result });

  return { success: true, matrixResult: result, steps };
}

// ------------------------------------------------------------
// 7. LU AYRIŞTIRMASI
// ------------------------------------------------------------

export function luDecomposition(a: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  const { rows, cols } = dimensions(a);
  if (rows !== cols) return errorResult(S.luDimError());
  const n = rows;

  // A: eliminasyon ilerledikçe güncellenen çalışma matrisi (satır değişimleri
  // VE satır işlemleri burada birikir); son haliyle üst üçgen kısmı U'yu verir.
  const A = cloneMatrix(a);
  const L = identityMatrix(n);
  const U = createEmptyMatrix(n, n);
  const P = identityMatrix(n);
  // Adım metinleri için: her adımdaki pivot adayları ve yapılan satır değişimleri
  const candidates: string[][] = [];
  const swaps: { step: number; to: number }[] = [];

  for (let i = 0; i < n; i++) {
    // Kısmi pivotlama eliminasyonla İÇ İÇE yapılır: i. adımda A'nın o ana kadar
    // eliminasyon uygulanmış GÜNCEL (Schur tümleyeni) haline bakılır.
    // Pivot = i. sütunda, i. satırdan itibaren mutlak değerce en büyük eleman.
    candidates.push(Array.from({ length: n - i }, (_, k) => fmt(A[i + k][i])));
    let maxRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(A[maxRow][i])) maxRow = r;
    }
    if (maxRow !== i) {
      [A[i], A[maxRow]] = [A[maxRow], A[i]];
      [P[i], P[maxRow]] = [P[maxRow], P[i]];
      // L'nin o ana kadar hesaplanmış kısmı (0..i-1 sütunları) da aynı şekilde
      // değiştirilmeli; aksi halde P×A = L×U eşitliği bozulur.
      for (let k = 0; k < i; k++) {
        const tmp = L[i][k];
        L[i][k] = L[maxRow][k];
        L[maxRow][k] = tmp;
      }
      swaps.push({ step: i, to: maxRow });
    }

    if (Math.abs(A[i][i]) < EPSILON) {
      return errorResult(S.luZeroPivotError());
    }

    // Multipliers go directly into column i of L. Rounding is applied only
    // to snapshots and the final result.
    for (let r = i + 1; r < n; r++) {
      const factor = A[r][i] / A[i][i];
      L[r][i] = factor;
      for (let c = i; c < n; c++) {
        A[r][c] = A[r][c] - factor * A[i][c];
      }
    }
    for (let c = i; c < n; c++) {
      U[i][c] = A[i][c];
    }
  }

  const Lr = roundMatrix(L);
  const Ur = roundMatrix(U);
  const perm = permFromP(P);
  const PAr = perm.map((pi) => a[pi].slice());
  const lab = (m: MatrixData) => m.map((row) => row.map((v) => fmt(v)));
  const steps = buildLuSteps({
    lang,
    n,
    A: { num: a, lab: lab(a) },
    P,
    PA: { num: PAr, lab: lab(PAr) },
    L: { num: Lr, lab: lab(Lr) },
    U: { num: Ur, lab: lab(Ur) },
    candidates,
    swaps,
    maxAbs: true,
  });
  return { success: true, luResult: { L: Lr, U: Ur, P }, steps };
}

// ------------------------------------------------------------
// 8. MATRİS KUVVETİ
// ------------------------------------------------------------

export function matrixPower(a: MatrixData, n: number, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const { rows, cols } = dimensions(a);
  if (rows !== cols) return errorResult(S.powerDimError());
  if (!Number.isInteger(n)) return errorResult(S.powerIntegerError());

  const steps: SolutionStep[] = [{ title: S.powerStartTitle(), description: S.powerStartDesc(n) }];

  if (n === 0) {
    const id = identityMatrix(rows);
    steps.push({ title: S.powerResultTitle(), description: S.powerZeroResultDesc(), matrixSnapshot: id });
    return { success: true, matrixResult: id, steps };
  }

  let base = a;
  let negativePower = false;
  if (n < 0) {
    const inv = inverse(a, lang, mode);
    if (!inv.success) return errorResult(S.powerNegativeInverseError(inv.errorMessage ?? ''));
    base = inv.matrixResult!;
    negativePower = true;
    steps.push({ title: S.powerNegativeTitle(), description: S.powerNegativeDesc() });
  }

  let result = identityMatrix(rows);
  const absN = Math.abs(n);
  for (let i = 0; i < absN; i++) {
    steps.push({
      title: S.powerMulTitle(i + 1, absN),
      description: negativePower ? S.powerMulDescNeg() : S.powerMulDescPos(),
    });

    // Bu turun çarpımını, her hücrenin nasıl hesaplandığını gösteren
    // detaylı adımlarla birlikte yürüt (multiply() zaten hücre bazlı
    // adım üretiyor; boyut kontrolü ve tekrar eden sonuç adımı hariç
    // tüm ara adımları buraya taşıyoruz).
    const mulResult = multiply(result, base, lang, mode);
    const cellSteps = mulResult.steps.slice(1, -1);
    steps.push(...cellSteps);

    result = mulResult.matrixResult!;
    steps.push({
      title: S.powerRoundResultTitle(i + 1, absN),
      description: S.powerRoundResultDesc(i + 1, absN),
      matrixSnapshot: result,
    });
  }

  steps.push({ title: S.powerResultTitle(), description: S.powerResultDesc(n), matrixSnapshot: result });
  return { success: true, matrixResult: result, steps };
}

// ------------------------------------------------------------
// 9. ÖZDEĞER / ÖZVEKTÖR
// ------------------------------------------------------------

/** Özdeğer hesaplama fonksiyonlarının ortak dönüş tipi. */
interface EigenvalueResult {
  values: number[];
  raw: number[];
  /**
   * Symbolic radical form of each eigenvalue, or null for rational values.
   * Null entries are formatted by the consumer using the current display mode.
   */
  radicals: (string | null)[];
  /** Diskriminantın (2x2 için) tam kare olup olmadığı - true ise özdeğer(ler) rasyoneldir. */
  isPerfectSquare: boolean;
  /** disc = outside² · inside biçiminde sadeleştirilmiş köklü kısım (yalnızca 2x2 + irrasyonel durumda). */
  radicalParts: { outside: number; inside: number } | null;
}

/** 2x2 matris için özdeğerleri sembolik olarak hesaplar */
function eigenvalues2x2(a: MatrixData, mode: NumberDisplayMode = 'decimal'): EigenvalueResult {
  const tr = a[0][0] + a[1][1];
  const det = a[0][0] * a[1][1] - a[0][1] * a[1][0];
  const discriminant = tr * tr - 4 * det;

  if (discriminant < -EPSILON) {
    return { values: [], raw: [], radicals: [], isPerfectSquare: false, radicalParts: null };
  }

  if (Math.abs(discriminant) < EPSILON) {
    const l = round(tr / 2);
    // A repeated root is always rational; leave null so it is formatted using the current display mode.
    return {
      values: [l, l],
      raw: [tr / 2, tr / 2],
      radicals: [null, null],
      isPerfectSquare: true,
      radicalParts: null,
    };
  }

  // Köklü ifade olarak göster
  const sqrtD = Math.sqrt(discriminant);
  const rawL1 = (tr + sqrtD) / 2;
  const rawL2 = (tr - sqrtD) / 2;
  const l1 = round(rawL1);
  const l2 = round(rawL2);

  // Detect a clean p/q discriminant first: sqrt(p/q) = sqrt(p*q) / q.
  // If p*q is a perfect square the roots are rational; otherwise simplify to outside^2 * inside.
  // Irrational discriminants (e.g. involving pi) stay numeric.
  const discFrac = toRationalApproximation(discriminant);

  let isPerfectSquare = false;
  let r1: string | null = null;
  let r2: string | null = null;
  let radicalParts: { outside: number; inside: number } | null = null;

  if (discFrac) {
    const pq = discFrac.numerator * discFrac.denominator;
    const root = Math.round(Math.sqrt(pq));
    if (root * root === pq) {
      // Rational roots: radicals stays null and is formatted at display time.
      isPerfectSquare = true;
    } else {
      const simplified = simplifyRadical(pq);
      const outside = simplified.outside / discFrac.denominator;
      radicalParts = { outside, inside: simplified.inside };
      // λ = tr/2 ± (dış/2)·√iç  → ortak paydaya indirgenmiş tam sayılarla
      r1 = formatLinearRadicalFraction(tr / 2, outside / 2, simplified.inside);
      r2 = formatLinearRadicalFraction(tr / 2, -outside / 2, simplified.inside);
    }
  }

  return { values: [l1, l2], raw: [rawL1, rawL2], radicals: [r1, r2], isPerfectSquare, radicalParts };
}

/** √n = a√b biçiminde basitleştirir (b mümkün olan en küçük) */
function simplifyRadical(n: number): { outside: number; inside: number } {
  const absN = Math.round(Math.abs(n));
  let outside = 1;
  let inside = absN;
  for (let i = 2; i * i <= absN; i++) {
    while (inside % (i * i) === 0) {
      outside *= i;
      inside /= (i * i);
    }
  }
  return { outside, inside: Math.round(inside) };
}

/** 3x3 matris için karakteristik polinom kökleri */
function eigenvalues3x3(a: MatrixData): EigenvalueResult {
  const t = a[0][0] + a[1][1] + a[2][2];
  const detA = determinantValue(a);
  const m01 = a[0][0] * a[1][1] - a[0][1] * a[1][0];
  const m02 = a[0][0] * a[2][2] - a[0][2] * a[2][0];
  const m12 = a[1][1] * a[2][2] - a[1][2] * a[2][1];
  const c2sum = m01 + m02 + m12;

  const p = c2sum - (t * t) / 3;
  const q = (-2 * t * t * t) / 27 + (t * c2sum) / 3 - detA;

  const roots: number[] = [];
  const term1 = (q * q) / 4;
  const term2 = (p * p * p) / 27;
  const discriminant = term1 + term2;
  // Near-zero test for the discriminant is relative to the size of its terms.
  // A fixed absolute threshold is too tight for large entries and too loose for small ones.
  const discScale = Math.max(Math.abs(term1), Math.abs(term2), 1e-12);
  const discEps = discScale * 1e-9;

  if (Math.abs(discriminant) <= discEps) {
    const u = Math.cbrt(-q / 2);
    roots.push(2 * u, -u, -u);
  } else if (discriminant > discEps) {
    // Delta' > 0: one real root and a complex conjugate pair. Return an empty array,
    // same as eigenvalues2x2; eigen() handles this case separately.
    return { values: [], raw: [], radicals: [], isPerfectSquare: false, radicalParts: null };
  } else {
    const r = Math.sqrt((-p * p * p) / 27);
    const phi = Math.acos(Math.min(1, Math.max(-1, -q / (2 * r))));
    const mm = 2 * Math.sqrt(-p / 3);
    for (let k = 0; k < 3; k++) {
      roots.push(mm * Math.cos((phi - 2 * Math.PI * k) / 3));
    }
  }

  const rawValues = roots.map((x) => x + t / 3);
  const values = rawValues.map((x) => round(x));
  // Only genuinely radical values get a string; rational values stay null
  // and are formatted at display time using the current mode.
  const radicals = values.map((v) => tryRadical(v));
  // Exact radical eigenvectors are not computed for 3x3; eigen() falls back to the RREF-based path.
  return { values, raw: rawValues, radicals, isPerfectSquare: false, radicalParts: null };
}

/**
 * Computes a full basis of the null space of (A - λI) via RREF, one vector per free column.
 * This lets the caller assign distinct basis vectors to repeated eigenvalues.
 */
function eigenspaceBasis(a: MatrixData, lambda: number): number[][] {
  const n = a.length;
  const shifted: MatrixData = a.map((row, i) =>
    row.map((v, j) => (i === j ? v - lambda : v))
  );

  // Zero threshold relative to the matrix scale.
  const scale = Math.max(1, ...a.flat().map((v) => Math.abs(v)), Math.abs(lambda));
  const pivotEps = scale * 1e-6;

  const m = cloneMatrix(shifted);
  const pivots: { row: number; col: number; magnitude: number }[] = [];
  let pr = 0;
  for (let col = 0; col < n && pr < n; col++) {
    let maxRow = pr;
    for (let r = pr + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[maxRow][col])) maxRow = r;
    }
    if (Math.abs(m[maxRow][col]) < pivotEps) continue;

    if (maxRow !== pr) {
      [m[pr], m[maxRow]] = [m[maxRow], m[pr]];
    }
    const pv = m[pr][col];
    pivots.push({ row: pr, col, magnitude: Math.abs(pv) });
    m[pr] = m[pr].map((v) => v / pv);
    for (let r = 0; r < n; r++) {
      if (r === pr) continue;
      const f = m[r][col];
      if (Math.abs(f) > pivotEps) {
        m[r] = m[r].map((v, c) => v - f * m[pr][c]);
      }
    }
    pr++;
  }

  const pivotColSet = new Set(pivots.map((p) => p.col));
  const freeCols: number[] = [];
  for (let j = 0; j < n; j++) {
    if (!pivotColSet.has(j)) freeCols.push(j);
  }

  // There should be at least one free variable. If none is found, treat the weakest
  // pivot (smallest magnitude) as free. Filtering the pivots array keeps the
  // row/column mapping intact.
  let activePivots = pivots;
  if (freeCols.length === 0 && pivots.length > 0) {
    let weakestIdx = 0;
    for (let k = 1; k < pivots.length; k++) {
      if (pivots[k].magnitude < pivots[weakestIdx].magnitude) weakestIdx = k;
    }
    freeCols.push(pivots[weakestIdx].col);
    activePivots = pivots.filter((_, i) => i !== weakestIdx);
  } else if (freeCols.length === 0) {
    freeCols.push(n - 1);
  }

  // One basis vector per free column: set that column to 1 and the other free
  // columns to 0, then back-substitute from the pivot rows.
  const basis: number[][] = freeCols.map((freeCol) => {
    const vector = Array(n).fill(0);
    vector[freeCol] = 1;
    // Index by pivot.row to keep the RREF row/column mapping.
    for (let k = activePivots.length - 1; k >= 0; k--) {
      const { row, col: pivCol } = activePivots[k];
      let sum = 0;
      for (let j = 0; j < n; j++) {
        if (j !== pivCol) {
          sum += m[row][j] * vector[j];
        }
      }
      vector[pivCol] = -sum;
    }
    // Prefer a clean integer ratio between components (e.g. [4, 3] rather than [0.8, 0.6]).
    // Fall back to unit-length normalization only when the ratios are irrational.
    const nice = simplifyToNiceVector(vector);
    if (nice) return nice;
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    return norm > EPSILON ? vector.map((v) => round(v / norm)) : vector;
  });

  return basis;
}

/** İki tam sayının OBEB'i (Öklid algoritması). gcdInt(0, x) = |x|. */
function gcdInt(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/**
 * Reduces a raw eigenvector to its simplest integer ratio, e.g. [0.8, 0.6] -> [4, 3].
 * Returns null if no clean ratio exists.
 */
function simplifyToNiceVector(vector: number[]): number[] | null {
  const n = vector.length;
  // Sayısal kararlılık için referans (pivot): mutlak değeri en büyük bileşen.
  let pivotIdx = 0;
  for (let i = 1; i < n; i++) {
    if (Math.abs(vector[i]) > Math.abs(vector[pivotIdx])) pivotIdx = i;
  }
  if (Math.abs(vector[pivotIdx]) < EPSILON) return null;

  const fractions: { numerator: number; denominator: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ratio = vector[i] / vector[pivotIdx];
    const frac = toRationalApproximation(ratio);
    if (!frac || frac.denominator > 200) return null;
    fractions.push(frac);
  }

  // Ortak payda (LCM)
  let lcm = 1;
  for (const f of fractions) {
    lcm = (lcm * f.denominator) / gcdInt(lcm, f.denominator);
  }

  const scaled = fractions.map((f) => Math.round((f.numerator * lcm) / f.denominator));

  // En büyük ortak bölene böl
  let g = 0;
  for (const s of scaled) g = gcdInt(g, s);
  if (g === 0) return null;
  let result = scaled.map((s) => s / g);

  // İşaret kuralı: ilk sıfır olmayan bileşen pozitif olsun
  const firstNonZero = result.find((v) => Math.abs(v) > EPSILON);
  if (firstNonZero !== undefined && firstNonZero < 0) {
    result = result.map((v) => -v);
  }

  return result;
}

/**
 * Closed-form eigenvector for a 2x2 matrix whose discriminant is not a perfect square
 * (radical eigenvalue λ = (tr ± s√inside) / 2). Derived directly from (A - λI)v = 0
 * instead of RREF with decimal normalization:
 *
 *   a12 ≠ 0:         v = [a12, λ - a11]  ->  x2: [2a12, (a22 - a11) ± s√inside]
 *   a12 = 0, a21≠0:   v = [λ - a22, a21]  ->  x2: [(a11 - a22) ± s√inside, 2a21]
 *
 * A diagonal matrix never reaches this path; its discriminant is always a perfect square.
 */
function eigenvector2x2Radical(
  a: MatrixData,
  branchSign: 1 | -1,
  outside: number,
  inside: number
): { numeric: number[]; radicalStrings: string[] } | null {
  const a11 = a[0][0], a12 = a[0][1], a21 = a[1][0], a22 = a[1][1];
  const sqrtInside = Math.sqrt(inside);

  let rational0: number, coeff0: number, rational1: number, coeff1: number;
  if (Math.abs(a12) > EPSILON) {
    rational0 = 2 * a12;
    coeff0 = 0;
    rational1 = a22 - a11;
    coeff1 = branchSign * outside;
  } else if (Math.abs(a21) > EPSILON) {
    rational0 = a11 - a22;
    coeff0 = branchSign * outside;
    rational1 = 2 * a21;
    coeff1 = 0;
  } else {
    return null;
  }

  // Rational components (e.g. 1/3, 0.25): scale by the common denominator to get
  // integers. Scaling does not change the eigenvector direction.
  {
    const fr = [rational0, coeff0, rational1, coeff1].map((v) => toRationalApproximation(v));
    if (fr.every((f) => f !== null)) {
      const fs = fr as { numerator: number; denominator: number }[];
      const lcm = fs.reduce((l, f) => (l / gcdInt(l, f.denominator)) * f.denominator, 1);
      const scaled = fs.map((f) => Math.round(f.numerator * (lcm / f.denominator)));
      [rational0, coeff0, rational1, coeff1] = scaled;
    }
  }

  // Bileşenler tam sayıysa (yaygın durum: tam sayılı matris girdileri),
  // ortak bölene bölerek daha da sadeleştir.
  const allInt =
    Math.abs(rational0 - Math.round(rational0)) < EPSILON &&
    Math.abs(coeff0 - Math.round(coeff0)) < EPSILON &&
    Math.abs(rational1 - Math.round(rational1)) < EPSILON &&
    Math.abs(coeff1 - Math.round(coeff1)) < EPSILON;
  if (allInt) {
    rational0 = Math.round(rational0);
    coeff0 = Math.round(coeff0);
    rational1 = Math.round(rational1);
    coeff1 = Math.round(coeff1);
    const g = gcdInt(gcdInt(rational0, coeff0), gcdInt(rational1, coeff1));
    if (g > 1) {
      rational0 /= g;
      coeff0 /= g;
      rational1 /= g;
      coeff1 /= g;
    }
  }

  const numeric = [rational0 + coeff0 * sqrtInside, rational1 + coeff1 * sqrtInside];
  // formatLinearRadicalFraction turns the rational part into a clean p/q fraction
  // instead of embedding the raw decimal.
  const radicalStrings = [
    formatLinearRadicalFraction(rational0, coeff0, inside),
    formatLinearRadicalFraction(rational1, coeff1, inside),
  ];
  return { numeric, radicalStrings };
}

/**
 * Fraction version of formatLinearRadical: shows the rational part and the √inside
 * coefficient over a common denominator, e.g. rational=-0.5, coeff=-0.5, inside=61
 * -> "(-1 - √61) / 2".
 *
 * rational and coeff must be passed unrounded, otherwise toRationalApproximation
 * may not find a clean fraction.
 */
function formatLinearRadicalFraction(rational: number, coeff: number, inside: number): string {
  if (Math.abs(coeff) < EPSILON || inside <= 0) {
    const frac = toRationalApproximation(rational);
    if (frac && frac.denominator > 1) return `${frac.numerator}/${frac.denominator}`;
    return String(round(rational));
  }

  const rFrac = toRationalApproximation(rational) ?? { numerator: round(rational), denominator: 1 };
  const cFrac = toRationalApproximation(coeff) ?? { numerator: round(coeff), denominator: 1 };
  const den = (rFrac.denominator * cFrac.denominator) / gcdInt(rFrac.denominator, cFrac.denominator);
  const rNum = Math.round(rFrac.numerator * (den / rFrac.denominator));
  const cNum = Math.round(cFrac.numerator * (den / cFrac.denominator));

  const radicalPart = Math.abs(cNum) === 1 ? `√${inside}` : `${Math.abs(cNum)}√${inside}`;

  let core: string;
  if (rNum === 0) {
    core = cNum < 0 ? `-${radicalPart}` : radicalPart;
  } else if (cNum > 0) {
    core = `${rNum} + ${radicalPart}`;
  } else {
    core = `${rNum} - ${radicalPart}`;
  }

  return den === 1 ? core : `(${core}) / ${den}`;
}

/**
 * Returns the occurrence-th (0-based) independent eigenvector for an eigenvalue.
 * If the geometric multiplicity is smaller than the algebraic one (defective matrix),
 * the last basis vector is returned again.
 */
function eigenvectorFor(a: MatrixData, lambda: number, occurrence = 0): number[] {
  const basis = eigenspaceBasis(a, lambda);
  if (basis.length === 0) return Array(a.length).fill(0);
  const idx = Math.min(occurrence, basis.length - 1);
  return basis[idx];
}

export function eigen(a: MatrixData, lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  const fmtR = (v: number) => formatNumberWithRadical(v, mode);
  const { rows, cols } = dimensions(a);
  if (rows !== cols) return errorResult(S.eigenDimError());
  if (rows < 2 || rows > 3) {
    return errorResult(S.eigenSizeError());
  }

  const tr = round(a.reduce((s, row, i) => s + row[i], 0));
  const detA = round(determinantValue(a));

  const steps: SolutionStep[] = [
    { title: S.eigenCharPolyTitle(), description: S.eigenCharPolyDesc() },
    { title: S.eigenTraceDetTitle(), description: S.eigenTraceDetDesc(fmt(tr), fmt(detA)) },
  ];

  if (rows === 2) {
    const a11_0 = a[0][0], a12_0 = a[0][1], a21_0 = a[1][0], a22_0 = a[1][1];
    // Show det(A - λI) symbolically, with the matrix and its expansion.
    steps.push({
      title: S.eigenDetExpandTitle(),
      description: S.eigenDetExpandDesc(fmt(a11_0), fmt(a12_0), fmt(a21_0), fmt(a22_0), fmt(tr), fmt(detA)),
      matrixSnapshot: [
        [a11_0, a12_0],
        [a21_0, a22_0],
      ],
      matrixSnapshotLabels: [
        [`${fmt(a11_0)}−λ`, fmt(a12_0)],
        [fmt(a21_0), `${fmt(a22_0)}−λ`],
      ],
    });

    const disc = tr * tr - 4 * detA;
    const discStr = fmt(round(disc));
    steps.push({
      title: S.eigenChar2x2Title(),
      description: S.eigenChar2x2Desc(fmt(tr), fmt(detA)) + `\nΔ = İz² − 4·det = ${fmt(round(tr * tr))} − ${fmt(round(4 * detA))} = ${discStr}`,
    });
  } else {
    steps.push({ title: S.eigenChar3x3Title(), description: S.eigenChar3x3Desc() });
  }

  const eigenRes = rows === 2 ? eigenvalues2x2(a, mode) : eigenvalues3x3(a);
  // Decimal mode: no radical expressions or radical eigenvectors; radicals stays null
  // and eigenvectors come from the general RREF + normalize path.
  if (mode === 'decimal') {
    eigenRes.radicals = eigenRes.radicals.map(() => null);
    eigenRes.radicalParts = null;
  }
  if (eigenRes.values.length === 0) {
    // No real eigenvalues (2x2: delta < 0; 3x3: one real root plus a conjugate pair):
    // compute complex eigenvalues/eigenvectors numerically. The exact symbolic path
    // in symbolicOps.ts is tried first.
    return eigenComplexNumeric(a, lang, mode) ?? errorResult(S.eigenComplexError());
  }

  // Lambda label for step text: radicals[i] when radical, otherwise formatted with the current mode.
  const lambdaText = (i: number) => eigenRes.radicals[i] ?? formatNumber(eigenRes.values[i], mode);

  // For 2x2, also show the factored form of the polynomial, e.g. (λ + a)(λ - b) = 0.
  if (rows === 2) {
    steps.push({
      title: S.eigenFactoredTitle(),
      description: S.eigenFactoredDesc(lambdaText(0), lambdaText(1)),
    });
  }

  // Köklü ifadelerle göster
  steps.push({
    title: S.eigenFoundTitle(),
    description: S.eigenFoundDesc(eigenRes.values.map((_, i) => lambdaText(i)).join(', ')),
  });

  // Tekrarlı özdeğerleri birleştir
  const uniqueEigenvals: number[] = [];
  const seen = new Set<string>();
  for (const v of eigenRes.values) {
    const key = String(round(v, 4));
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEigenvals.push(v);
    }
  }

  // Occurrence index per eigenvalue, so repeated eigenvalues get distinct eigenspace basis vectors.
  const occurrenceCount = new Map<string, number>();

  // Symbolic radical eigenvectors (2x2 with irrational eigenvalues only), used in
  // step text and the final result when available.
  const eigenvectorRadicals: (string[] | undefined)[] = [];

  const eigenvectors = eigenRes.values.map((lambda, idx) => {
    // Use the full-precision lambda, not the displayed rounded one; otherwise
    // irrational eigenvalues can produce a wrong eigenvector.
    const preciseLambda = eigenRes.raw[idx] ?? lambda;
    const key = String(round(preciseLambda, 6));
    const occurrence = occurrenceCount.get(key) ?? 0;
    occurrenceCount.set(key, occurrence + 1);

    // 2x2 with radical eigenvalues: closed-form eigenvector instead of RREF + decimal normalization.
    const radicalVec =
      rows === 2 && !eigenRes.isPerfectSquare && eigenRes.radicalParts
        ? eigenvector2x2Radical(a, idx === 0 ? 1 : -1, eigenRes.radicalParts.outside, eigenRes.radicalParts.inside)
        : null;

    const lambdaLabel = lambdaText(idx);

    const a11 = a[0][0], a12 = a[0][1] ?? 0, a21 = a[1] ? a[1][0] : 0, a22 = a[1] ? a[1][1] : 0;
    const isIrrational = rows === 2 && !eigenRes.isPerfectSquare && !!eigenRes.radicalParts;
    const outside = eigenRes.radicalParts?.outside ?? 0;
    const inside = eigenRes.radicalParts?.inside ?? 0;
    const branchSign: 1 | -1 = idx === 0 ? 1 : -1;
    // λ'nın (rasyonel kısım, √inside katsayısı) biçiminde sembolik gösterimi
    // - yalnızca 2x2 için anlamlıdır.
    const lambdaRational = isIrrational ? tr / 2 : preciseLambda;
    const lambdaCoeff = isIrrational ? branchSign * (outside / 2) : 0;
    // For 2x2 matrices with both a12 and a21 non-zero, use a single equation with the
    // free variable set to 1 instead of a full RREF simulation (the rows are dependent
    // since det(A - λI) = 0). This is unsafe for triangular matrices, where the pivot
    // coefficient can be zero for one eigenvalue; those and diagonal matrices use the
    // general RREF path.
    const useSimplified2x2 = rows === 2 && Math.abs(a12) > EPSILON && Math.abs(a21) > EPSILON;

    let vec: number[];

    if (useSimplified2x2) {
      const entries: { r: number; c: number }[][] = [
        [{ r: a11 - lambdaRational, c: -lambdaCoeff }, { r: a12, c: 0 }],
        [{ r: a21, c: 0 }, { r: a22 - lambdaRational, c: -lambdaCoeff }],
      ];
      const sqrtInside = Math.sqrt(inside);
      const entryLabel = (e: { r: number; c: number }) =>
        isIrrational ? formatLinearRadicalFraction(e.r, e.c, inside) : fmt(round(e.r));
      const entryNumeric = (e: { r: number; c: number }) => round(e.r + e.c * sqrtInside);

      const shiftedLabels = entries.map((row) => row.map(entryLabel));
      const shiftedNumeric = entries.map((row) => row.map(entryNumeric));

      // Adım: (A - λI) matrisini oluştur - köklü ifadeyle (mümkünse)
      steps.push({
        title: S.eigenShiftedMatrixTitle(idx + 1, lambdaLabel),
        description: S.eigenShiftedMatrixDesc(lambdaLabel),
        matrixSnapshot: shiftedNumeric,
        matrixSnapshotLabels: shiftedLabels,
      });

      // Adım: tek denklemi yaz (satırlar bağımlı olduğundan biri yeter)
      const useRow0 = Math.abs(a12) > EPSILON;
      const eqRow = useRow0 ? entries[0] : entries[1];
      const eqStr = `(${entryLabel(eqRow[0])})·x1 + (${entryLabel(eqRow[1])})·x2`;
      steps.push({
        title: S.eigenEquationTitle(idx + 1, lambdaLabel),
        description: S.eigenEquationDesc(eqStr),
      });

      // Adım: serbest değişkeni 1 al
      const freeVar = useRow0 ? 2 : 1;
      const pivotVar = useRow0 ? 1 : 2;
      steps.push({
        title: S.eigenFreeVarSetTitle(freeVar),
        description: S.eigenFreeVarSetDesc(freeVar, pivotVar),
      });

      // Adım: diğer değişken için çöz: pivotVal = -coefFree / coefPivot
      // (Q(√inside) cismi içinde, eşlenikle çarparak bölme)
      const coefFree = useRow0 ? eqRow[1] : eqRow[0];
      const coefPivot = useRow0 ? eqRow[0] : eqRow[1];
      let pivotVal: { r: number; c: number };
      if (isIrrational) {
        const negFreeR = -coefFree.r, negFreeC = -coefFree.c;
        const denom = coefPivot.r * coefPivot.r - coefPivot.c * coefPivot.c * inside;
        pivotVal = {
          r: (negFreeR * coefPivot.r - negFreeC * coefPivot.c * inside) / denom,
          c: (negFreeC * coefPivot.r - negFreeR * coefPivot.c) / denom,
        };
      } else {
        pivotVal = { r: -coefFree.r / coefPivot.r, c: 0 };
      }
      const pivotValLabel = isIrrational
        ? formatLinearRadicalFraction(pivotVal.r, pivotVal.c, inside)
        : fmt(round(pivotVal.r));
      steps.push({
        title: S.eigenSolveOtherTitle(pivotVar),
        description: S.eigenSolveOtherDesc(pivotVar, pivotValLabel),
      });

      // Step: general solution as a vector in one parameter.
      const genVecParts = freeVar === 2 ? [pivotValLabel, `x${freeVar}`] : [`x${freeVar}`, pivotValLabel];
      steps.push({
        title: S.eigenGeneralSolutionTitle(),
        description: S.eigenGeneralSolutionDesc(freeVar, genVecParts.join(', ')),
      });

      // Step: solution set as multiples of a single vector.
      const setVecParts = freeVar === 2 ? [pivotValLabel, '1'] : ['1', pivotValLabel];
      steps.push({
        title: S.eigenSolutionSetTitle(),
        description: S.eigenSolutionSetDesc(setVecParts.join(', ')),
      });

      // Use the simplified eigenvector: closed form if available, otherwise the general RREF path.
      vec = radicalVec ? radicalVec.numeric : eigenvectorFor(a, preciseLambda, occurrence);
      eigenvectorRadicals.push(radicalVec?.radicalStrings);
      const vecLabel = (radicalVec?.radicalStrings ?? vec.map(fmtR)).join(', ');

      steps.push({
        title: S.eigenScaleTitle(),
        description: S.eigenScaleDesc(vecLabel),
      });
    } else {
      // General RREF simulation for 3x3 and diagonal 2x2 matrices, which can have several free variables.

      // Adım: (A - λI) matrisini oluştur
      const shifted: MatrixData = a.map((row, i) => row.map((v, j) => round(i === j ? v - preciseLambda : v)));
      steps.push({
        title: S.eigenShiftedMatrixTitle(idx + 1, lambdaLabel),
        description: S.eigenShiftedMatrixDesc(lambdaLabel),
        matrixSnapshot: shifted,
      });

      // Adım: (A - λI)v = 0 homojen sistemini RREF ile çöz
      steps.push({
        title: S.eigenRrefStartTitle(idx + 1, lambdaLabel),
        description: S.eigenRrefStartDesc(lambdaLabel),
      });

      // RREF'i adım adım göstermek için burada tekrar çalıştır
      const mRref = cloneMatrix(shifted);
      const n = mRref.length;
      const pivotColsForSteps: number[] = [];
      let pivotRow = 0;
      for (let col = 0; col < n && pivotRow < n; col++) {
        let maxR = pivotRow;
        for (let r = pivotRow + 1; r < n; r++) {
          if (Math.abs(mRref[r][col]) > Math.abs(mRref[maxR][col])) maxR = r;
        }
        const scaleEps = Math.max(1, ...a.flat().map((v) => Math.abs(v)), Math.abs(preciseLambda)) * 1e-6;
        if (Math.abs(mRref[maxR][col]) < scaleEps) continue;

        if (maxR !== pivotRow) {
          [mRref[pivotRow], mRref[maxR]] = [mRref[maxR], mRref[pivotRow]];
          steps.push({
            title: S.eigenRrefSwapTitle(pivotRow + 1, maxR + 1),
            description: S.eigenRrefSwapDesc(pivotRow + 1, maxR + 1),
            matrixSnapshot: roundMatrix(cloneMatrix(mRref)),
          });
        }

        const pv = mRref[pivotRow][col];
        if (Math.abs(pv - 1) > 1e-9) {
          mRref[pivotRow] = mRref[pivotRow].map((v) => v / pv);
          steps.push({
            title: S.eigenRrefNormTitle(pivotRow + 1, fmt(round(pv))),
            description: S.eigenRrefNormDesc(pivotRow + 1, fmt(round(pv))),
            matrixSnapshot: roundMatrix(cloneMatrix(mRref)),
          });
        }

        for (let r = 0; r < n; r++) {
          if (r === pivotRow) continue;
          const f = mRref[r][col];
          if (Math.abs(f) > 1e-9) {
            mRref[r] = mRref[r].map((v, c) => v - f * mRref[pivotRow][c]);
            steps.push({
              title: S.eigenRrefElimTitle(r + 1, pivotRow + 1),
              description: S.eigenRrefElimDesc(r + 1, fmt(round(f)), pivotRow + 1),
              matrixSnapshot: roundMatrix(cloneMatrix(mRref)),
            });
          }
        }
        pivotColsForSteps.push(col);
        pivotRow++;
      }

      // Serbest değişkenleri belirle
      const freeColsForSteps: number[] = [];
      for (let j = 0; j < n; j++) {
        if (!pivotColsForSteps.includes(j)) freeColsForSteps.push(j);
      }

      const pivotNames = pivotColsForSteps.map((c) => `x${c + 1}`).join(', ');
      const freeNames = freeColsForSteps.length > 0 ? freeColsForSteps.map((c) => `x${c + 1}`).join(', ') : `x${n}`;
      steps.push({
        title: S.eigenFreeVarsTitle(idx + 1),
        description: S.eigenFreeVarsDesc(pivotNames, freeNames),
      });

      // Asıl özvektörü hesapla (bu dalda radicalVec her zaman null'dır)
      vec = eigenvectorFor(a, preciseLambda, occurrence);
      eigenvectorRadicals.push(undefined);
      const vecLabel = vec.map(fmtR).join(', ');

      // Geri yerine koyma sonucu
      steps.push({
        title: S.eigenBackSubTitle(idx + 1, lambdaLabel),
        description: S.eigenBackSubDesc(lambdaLabel, vecLabel),
      });
    }

    // Doğrulama: A * v ≈ λ * v
    const Av = a.map((row) => round(row.reduce((s, v, j) => s + v * vec[j], 0)));
    const lambdaV = vec.map((v) => round(preciseLambda * v));
    const avText = `[${Av.map(fmtR).join(', ')}]`;
    const lvText = `[${lambdaV.map(fmtR).join(', ')}]`;
    // KESİRLİ mod: ondalık görünecekse sayılar gösterilmez (kullanıcı kesirli modda ondalık görmemeli).
    const verifyHasDecimal = mode === 'fraction' && /\d\.\d/.test(avText + lvText);
    steps.push({
      title: S.eigenVerifyTitle(idx + 1, lambdaLabel),
      description: verifyHasDecimal ? S.eigenVerifyExactDesc(lambdaLabel) : S.eigenVerifyDesc(lambdaLabel, avText, lvText),
    });

    return vec;
  });

  steps.push({ title: S.eigenResultTitle(), description: S.eigenResultDesc(eigenRes.values.length) });

  // Omit the field when there are no actual radical expressions.
  const hasRadicalVectors = eigenvectorRadicals.some((r) => r !== undefined);

  return {
    success: true,
    eigenResult: {
      eigenvalues: eigenRes.values,
      eigenvectors,
      radicalExpressions: eigenRes.radicals,
      eigenvectorRadicals: hasRadicalVectors ? eigenvectorRadicals : undefined,
    },
    steps,
  };
}

// ------------------------------------------------------------
// 10. DOĞRUSAL DENKLEM SİSTEMİ ÇÖZÜCÜ
// ------------------------------------------------------------

export function solveCramer(a: MatrixData, b: number[], lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  // Reject invalid or empty input so a 0 from determinantValue() is not reported as singular.
  if (!isValidMatrix(a)) return errorResult(S.invalidMatrixError());
  const { rows, cols } = dimensions(a);
  if (rows !== cols) return errorResult(S.cramerDimError());
  if (b.length !== rows) return errorResult(S.dimMismatchVector());

  const detA = determinantValue(a);
  const steps: SolutionStep[] = [{ title: S.cramerMainDetTitle(), description: S.cramerMainDetDesc(fmt(round(detA))) }];

  if (Math.abs(detA) < EPSILON) {
    return errorResult(S.cramerSingularError());
  }

  const solution: number[] = [];
  for (let i = 0; i < rows; i++) {
    const ai = a.map((row, r) => row.map((v, c) => (c === i ? b[r] : v)));
    const detAi = determinantValue(ai);
    const xi = round(detAi / detA);
    solution.push(xi);
    steps.push({ title: S.cramerXiTitle(i + 1), description: S.cramerXiDesc(i + 1, fmt(round(detAi)), fmt(round(detA)), fmt(xi)) });
  }

  steps.push({ title: S.solutionTitle(), description: S.solutionDesc(solution.map(fmt).join(', ')) });
  return { success: true, vectorResult: solution, steps };
}

export function solveGauss(a: MatrixData, b: number[], lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  const S = strings(lang);
  const fmt = (v: number) => formatNumber(v, mode);
  const { rows, cols } = dimensions(a);
  if (b.length !== rows) return errorResult(S.dimMismatchVector());

  const augmented = a.map((row, i) => [...row, b[i]]);
  const { result, steps, pivotCount: rankAugmented } = rref(augmented, lang, mode);
  // The solution type is decided by comparing rank(A) with rank([A|b]);
  // rank(A) comes from A's own RREF, without the b column.
  const { pivotCount: rankA } = rref(a, lang, mode);

  const finalSteps = [...steps];

  if (rankA < rankAugmented) {
    finalSteps.push({ title: S.inconsistentTitle(), description: S.inconsistentDesc() });
    return { success: false, errorMessage: S.inconsistentError(), steps: finalSteps };
  }

  if (rankA < cols) {
    finalSteps.push({ title: S.infiniteTitle(), description: S.infiniteDesc(rankA, cols) });
    return { success: false, errorMessage: S.infiniteError(), steps: finalSteps };
  }

  // rankA === cols: unique solution. Every column has a pivot, so unknown j is
  // result[j][cols]. Only the first cols rows are used; extra equations only add zero rows.
  const solution = result.slice(0, cols).map((row) => round(row[cols]));
  finalSteps.push({ title: S.uniqueSolutionTitle(), description: S.solutionDesc(solution.map(fmt).join(', ')) });
  return { success: true, vectorResult: solution, steps: finalSteps };
}

export function solveLinearSystem(a: MatrixData, b: number[], method: 'cramer' | 'gauss' = 'gauss', lang: LanguageCode = 'tr', mode: NumberDisplayMode = 'decimal'): OperationResult {
  return method === 'cramer' ? solveCramer(a, b, lang, mode) : solveGauss(a, b, lang, mode);
}

// ------------------------------------------------------------
// GENEL HATA SONUCU ÜRETİCİ
// ------------------------------------------------------------

function errorResult(message: string): OperationResult {
  return { success: false, errorMessage: message, steps: [] };
}
