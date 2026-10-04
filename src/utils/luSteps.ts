import { LanguageCode, MatrixData, SolutionStep } from '@/types';
import { strings } from './matrixStepText';

// Single producer of the PA = LU step output (the decimal/fraction, symbolic and complex engines
// all use it). The engine finds P, L, U by elimination with partial pivoting; this file explains
// the result in Doolittle form:
//   U[i][j] = PA[i][j] − Σ_{k<i} L[i][k]·U[k][j]
//   L[r][i] = (PA[r][i] − Σ_{k<i} L[r][k]·U[k][i]) / U[i][i]
// The formulas use the actual numbers of that step and give exactly the same result as elimination.

export interface LuMat {
  num: MatrixData;
  lab: string[][];
}

export interface LuSwapInfo {
  /** Hangi adımda (0 tabanlı sütun/satır indeksi) değişim yapıldı */
  step: number;
  /** Değiştirilen iki satır (0 tabanlı): step ↔ to */
  to: number;
}

export interface LuStepInput {
  lang: LanguageCode;
  n: number;
  A: LuMat;
  P: MatrixData;
  PA: LuMat;
  L: LuMat;
  U: LuMat;
  /** Her adımdaki pivot adayları (i. sütunun i. satırdan itibaren değerleri, etiketli) */
  candidates: string[][];
  swaps: LuSwapInfo[];
  /** true: pivot = mutlak değerce en büyük aday; false: başka bir kural (sembolik) */
  maxAbs: boolean;
}

const SIMPLE = /^\d+(\.\d+)?$/;
const par = (s: string) => (SIMPLE.test(s) ? s : `(${s})`);

function identityNum(n: number): MatrixData {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

function zerosLab(n: number): string[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => '0'));
}

