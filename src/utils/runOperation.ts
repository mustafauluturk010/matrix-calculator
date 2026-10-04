import { MatrixData, OperationResult, OperationType, LanguageCode } from '@/types';
import { formatNumber, numberToInputText, NumberDisplayMode } from '@/utils/numberFormat';
import { translations } from '@/i18n/translations';
import { trySymbolicOperation, trySymbolicEigen, SymbolicInputs } from '@/utils/symbolicOps';
import { tryComplexOperation, tryLargeEigen } from '@/utils/complexOps';
import { tryFracOperation } from '@/utils/fracOps';
import {
  add,
  subtract,
  scalarMultiply,
  multiply,
  determinant,
  inverse,
  transpose,
  trace,
  rank,
  rrefOperation,
  gaussElimination,
  eigen,
  luDecomposition,
  matrixPower,
  solveLinearSystem,
} from '@/utils/matrixUtils';


/** Sonuç ekranında görünecek özdeğer/özvektör metinlerinde ondalık sayı var mı? */
function eigenHasDecimal(r: OperationResult, mode: NumberDisplayMode): boolean {
  const e = r.eigenResult;
  if (!e) return false;
  const f = (v: number) => formatNumber(v, mode);
  const lam = e.eigenvalues.map((v, i) => e.radicalExpressions?.[i] ?? f(v));
  const vec = e.eigenvectors.flatMap((v, i) => e.eigenvectorRadicals?.[i] ?? v.map(f));
  return [...lam, ...vec].some((x) => /\d\.\d/.test(x));
}

