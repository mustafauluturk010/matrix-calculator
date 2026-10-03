
/** Matris veri tipi: number[satır][sütun] */
export type MatrixData = number[][];

/** Kaydedilmiş, isimlendirilmiş matris (A, B, C ...) */
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

/** Desteklenen matris işlemleri */
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

/** Adım adım çözüm için tek bir işlem adımı */
export interface SolutionStep {
  title: string;
  description: string;
  matrixSnapshot?: MatrixData;
  /** matrixSnapshot ile aynı boyutta, hücre başına ÖNCEDEN FORMATLANMIŞ
   *  (örn. köklü ifade içeren) etiketler. Mevcutsa, görüntüleme
   *  bileşenleri matrixSnapshot'ı sayısal olarak formatlamak yerine bu
   *  etiketleri kullanır - böylece örn. (A-λI) gibi irrasyonel/köklü
   *  içeren matrisler doğru sembolik biçimde gösterilebilir. */
  matrixSnapshotLabels?: string[][];
  extra?: string;
}

/** Bir işlemin genel sonucu */
export interface OperationResult {
  success: boolean;
  errorMessage?: string;
  scalarResult?: number;
  matrixResult?: MatrixData;
  /** SEMBOLİK MOTOR (bkz. utils/symbolic.ts, symbolicOps.ts): sonuç tam
   *  sembolik hesaplandıysa (π/√ içeren girişler), matrixResult/scalarResult
   *  yalnızca sayısal YAKLAŞIKLIKTIR; gösterimde bu etiketler kullanılır
   *  ("√2 + √3" gibi). Alanlar yoksa gösterim eskisi gibi formatNumber ile. */
  matrixResultLabels?: string[][];
  scalarResultLabel?: string;
  /** Aynı sembolik sonucun LaTeX (matematik modu) karşılıkları. */
  matrixResultLatex?: string[][];
  scalarResultLatex?: string;
  /** Sembolik denklem çözümü: vectorResult için etiket / LaTeX karşılıkları. */
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
    /** Her özvektör için, mümkünse (2x2 + irrasyonel özdeğer durumunda)
     *  bileşen başına köklü ifade string'leri. Yoksa/uygulanamıyorsa
     *  ilgili giriş undefined'dır ve sayısal `eigenvectors` değeri
     *  formatNumberWithRadical ile gösterilir. */
    eigenvectorRadicals?: (string[] | undefined)[];
  };
  luResult?: { L: MatrixData; U: MatrixData; P?: MatrixData };
  latexResult?: string;
  steps: SolutionStep[];
}

/** Bir işlemin tüm girdi durumu - geçmişten yeniden düzenlenebilmesi için saklanır */
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

/** Geçmiş listesindeki bir kayıt */
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
