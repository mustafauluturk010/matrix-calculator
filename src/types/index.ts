
/** Matris veri tipi: number[satır][sütun] */
export type MatrixData = number[][];

export interface NamedMatrix {
  id: string;
  name: string;
  rows: number;
  cols: number;
  data: MatrixData;
  /** Yalnızca karmaşık sayılı matrislerde: hücrelerin ham metni (`3+2i`); data gerçel kısımlardır. */
  texts?: string[][];
  createdAt: number;
}

export type OperationType =
  | 'add'
  | 'subtract'
  | 'scalarMultiply'
  | 'multiply'
  | 'determinant'
  | 'inverse'
  | 'transpose'
  | 'hermitian'
  | 'trace'
  | 'rank'
  | 'rref'
  | 'gaussElimination'
  | 'eigen'
  | 'lu'
  | 'power'
  | 'solveLinearSystem';

export interface SolutionStep {
  title: string;
  description: string;
  matrixSnapshot?: MatrixData;
  /** Hücre başına önceden formatlanmış etiketler (matrixSnapshot ile aynı boyut). Varsa
   * görüntüleme matrixSnapshot'ı sayısal formatlamak yerine bunları kullanır; böylece
   * (A-λI) gibi köklü matrisler sembolik biçimde gösterilebilir. */
  matrixSnapshotLabels?: string[][];
  extra?: string;
}

export interface OperationResult {
  success: boolean;
  errorMessage?: string;
  scalarResult?: number;
  matrixResult?: MatrixData;
  /** Sembolik motor (utils/symbolic.ts, symbolicOps.ts) sonucu tam sembolik hesapladıysa
   * (π/√ içeren girişler), matrixResult/scalarResult yalnızca sayısal yaklaşıklıktır ve
   * gösterimde bu etiketler kullanılır. Alanlar yoksa gösterim formatNumber iledir. */
  matrixResultLabels?: string[][];
  scalarResultLabel?: string;
  matrixResultLatex?: string[][];
  scalarResultLatex?: string;
  vectorResultLabels?: string[];
  vectorResultLatex?: string[];
  /** Sembolik LU: L ve U için hücre etiketleri (luResult sayısal yaklaşıklıktır). */
  luResultLabels?: { L: string[][]; U: string[][] };
  vectorResult?: number[];
  eigenResult?: {
    /** Gerçel özdeğerler; karmaşık özdeğerde GERÇEL KISIM (sanal kısım eigenvaluesIm'de). */
    eigenvalues: number[];
    eigenvectors: number[][];
    /** Yalnızca karmaşık özdeğer varsa: sanal kısımlar (eigenvalues ile aynı uzunlukta). */
    eigenvaluesIm?: number[];
    /** Yalnızca karmaşık özdeğer varsa: özvektör bileşenlerinin sanal kısımları. */
    eigenvectorsIm?: number[][];
    // null means the eigenvalue is rational and is formatted at display time using the current numberDisplayMode.
    radicalExpressions?: (string | null)[];
    /** Her özvektör için (2x2 + irrasyonel özdeğer durumunda) bileşen başına köklü ifade
     * string'leri. Yoksa girişi undefined'dır ve sayısal `eigenvectors` değeri
     * formatNumberWithRadical ile gösterilir. */
    eigenvectorRadicals?: (string[] | undefined)[];
  };
  luResult?: { L: MatrixData; U: MatrixData; P?: MatrixData };
  latexResult?: string;
  steps: SolutionStep[];
}

export interface OperationInputSnapshot {
  matrixA: MatrixData;
  matrixB: MatrixData;
  scalar: string;
  exponent: string;
  vectorB: string[];
  linearMethod: 'cramer' | 'gauss';
  /** Hücrelerin ham giriş metni (sembolik girişleri - "√2", "pi/2" - geçmişten
   *  yeniden hesaplarken kaybetmemek için). Eski kayıtlarda yoktur. */
  matrixAText?: string[][];
  matrixBText?: string[][];
  /** İşlem KARMAŞIK SAYI MODUNDA yapıldı (hücre metinleri `3+2i` gibi olabilir). */
  complex?: boolean;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  operation: OperationType;
  operationLabel: string;
  inputSummary: string;
  result: OperationResult;
  inputs: OperationInputSnapshot;
}

export type ThemeMode = 'light' | 'dark';
export type LanguageCode = 'tr' | 'en';