export function runOperation(
  type: OperationType,
  matrixA: MatrixData,
  matrixB: MatrixData,
  scalar: number,
  exponent: number,
  vectorB: number[],
  linearMethod: 'cramer' | 'gauss',
  lang: LanguageCode,
  mode: NumberDisplayMode,
  // Symbolic engine (optional): raw cell texts. For input containing π/√ and supported
  // operations, the result is computed symbolically instead of being converted to decimals.
  // If absent or not applicable (null), the numeric engine runs unchanged.
  sym?: SymbolicInputs
): OperationResult {
  // KARMAŞIK SAYI MODU: girişlerde `i` varsa (Ayarlar → Karmaşık sayı modu) tüm
  // işlemler karmaşık motorda çalışır; `i` yoksa null döner ve akış aynen sürer.
  if (sym?.complex) {
    const cx = tryComplexOperation(type, matrixA, matrixB, sym, lang, mode);
    if (cx) return cx;
  }
  // Hermitian eşlenik transpoz: girişlerde `i` yoksa (hepsi gerçel) eşlenik değişmez,
  // yani Aᴴ = Aᵀ. Transpoz motoruna devredilir, yalnızca açıklama düzeltilir.
  if (type === 'hermitian') {
    const r = runOperation('transpose', matrixA, matrixB, scalar, exponent, vectorB, linearMethod, lang, mode, sym);
    if (r.success && r.steps.length > 0) {
      const first = r.steps[0];
      r.steps = [
        {
          ...first,
          description:
            lang === 'en'
              ? 'Hermitian conjugate transpose: Aᴴ = (Ā)ᵀ. All entries are real, so conjugation changes nothing and Aᴴ = Aᵀ: rows become columns.'
              : 'Hermitian eşlenik transpoz: Aᴴ = (Ā)ᵀ. Tüm elemanlar gerçel olduğu için eşlenik almak bir şeyi değiştirmez ve Aᴴ = Aᵀ olur: satırlar sütun olur.',
        },
        ...r.steps.slice(1),
      ];
    }
    return r;
  }
  // ONDALIK MOD: sonuçlarda köklü/π'li sembolik ifade YOKTUR; π ve √ içeren girişler de
  // sayıya çevrilip sayısal motorda hesaplanır, çıktı seçili basamak sayısıyla yazılır.
  // (Sembolik/rasyonel-fonksiyon motorları yalnızca KESİRLİ modda devreye girer.)
  const decimalMode = mode === 'decimal';
  const symbolic = decimalMode ? null : trySymbolicOperation(type, matrixA, matrixB, sym, lang, mode);
  if (symbolic) return symbolic;
  // SymNum yolu bölemediyse (çok terimli π+kök pivot/bölen, hücrede 1/(π+√2)) rasyonel
  // fonksiyon (SymFrac) cismi üzerinde aynı işlemler; olmazsa ondalık motor.
  const frac = decimalMode ? null : tryFracOperation(type, matrixA, matrixB, sym, lang, mode);
  if (frac) return frac;
  switch (type) {
    case 'add':
      return add(matrixA, matrixB, lang, mode);
    case 'subtract':
      return subtract(matrixA, matrixB, lang, mode);
    case 'scalarMultiply':
      return scalarMultiply(matrixA, scalar, lang, mode);
    case 'multiply':
      return multiply(matrixA, matrixB, lang, mode);
    case 'determinant':
      return determinant(matrixA, lang, mode);
    case 'inverse':
      return inverse(matrixA, lang, mode);
    case 'transpose':
      return transpose(matrixA, lang, mode);
    case 'trace':
      return trace(matrixA, lang, mode);
    case 'rank':
      return rank(matrixA, lang, mode);
    case 'rref':
      return rrefOperation(matrixA, lang, mode);
    case 'gaussElimination':
      return gaussElimination(matrixA, lang, mode);
    case 'eigen': {
      // Sembolik motor 'eigen' için SYMBOLIC_OPERATIONS listesinde YOKTUR
      // (sonuç biçimi farklı - eigenResult), bu yüzden ayrıca çağrılır.
      // 2x2 ve 3x3 + π/√ içeren girişlerde tam sembolik hesaplar (bkz.
      // symbolicOps.ts); aksi halde (null) mevcut ondalık motor AYNEN çalışır.
      const symEigen = sym && !decimalMode ? trySymbolicEigen(matrixA, sym, lang, mode) : null;
      if (symEigen) return symEigen;
      // 4x4 ve üzeri: genel motor (kesin karakteristik polinom + kök tanıma; olmazsa
      // sayısal karmaşık QR). Bkz. eigenGeneral.ts.
      if (matrixA.length >= 4) {
        const large = tryLargeEigen(matrixA, sym, lang, mode);
        if (large) return large;
      }
      // KESİRLİ mod: kullanıcı hiçbir yerde ondalık görmemeli. Sayısal motorun sonucu
      // ondalık içeriyorsa (ör. 2±√10 özdeğerleri, normalize özvektörler) kesin cisimli
      // genel motor denenir: "2 + √10", "7/3 + 2√10/3" gibi TAM biçim verirse o kullanılır.
      // Kesin motor başarısız olursa ya da o da ondalık üretirse (ör. indirgenemez kübik)
      // sayısal sonuç AYNEN döner.
      if (mode === 'fraction' && (matrixA.length === 2 || matrixA.length === 3)) {
        const numeric = eigen(matrixA, lang, mode);
        if (numeric.success && eigenHasDecimal(numeric, mode)) {
          const exactSym = sym?.A ? sym : { ...(sym ?? {}), A: matrixA.map((row) => row.map((v) => numberToInputText(v))) };
          const exact = tryLargeEigen(matrixA, exactSym, lang, mode);
          if (exact && exact.success && !eigenHasDecimal(exact, mode)) return exact;
        }
        return numeric;
      }
      return eigen(matrixA, lang, mode);
    }
    case 'lu':
      return luDecomposition(matrixA, lang, mode);
    case 'power':
      return matrixPower(matrixA, exponent, lang, mode);
    case 'solveLinearSystem':
      return solveLinearSystem(matrixA, vectorB, linearMethod, lang, mode);
    default:
      // Use the existing 'unknownOperation' translation for `lang`; useTranslation() is a hook
      // and cannot be called here.
      return { success: false, errorMessage: translations[lang].unknownOperation, steps: [] };
  }
}