export function buildLuSteps(inp: LuStepInput): SolutionStep[] {
  const { lang, n, A, P, PA, L, U, candidates, swaps, maxAbs } = inp;
  const tr = lang !== 'en';
  const S = strings(lang);
  const steps: SolutionStep[] = [];

  steps.push({
    title: S.luStartTitle(),
    description: S.luStartDesc(),
    matrixSnapshot: A.num,
    matrixSnapshotLabels: A.lab,
  });

  // Adım adım ilerlerken gösterilecek U (yalnızca şimdiye dek dolan satırlar)
  const Unum: MatrixData = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  const Ulab = zerosLab(n);

  // Şimdiye dek uygulanan satır değişimlerine göre P'nin ara hali
  const Pnow = identityNum(n);

  for (let i = 0; i < n; i++) {
    const cand = candidates[i] ?? [];
    const sw = swaps.find((s) => s.step === i);
    const candText = cand.join(', ');

    if (sw) {
      [Pnow[i], Pnow[sw.to]] = [Pnow[sw.to], Pnow[i]];
      const chosen = cand[sw.to - i] ?? '';
      steps.push({
        title: S.luPivotTitle(),
        description: tr
          ? `${i + 1}. sütunun ${i + 1}. satırdan itibaren adayları: ${candText}.\n` +
            (maxAbs
              ? `Mutlak değerce en büyük aday ${chosen} (${sw.to + 1}. satır). Çarpanlar (|L| ≤ 1) küçük kalsın diye bu satır pivot olur: R${i + 1} ↔ R${sw.to + 1}.`
              : `Pivot olarak ${chosen} (${sw.to + 1}. satır) seçildi: R${i + 1} ↔ R${sw.to + 1}.`) +
            `\nP matrisinin o anki hali aşağıda (P·A, A'nın satırlarını bu sırayla dizer).`
          : `Candidates in column ${i + 1} from row ${i + 1} down: ${candText}.\n` +
            (maxAbs
              ? `The largest in absolute value is ${chosen} (row ${sw.to + 1}). It becomes the pivot so the multipliers (|L| ≤ 1) stay small: R${i + 1} ↔ R${sw.to + 1}.`
              : `${chosen} (row ${sw.to + 1}) was chosen as the pivot: R${i + 1} ↔ R${sw.to + 1}.`) +
            `\nThe current P matrix is shown below (P·A lists the rows of A in this order).`,
        matrixSnapshot: Pnow.map((r) => r.slice()),
      });
    }

    const lines: string[] = [];
    if (!sw && n > 1 && i < n - 1 && cand.length > 1) {
      lines.push(
        tr
          ? `Pivot adayları: ${candText} → en büyüğü zaten ${i + 1}. satırda, satır değişimi gerekmedi.`
          : `Pivot candidates: ${candText} → the largest is already in row ${i + 1}; no swap needed.`
      );
    }
    for (let j = i; j < n; j++) {
      const a = PA.lab[i][j];
      const uij = U.lab[i][j];
      if (i === 0) {
        lines.push(`U[${i + 1}][${j + 1}] = PA[${i + 1}][${j + 1}] = ${uij}`);
      } else {
        const terms = Array.from({ length: i }, (_, k) => `${par(L.lab[i][k])}·${par(U.lab[k][j])}`).join(' + ');
        lines.push(`U[${i + 1}][${j + 1}] = ${a} − (${terms}) = ${uij}`);
      }
    }
    for (let r = i + 1; r < n; r++) {
      const a = PA.lab[r][i];
      const lri = L.lab[r][i];
      const pv = par(U.lab[i][i]);
      if (i === 0) {
        lines.push(`L[${r + 1}][${i + 1}] = PA[${r + 1}][${i + 1}] / U[${i + 1}][${i + 1}] = ${a} / ${pv} = ${lri}`);
      } else {
        const terms = Array.from({ length: i }, (_, k) => `${par(L.lab[r][k])}·${par(U.lab[k][i])}`).join(' + ');
        lines.push(`L[${r + 1}][${i + 1}] = (${a} − (${terms})) / ${pv} = ${lri}`);
      }
    }
    for (let j = i; j < n; j++) {
      Unum[i][j] = U.num[i][j];
      Ulab[i][j] = U.lab[i][j];
    }
    steps.push({
      title: S.luStepTitle(i + 1),
      description: lines.join('\n'),
      matrixSnapshot: Unum.map((r) => r.slice()),
      matrixSnapshotLabels: Ulab.map((r) => r.slice()),
    });
  }

  steps.push({
    title: tr ? 'Permütasyon matrisi P' : 'Permutation matrix P',
    description: tr
      ? 'Yapılan tüm satır değişimlerinin birleşimi. Her satırda tek bir 1 vardır: i. satırdaki 1, P·A\'nın i. satırına A\'nın hangi satırının geldiğini gösterir.'
      : 'The combination of all row swaps. Each row has a single 1: the 1 in row i tells which row of A ends up as row i of P·A.',
    matrixSnapshot: P,
  });
  steps.push({
    title: 'P·A',
    description: tr ? 'A\'nın satırları P\'ye göre yeniden dizildi; LU bu matris üzerinde kuruldu.' : 'The rows of A reordered by P; the LU factorization is built on this matrix.',
    matrixSnapshot: PA.num,
    matrixSnapshotLabels: PA.lab,
  });
  steps.push({
    title: tr ? 'L (alt üçgen)' : 'L (lower triangular)',
    description: tr ? 'Köşegeni 1 olan alt üçgen matris; eliminasyon çarpanlarını tutar.' : 'Unit lower triangular matrix holding the elimination multipliers.',
    matrixSnapshot: L.num,
    matrixSnapshotLabels: L.lab,
  });
  steps.push({
    title: tr ? 'U (üst üçgen)' : 'U (upper triangular)',
    description: tr ? 'Eliminasyon sonunda elde edilen üst üçgen matris.' : 'The upper triangular matrix obtained after elimination.',
    matrixSnapshot: U.num,
    matrixSnapshotLabels: U.lab,
  });
  steps.push({ title: S.luResultTitle(), description: S.luResultDesc() });
  return steps;
}

/** P'nin satırlarına göre A'nın satır indekslerini verir: PA[i] = A[perm[i]] */
export function permFromP(P: MatrixData): number[] {
  return P.map((row) => row.findIndex((v) => v === 1));
}
