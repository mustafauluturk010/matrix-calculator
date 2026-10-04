import { LanguageCode } from '@/types';

/** Adım metinlerindeki değerler ham `number` ya da ondalık/kesir ayarına göre önceden formatlanmış
 * `string` olarak gelebilir; böylece detaylı çözüm sayıları da görünüm ayarına uyar. */
type Num = number | string;

// TR/EN step titles/descriptions and error messages for matrixUtils.ts; keeps the engine language-independent.


/** Negatif / kesirli / köklü değerleri formül içinde parantezle sarar: 3 -> 3, -2 -> (-2), 1/2 -> (1/2) */
function wrap(v: Num): string {
  const t = String(v);
  return /^\d+(\.\d+)?$/.test(t) ? t : `(${t})`;
}

function pick<T>(lang: LanguageCode, tr: T, en: T): T {
  return lang === 'en' ? en : tr;
}

export function strings(lang: LanguageCode) {
  return {
    dimMismatchVector: () =>
      pick(lang, "b vektörünün boyutu, A matrisinin satır sayısına eşit olmalıdır.", "The size of vector b must equal the number of rows of matrix A."),
    invalidMatrixError: () =>
      pick(
        lang,
        'Matris boş veya geçersiz (sayısal olmayan ya da sonsuz bir değer içeriyor).',
        'The matrix is empty or invalid (it contains a non-numeric or infinite value).'
      ),

    addDimError: () =>
      pick(lang, 'Toplama işlemi için matrislerin boyutları aynı olmalıdır.', 'Matrices must have the same dimensions for addition.'),
    subtractDimError: () =>
      pick(lang, 'Çıkarma işlemi için matrislerin boyutları aynı olmalıdır.', 'Matrices must have the same dimensions for subtraction.'),
    addSubDimCheckTitle: () => pick(lang, 'Boyut Kontrolü', 'Dimension Check'),
    addDimCheckDesc: (r1: Num, c1: Num, r2: Num, c2: Num) =>
      pick(
        lang,
        `A (${r1}×${c1}) ve B (${r2}×${c2}) aynı boyutta olduğu için toplama yapılabilir.\nKural: toplama, iki matrisin AYNI konumdaki elemanları arasında yapılır.\nC[i][j] = A[i][j] + B[i][j]`,
        `A (${r1}×${c1}) and B (${r2}×${c2}) have the same size, so addition is possible.\nRule: addition is done between entries in the SAME position of the two matrices.\nC[i][j] = A[i][j] + B[i][j]`
      ),
    subtractDimCheckDesc: (r1: Num, c1: Num, r2: Num, c2: Num) =>
      pick(
        lang,
        `A (${r1}×${c1}) ve B (${r2}×${c2}) aynı boyutta olduğu için çıkarma yapılabilir.\nKural: çıkarma, iki matrisin AYNI konumdaki elemanları arasında yapılır.\nC[i][j] = A[i][j] − B[i][j]`,
        `A (${r1}×${c1}) and B (${r2}×${c2}) have the same size, so subtraction is possible.\nRule: subtraction is done between entries in the SAME position of the two matrices.\nC[i][j] = A[i][j] − B[i][j]`
      ),
    cellCalcTitle: (i: Num, j: Num) => pick(lang, `C[${i}][${j}] hesapla`, `Compute C[${i}][${j}]`),
    addCellDesc: (i: Num, j: Num, av: Num, bv: Num, sum: Num) =>
      pick(lang, `A[${i}][${j}] + B[${i}][${j}] = ${av} + ${bv} = ${sum}`, `A[${i}][${j}] + B[${i}][${j}] = ${av} + ${bv} = ${sum}`),
    subtractCellDesc: (i: Num, j: Num, av: Num, bv: Num, diff: Num) =>
      pick(lang, `A[${i}][${j}] - B[${i}][${j}] = ${av} - ${bv} = ${diff}`, `A[${i}][${j}] - B[${i}][${j}] = ${av} - ${bv} = ${diff}`),
    addResultTitle: () => pick(lang, 'Sonuç Matrisi', 'Result Matrix'),
    addResultDesc: () => pick(lang, 'Tüm elemanlar tek tek toplanarak sonuç matrisi elde edildi.', 'All elements were added individually to obtain the result matrix.'),
    subtractResultDesc: () => pick(lang, 'Tüm elemanlar tek tek çıkarılarak sonuç matrisi elde edildi.', 'All elements were subtracted individually to obtain the result matrix.'),

    scalarStartTitle: () => pick(lang, 'Skaler Çarpma Başlıyor', 'Scalar Multiplication Starts'),
    scalarStartDesc: (scalar: Num) =>
      pick(
        lang,
        `Skaler çarpmada matrisin HER elemanı aynı sayıyla (k = ${scalar}) çarpılır.\nC[i][j] = k · A[i][j]`,
        `In scalar multiplication EVERY entry of the matrix is multiplied by the same number (k = ${scalar}).\nC[i][j] = k · A[i][j]`
      ),
    scalarCellDesc: (scalar: Num, i: Num, j: Num, av: Num, product: Num) =>
      pick(lang, `${scalar} * A[${i}][${j}] = ${scalar} * ${av} = ${product}`, `${scalar} * A[${i}][${j}] = ${scalar} * ${av} = ${product}`),
    scalarResultTitle: () => pick(lang, 'Sonuç', 'Result'),
    scalarResultDesc: () => pick(lang, 'Skaler çarpma tamamlandı.', 'Scalar multiplication complete.'),

    multiplyDimError: (c1: Num, r2: Num) =>
      pick(lang, `Çarpım için A'nın sütun sayısı (${c1}) B'nin satır sayısına (${r2}) eşit olmalıdır.`, `For multiplication, A's column count (${c1}) must equal B's row count (${r2}).`),
    multiplyDimCheckDesc: (r1: Num, c1: Num, r2: Num, c2: Num) =>
      pick(
        lang,
        `A (${r1}×${c1}) · B (${r2}×${c2}) → Sonuç (${r1}×${c2})\nKural: A'nın sütun sayısı (${c1}) B'nin satır sayısına (${r2}) eşit olmalıdır; sonuç, A'nın satır sayısı × B'nin sütun sayısı boyutundadır.\nC[i][j] değeri, A'nın i. satırı ile B'nin j. sütununun karşılıklı elemanlarının çarpılıp toplanmasıyla (nokta çarpım) bulunur.`,
        `A (${r1}×${c1}) · B (${r2}×${c2}) → Result (${r1}×${c2})\nRule: A's column count (${c1}) must equal B's row count (${r2}); the result has A's row count × B's column count.\nC[i][j] is found by multiplying the matching entries of row i of A and column j of B and adding them up (dot product).`
      ),
    multiplyResultDesc: () => pick(lang, 'Matris çarpımı tamamlandı.', 'Matrix multiplication complete.'),

    transposeStartTitle: () => pick(lang, 'Transpoz Başlıyor', 'Transpose Starts'),
    transposeStartDesc: (cols: Num, rows: Num) =>
      pick(lang, `A'nın satırları Aᵀ'nin sütunları olacak: Aᵀ[j][i] = A[i][j]. Sonuç boyutu ${cols}x${rows} olacak.`, `A's rows become Aᵀ's columns: Aᵀ[j][i] = A[i][j]. The result size will be ${cols}x${rows}.`),
    transposeCellTitle: (j: Num, i: Num) => pick(lang, `Aᵀ[${j}][${i}] hesapla`, `Compute Aᵀ[${j}][${i}]`),
    transposeCellDesc: (i: Num, j: Num, val: Num, j2: Num, i2: Num) =>
      pick(lang, `A[${i}][${j}] = ${val} değeri, Aᵀ[${j2}][${i2}] konumuna taşınır.`, `The value A[${i}][${j}] = ${val} is moved to position Aᵀ[${j2}][${i2}].`),
    transposeResultTitle: () => pick(lang, 'Sonuç: Aᵀ', 'Result: Aᵀ'),
    transposeResultDesc: () => pick(lang, 'Tüm elemanlar karşılıklı konumlarına taşındı.', 'All elements were moved to their corresponding positions.'),

    traceDimError: () => pick(lang, 'İz (trace) sadece kare matrisler için tanımlıdır.', 'Trace is only defined for square matrices.'),
    traceDiagTitle: () => pick(lang, 'Köşegen Elemanları', 'Diagonal Elements'),
    traceDiagDesc: (diag: string) => pick(lang, `Ana köşegen: [${diag}]`, `Main diagonal: [${diag}]`),
    traceSumTitle: () => pick(lang, 'Toplam', 'Sum'),
    traceSumDesc: (diag: string, sum: Num) => pick(lang, `İz = ${diag} = ${sum}`, `Trace = ${diag} = ${sum}`),

    determinantDimError: () => pick(lang, 'Determinant sadece kare matrisler için tanımlıdır.', 'Determinant is only defined for square matrices.'),
    detDepth1Title: (depth: Num) => pick(lang, `Derinlik ${depth}: 1x1`, `Depth ${depth}: 1x1`),
    detDepth1Desc: (val: Num) => pick(lang, `det = ${val}`, `det = ${val}`),
    detDepth2Title: (depth: Num) => pick(lang, `Derinlik ${depth}: 2x2 taban durum`, `Depth ${depth}: 2x2 base case`),
    detDepth2Desc: (a: Num, d: Num, b: Num, c: Num, val: Num) =>
      pick(
        lang,
        `2x2 matrisin determinantı, köşegen çarpımları farkıdır: det = a·d − b·c\ndet = ${wrap(a)}·${wrap(d)} − ${wrap(b)}·${wrap(c)} = ${val}`,
        `The determinant of a 2x2 matrix is the difference of the diagonal products: det = a·d − b·c\ndet = ${wrap(a)}·${wrap(d)} − ${wrap(b)}·${wrap(c)} = ${val}`
      ),
    detExpandTitle: (depth: Num, n: Num) => pick(lang, `Derinlik ${depth}: ${n}x${n} kofaktör açılımı`, `Depth ${depth}: ${n}x${n} cofactor expansion`),
    detExpandDesc: () => pick(lang, '1. satır üzerinden kofaktör açılımı yapılıyor.', 'Expanding along row 1 using cofactors.'),
    detResultTitle: () => pick(lang, 'Sonuç', 'Result'),
    detResultDesc: (val: Num) => pick(lang, `Determinant = ${val}`, `Determinant = ${val}`),
    // Gaussian elimination (O(n^3)) for n >= 3: triangularize, then determinant = product of the
    // diagonal × sign from the number of row swaps.
    detEliminateStartTitle: () => pick(lang, 'Üçgenselleştirme', 'Triangularization'),
    detEliminateStartDesc: () =>
      pick(
        lang,
        'Determinant, matris satır işlemleriyle üst üçgen forma getirilerek hesaplanır; üst üçgen matrisin determinantı köşegen elemanlarının çarpımıdır.\nKurallar: bir satıra başka bir satırın katını eklemek determinantı DEĞİŞTİRMEZ; iki satırın yerini değiştirmek determinantın işaretini ters çevirir (×(−1)).',
        'The determinant is computed by reducing the matrix to upper-triangular form with row operations; the determinant of an upper-triangular matrix is the product of its diagonal entries.\nRules: adding a multiple of one row to another does NOT change the determinant; swapping two rows flips its sign (×(−1)).'
      ),
    detSwapTitle: () => pick(lang, 'Satır Değiştirme', 'Row Swap'),
    detSwapDesc: (p: Num, m: Num) =>
      pick(
        lang,
        `R${p} ↔ R${m}\nKısmi pivotlama için iki satırın yeri değişti; bu yüzden determinantın işareti ters döner (×(−1)).`,
        `R${p} ↔ R${m}\nThe two rows were swapped for partial pivoting, so the sign of the determinant flips (×(−1)).`
      ),
    detEliminateTitle: (i: Num) => pick(lang, `Adım ${i}: sütun ${i} sıfırlanıyor`, `Step ${i}: eliminating column ${i}`),
    detEliminateDesc: (i: Num, pivotVal: Num) =>
      pick(
        lang,
        `R${i} pivot satırı olarak kullanılır (pivot = ${pivotVal}); altındaki satırların ${i}. sütun elemanları sıfırlanır.\nHer alt satır için: R_k → R_k − (R_k[${i}] / ${wrap(pivotVal)}) · R${i}\nBu işlem determinantın değerini değiştirmez.`,
        `R${i} is used as the pivot row (pivot = ${pivotVal}); the column-${i} entries in the rows below it are zeroed out.\nFor every lower row: R_k → R_k − (R_k[${i}] / ${wrap(pivotVal)}) · R${i}\nThis operation does not change the value of the determinant.`
      ),
    detZeroPivotTitle: () => pick(lang, 'Sıfır Pivot', 'Zero Pivot'),
    detZeroPivotDesc: (i: Num) =>
      pick(lang, `${i}. sütunda (kalan satırlar arasında) sıfırdan farklı bir pivot bulunamadı; matris tekildir, determinant = 0.`, `No nonzero pivot could be found in column ${i} among the remaining rows; the matrix is singular, determinant = 0.`),
    detPivotProductDesc: (diag: string, sign: Num, val: Num) =>
      pick(
        lang,
        `Üst üçgen forma ulaşıldı: determinant, köşegen elemanlarının çarpımı ile satır değişimlerinden gelen işaretin çarpımıdır.\nDeterminant = (işaret: ${sign}) × (köşegen çarpımı: ${diag}) = ${val}`,
        `Upper-triangular form reached: the determinant is the product of the diagonal entries times the sign caused by row swaps.\nDeterminant = (sign: ${sign}) × (product of diagonal: ${diag}) = ${val}`
      ),
    rrefStartTitle: () => pick(lang, 'Başlangıç Matrisi', 'Starting Matrix'),
    rrefStartDesc: () =>
      pick(
        lang,
        'Gauss-Jordan yöntemi, matrisi satır işlemleriyle indirgenmiş basamak (RREF) forma getirir. Üç işlem kullanılır: (1) iki satırın yerini değiştirmek, (2) bir satırı sıfırdan farklı bir sayıyla çarpmak/bölmek, (3) bir satıra başka bir satırın katını eklemek. Bu işlemler denklem sisteminin çözümünü değiştirmez.\nHer sütunda sırayla bir pivot (öncü eleman) seçilir, pivot 1 yapılır ve sütundaki diğer tüm elemanlar sıfırlanır.',
        'Gauss-Jordan elimination uses row operations to bring the matrix to reduced row echelon form (RREF). Three operations are used: (1) swapping two rows, (2) multiplying/dividing a row by a nonzero number, (3) adding a multiple of one row to another. These never change the solution set of the system.\nColumn by column, a pivot (leading entry) is chosen, made equal to 1, and all other entries in its column are zeroed out.'
      ),
    rrefSkipColTitle: (col: Num) => pick(lang, `Sütun ${col}: pivot yok, atlanıyor`, `Column ${col}: no pivot, skipping`),
    rrefSkipColDesc: (col: Num) =>
      pick(
        lang,
        `${col}. sütunda (kalan satırlar arasında) sıfırdan farklı eleman yok; bu sütunda pivot oluşmaz ve bir sonraki sütuna geçilir.\nBu sütun serbest değişkene karşılık gelir ve rank'a katkı yapmaz.`,
        `Column ${col} has no nonzero entry among the remaining rows, so no pivot forms here and we move on to the next column.\nThis column corresponds to a free variable and does not add to the rank.`
      ),
    rrefSwapTitle: () => pick(lang, 'Satır Değiştirme', 'Row Swap'),
    rrefSwapDesc: (p: Num, m: Num) =>
      pick(
        lang,
        `R${p} ↔ R${m}\nİki satırın yeri değiştirildi. Pivot olarak sütundaki mutlak değerce en büyük eleman seçilir; bu, sıfıra bölme riskini ve yuvarlama hatalarını azaltır.`,
        `R${p} ↔ R${m}\nThe two rows were swapped. The entry with the largest absolute value in the column is chosen as the pivot, which reduces the risk of dividing by zero and of rounding errors.`
      ),
    rrefNormalizeTitle: () => pick(lang, 'Pivotu 1 Yap (normalizasyon)', 'Make the Pivot 1 (normalization)'),
    rrefNormalizeDesc: (p: Num, val: Num) =>
      pick(
        lang,
        `Pivotu 1 yapmak için R${p} satırının tüm elemanları pivot değerine (${val}) bölünür.\nR${p} → R${p} ÷ ${wrap(val)}`,
        `To make the pivot equal to 1, every entry of R${p} is divided by the pivot value (${val}).\nR${p} → R${p} ÷ ${wrap(val)}`
      ),
    rrefRowOpTitle: () => pick(lang, 'Eliminasyon (satır işlemi)', 'Elimination (row operation)'),
    rrefRowOpDesc: (r: Num, factor: Num, p: Num) =>
      pick(
        lang,
        `R${p} satırının ${wrap(factor)} katı R${r} satırından çıkarılır; böylece R${r} satırında pivot sütunundaki eleman sıfır olur.\nR${r} → R${r} − ${wrap(factor)} · R${p}`,
        `${wrap(factor)} times R${p} is subtracted from R${r}, so the entry of R${r} in the pivot column becomes zero.\nR${r} → R${r} − ${wrap(factor)} · R${p}`
      ),
    rrefResultTitle: () => pick(lang, 'Sonuç: RREF', 'Result: RREF'),
    rrefResultDesc: () =>
      pick(lang, "Matris indirgenmiş satır eşelon formuna (RREF) getirildi: her pivot 1'dir ve bulunduğu sütunda tek sıfırdan farklı elemandır.", 'The matrix was reduced to Reduced Row Echelon Form (RREF): every pivot is 1 and is the only nonzero entry in its column.'),

    gaussStartTitle: () => pick(lang, 'Gauss Eliminasyonu Başlıyor', 'Gaussian Elimination Starts'),
    gaussStartDesc: () =>
      pick(
        lang,
        'İleri eliminasyon ile matris basamak (eşelon) formuna getirilecek: her pivotun ALTINDAKİ elemanlar sıfırlanacak. RREF/Gauss-Jordan yönteminden farklı olarak pivotlar 1 yapılmayacak ve pivotların ÜSTÜNDEKİ elemanlar sıfırlanmayacak.',
        'Forward elimination will reduce the matrix to row echelon form: entries BELOW each pivot will be zeroed out. Unlike RREF/Gauss-Jordan, pivots are not normalized to 1 and entries ABOVE pivots are left untouched.'
      ),
    gaussResultTitle: () => pick(lang, 'Sonuç: Basamak (Eşelon) Formu', 'Result: Row Echelon Form'),
    gaussResultDesc: () =>
      pick(
        lang,
        "Matris basamak (eşelon) formuna getirildi (üst üçgensel yapı): her pivotun altında yalnızca sıfırlar vardır. Not: RREF'ten farkı, pivotların 1'e normalize edilmemiş ve pivotların üstündeki elemanların sıfırlanmamış olmasıdır.",
        "The matrix was reduced to row echelon form (upper-triangular structure): only zeros appear below each pivot. Note: unlike RREF, pivots are not normalized to 1 and entries above pivots are not zeroed."
      ),

    rankResultTitle: () => pick(lang, 'Sonuç', 'Result'),
    rankResultDesc: (pivotCount: Num) =>
      pick(lang, `RREF'te bulunan pivot (öncü) sütun sayısı, matrisin rankına eşittir: Rank(A) = ${pivotCount}. Bu, matrisin satırlarının/sütunlarının doğrusal bağımsız en büyük alt kümesinin boyutudur.`, `The number of pivot columns found in RREF equals the rank of the matrix: Rank(A) = ${pivotCount}. This is the size of the largest linearly independent subset of the matrix's rows/columns.`),

    inverseDimError: () => pick(lang, 'Ters matris sadece kare matrisler için tanımlıdır.', 'The inverse is only defined for square matrices.'),
    inverseSingularError: () => pick(lang, 'Matris tekildir (determinant = 0), ters matrisi yoktur.', 'The matrix is singular (determinant = 0); it has no inverse.'),
    inverseDetCheckTitle: () => pick(lang, 'Determinant Kontrolü', 'Determinant Check'),
    inverseDetCheckDesc: (det: Num) =>
      pick(
        lang,
        `det(A) = ${det}\nDeterminant sıfırdan farklı olduğu için A terslenebilirdir (tekil değildir).`,
        `det(A) = ${det}\nThe determinant is nonzero, so A is invertible (not singular).`
      ),
    inverseAugmentedTitle: () => pick(lang, 'Genişletilmiş Matris [A | I]', 'Augmented Matrix [A | I]'),
    inverseAugmentedDesc: () =>
      pick(
        lang,
        'A matrisinin sağına aynı boyutlu birim matris I eklendi: [A | I].\nAmaç: satır işlemleriyle sol yarıyı I birim matrisine dönüştürmek. Aynı işlemler sağ yarıya da uygulandığı için sağ yarı sonunda A⁻¹ olur.',
        'The identity matrix I of the same size was appended to the right of A: [A | I].\nGoal: use row operations to turn the left half into I. Since the same operations are applied to the right half, it ends up as A⁻¹.'
      ),
    inverseSwapTitle: () => pick(lang, 'Satır Değiştirme', 'Row Swap'),
    inverseSwapDesc: (p: Num, m: Num) =>
      pick(
        lang,
        `R${p} ↔ R${m}\nPivot konumuna uygun (sıfırdan farklı) bir eleman getirmek için iki satırın yeri değiştirildi; işlem [A | I] matrisinin her iki yarısında da yapılır.`,
        `R${p} ↔ R${m}\nThe two rows were swapped to bring a suitable (nonzero) entry into the pivot position; the swap applies to both halves of [A | I].`
      ),
    inverseNormalizeTitle: () => pick(lang, 'Pivotu 1 Yap (normalizasyon)', 'Make the Pivot 1 (normalization)'),
    inverseNormalizeDesc: (p: Num, val: Num) =>
      pick(
        lang,
        `Pivotu 1 yapmak için R${p} satırının tamamı (hem A hem I tarafı) pivot değerine (${val}) bölünür.\nR${p} → R${p} ÷ ${wrap(val)}`,
        `To make the pivot equal to 1, the whole row R${p} (both the A and I sides) is divided by the pivot value (${val}).\nR${p} → R${p} ÷ ${wrap(val)}`
      ),
    inverseRowOpTitle: () => pick(lang, 'Eliminasyon (satır işlemi)', 'Elimination (row operation)'),
    inverseRowOpDesc: (r: Num, factor: Num, p: Num, col: Num) =>
      pick(
        lang,
        `${col}. sütunu sıfırlamak için R${p} satırının ${wrap(factor)} katı R${r} satırından çıkarılır (işlem satırın her iki yarısına da uygulanır).\nR${r} → R${r} − ${wrap(factor)} · R${p}`,
        `To zero out column ${col}, ${wrap(factor)} times R${p} is subtracted from R${r} (applied to both halves of the row).\nR${r} → R${r} − ${wrap(factor)} · R${p}`
      ),
    inverseReduceDoneTitle: () => pick(lang, 'İndirgeme Tamamlandı', 'Reduction Complete'),
    inverseReduceDoneDesc: () => pick(lang, 'Sol taraf birim matrise dönüştürüldü.', 'The left side was transformed into the identity matrix.'),
    inverseResultTitle: () => pick(lang, 'Sonuç: A⁻¹', 'Result: A⁻¹'),
    inverseResultDesc: () =>
      pick(
        lang,
        'Sol yarı birim matris olduğuna göre, sağ yarı A matrisinin tersidir: A⁻¹.\nDoğrulama: A · A⁻¹ = I eşitliği sağlanır.',
        'Since the left half is now the identity matrix, the right half is the inverse of A: A⁻¹.\nVerification: A · A⁻¹ = I holds.'
      ),
    luDimError: () => pick(lang, 'LU ayrıştırması sadece kare matrisler için tanımlıdır.', 'LU decomposition is only defined for square matrices.'),
    luStartTitle: () => pick(lang, 'Başlangıç', 'Start'),
    luStartDesc: () =>
      pick(
        lang,
        'Amaç: A matrisini PA = LU biçiminde yazmak. P satır değişimlerini tutan permütasyon matrisi, L köşegeni 1 olan alt üçgen matris, U ise üst üçgen matristir.\nDoolittle yönteminde her adımda U\'nun bir satırı ve L\'nin bir sütunu hesaplanır; pivot olarak sütundaki mutlak değerce en büyük aday seçilir (kısmi pivotlama).',
        'Goal: write A as PA = LU, where P is the permutation matrix holding the row swaps, L is lower triangular with 1s on the diagonal, and U is upper triangular.\nIn Doolittle\'s method each step computes one row of U and one column of L; the candidate with the largest absolute value in the column is chosen as the pivot (partial pivoting).'
      ),
    luPivotTitle: () => pick(lang, 'Pivotlama', 'Pivoting'),
    luPivotDesc: (i: Num, maxRow: Num) => pick(lang, `Satır ${i} ve ${maxRow} değiştirildi (P güncellendi).`, `Rows ${i} and ${maxRow} were swapped (P updated).`),
    luZeroPivotError: () => pick(lang, 'Sıfır pivot nedeniyle LU ayrıştırması bu haliyle yapılamıyor.', 'LU decomposition cannot proceed as-is due to a zero pivot.'),
    luStepTitle: (i: Num) => pick(lang, `Adım ${i}: satır/sütun ${i} hesaplanıyor`, `Step ${i}: computing row/column ${i}`),
    luStepDesc: (i: Num, pivotVal: Num) =>
      pick(
        lang,
        `U'nun ${i}. satırı, U[${i}][j] = A[${i}][j] − Σ(L[${i}][k]·U[k][j]) formülüyle; L'nin ${i}. sütunu ise L[i][${i}] = (A[i][${i}] − Σ) / U[${i}][${i}] formülüyle dolduruldu. U[${i}][${i}] = ${pivotVal} pivotu kullanıldı.`,
        `Row ${i} of U was filled using U[${i}][j] = A[${i}][j] − Σ(L[${i}][k]·U[k][j]); column ${i} of L was filled using L[i][${i}] = (A[i][${i}] − Σ) / U[${i}][${i}]. The pivot U[${i}][${i}] = ${pivotVal} was used.`
      ),
    luResultTitle: () => pick(lang, 'Sonuç: L ve U', 'Result: L and U'),
    luResultDesc: () =>
      pick(
        lang,
        'PA = LU ayrıştırması tamamlandı. L, köşegeni 1 olan alt üçgen matris (çarpanları/pivot oranlarını tutar); U, eliminasyon sonrası elde edilen üst üçgen matristir. Doğrulama: P·A = L·U eşitliği sağlanır.',
        'PA = LU decomposition complete. L is a lower triangular matrix with 1s on the diagonal (holding the elimination multipliers); U is the upper triangular matrix obtained after elimination. Verification: P·A = L·U holds.'
      ),

    powerDimError: () => pick(lang, 'Kuvvet alma sadece kare matrisler için tanımlıdır.', 'Exponentiation is only defined for square matrices.'),
    powerIntegerError: () => pick(lang, 'Üs değeri tam sayı olmalıdır.', 'The exponent must be an integer.'),
    powerStartTitle: () => pick(lang, 'Kuvvet İşlemi', 'Exponentiation'),
    powerStartDesc: (n: Num) => pick(lang, `A^${n} hesaplanıyor.`, `Computing A^${n}.`),
    powerZeroResultDesc: () => pick(lang, 'A^0 = I (birim matris)', 'A^0 = I (identity matrix)'),
    powerNegativeInverseError: (msg: string) => pick(lang, `Negatif kuvvet için matrisin tersi alınamadı: ${msg}`, `Could not invert the matrix for negative exponentiation: ${msg}`),
    powerNegativeTitle: () => pick(lang, 'Negatif Üs', 'Negative Exponent'),
    powerNegativeDesc: () => pick(lang, 'n < 0 olduğundan önce A⁻¹ hesaplandı, ardından |n| kere çarpılacak.', 'Since n < 0, A⁻¹ was computed first and will be multiplied |n| times.'),
    powerMulTitle: (i: Num, total: Num) => pick(lang, `Çarpım ${i}/${total}`, `Multiplication ${i}/${total}`),
    powerMulDescNeg: () =>
      pick(
        lang,
        'Sonuç = Sonuç × A⁻¹. Bu çarpımın her hücresi, satır ile sütunun karşılıklı elemanlarının çarpılıp toplanmasıyla (nokta çarpım) aşağıda ayrı ayrı hesaplanıyor.',
        'Result = Result × A⁻¹. Every cell of this product is computed below individually as the dot product of the corresponding row and column.'
      ),
    powerMulDescPos: () =>
      pick(
        lang,
        'Sonuç = Sonuç × A. Bu çarpımın her hücresi, satır ile sütunun karşılıklı elemanlarının çarpılıp toplanmasıyla (nokta çarpım) aşağıda ayrı ayrı hesaplanıyor.',
        'Result = Result × A. Every cell of this product is computed below individually as the dot product of the corresponding row and column.'
      ),
    powerRoundResultTitle: (i: Num, total: Num) => pick(lang, `${i}. Çarpım Sonucu (${i}/${total})`, `Result After Multiplication ${i} (${i}/${total})`),
    powerRoundResultDesc: (i: Num, total: Num) =>
      pick(
        lang,
        `${i}. çarpım tamamlandı (${i}/${total} adım). Bu ara sonuç, bir sonraki çarpımda kullanılacak.`,
        `Multiplication ${i} is complete (step ${i}/${total}). This intermediate result will be used in the next multiplication.`
      ),
    powerResultTitle: () => pick(lang, 'Sonuç', 'Result'),
    powerResultDesc: (n: Num) => pick(lang, `A^${n} hesaplandı.`, `A^${n} was computed.`),

    eigenDimError: () => pick(lang, 'Özdeğer/özvektör sadece kare matrisler için tanımlıdır.', 'Eigenvalues/eigenvectors are only defined for square matrices.'),
    eigenSizeError: () =>
      pick(lang, 'Bu matrisin özdeğer/özvektörleri güvenilir biçimde hesaplanamadı (algoritma yakınsamadı).', 'The eigenvalues/eigenvectors of this matrix could not be computed reliably (the algorithm did not converge).'),
    eigenCharPolyTitle: () => pick(lang, 'Karakteristik Polinom', 'Characteristic Polynomial'),
    eigenCharPolyDesc: () =>
      pick(lang, 'Özdeğerler, det(A - λI) = 0 denkleminin kökleridir (I birim matris, λ bilinmeyen özdeğer).', 'Eigenvalues are the roots of det(A - λI) = 0 (I is the identity matrix, λ is the unknown eigenvalue).'),
    eigenTraceDetTitle: () => pick(lang, 'İz ve Determinant', 'Trace and Determinant'),
    eigenTraceDetDesc: (tr: Num, det: Num) =>
      pick(lang, `İz(A) = ${tr}, det(A) = ${det}. Bu değerler karakteristik denklemin katsayılarında kullanılır.`, `Trace(A) = ${tr}, det(A) = ${det}. These values are used in the coefficients of the characteristic equation.`),
    eigenDetExpandTitle: () => pick(lang, 'det(A − λI) Determinantını Aç', 'Expand the det(A − λI) Determinant'),
    eigenDetExpandDesc: (a11: Num, a12: Num, a21: Num, a22: Num, tr: Num, det: Num) =>
      pick(
        lang,
        `Önce A matrisinin köşegeninden λ çıkarılarak (A − λI) elde edilir, ardından 2x2 determinant formülü |A−λI| = (a11−λ)(a22−λ) − a12·a21 uygulanır:\n\ndet(A − λI) = | ${a11}−λ   ${a12} |\n              | ${a21}   ${a22}−λ |\n\n= (${a11}−λ)(${a22}−λ) − (${a12})(${a21})\n= λ² − (${tr})λ + (${det})`,
        `First λ is subtracted from the diagonal of A to form (A − λI), then the 2x2 determinant formula |A−λI| = (a11−λ)(a22−λ) − a12·a21 is applied:\n\ndet(A − λI) = | ${a11}−λ   ${a12} |\n              | ${a21}   ${a22}−λ |\n\n= (${a11}−λ)(${a22}−λ) − (${a12})(${a21})\n= λ² − (${tr})λ + (${det})`
      ),
    eigenChar2x2Title: () => pick(lang, 'Karakteristik Denklem (2x2)', 'Characteristic Equation (2x2)'),
    eigenChar2x2Desc: (tr: Num, det: Num) =>
      pick(
        lang,
        `λ² − İz(A)·λ + det(A) = 0  →  λ² − (${tr})λ + (${det}) = 0. Bu ikinci derece denklem, ikinci derece denklem formülü ile çözülür: λ = [İz(A) ± √(İz(A)² − 4·det(A))] / 2.`,
        `λ² − Trace(A)·λ + det(A) = 0  →  λ² − (${tr})λ + (${det}) = 0. This quadratic equation is solved with the quadratic formula: λ = [Trace(A) ± √(Trace(A)² − 4·det(A))] / 2.`
      ),
    eigenChar3x3Title: () => pick(lang, 'Karakteristik Denklem (3x3)', 'Characteristic Equation (3x3)'),
    eigenChar3x3Desc: () =>
      pick(
        lang,
        'λ³ − İz(A)·λ² + c·λ − det(A) = 0 şeklindeki kübik denklem, "depressed cubic" dönüşümü (λ = x + İz(A)/3) ve ardından Cardano formülü ile çözülür.',
        'The cubic equation λ³ − Trace(A)·λ² + c·λ − det(A) = 0 is solved via the "depressed cubic" substitution (λ = x + Trace(A)/3) followed by Cardano\'s formula.'
      ),
    eigenComplexError: () =>
      pick(lang, 'Bu matrisin gerçel özdeğeri yok ve karmaşık özdeğerleri güvenilir biçimde hesaplanamadı.', 'This matrix has no real eigenvalues and its complex eigenvalues could not be computed reliably.'),
    eigenFactoredTitle: () => pick(lang, 'Çarpanlarına Ayırma', 'Factor the Polynomial'),
    eigenFactoredDesc: (l1: Num, l2: Num) =>
      pick(
        lang,
        `Kökler bulunduğunda karakteristik polinom çarpanlarına ayrılabilir:\n\n(λ − (${l1}))·(λ − (${l2})) = 0\n\nBu çarpımın sıfır olması için λ = ${l1} veya λ = ${l2} olmalıdır.`,
        `Once the roots are known, the characteristic polynomial factors as:\n\n(λ − (${l1}))·(λ − (${l2})) = 0\n\nFor this product to be zero, λ = ${l1} or λ = ${l2}.`
      ),
    eigenFoundTitle: () => pick(lang, 'Bulunan Özdeğerler', 'Eigenvalues Found'),
    eigenFoundDesc: (vals: string) => pick(lang, `Karakteristik denklemin gerçel kökleri: λ = [${vals}]`, `Real roots of the characteristic equation: λ = [${vals}]`),
    eigenVectorTitle: (idx: Num, lambda: Num) => pick(lang, `λ${idx} = ${lambda} için özvektör`, `Eigenvector for λ${idx} = ${lambda}`),
    eigenVectorDesc: (lambda: Num, vec: string) =>
      pick(
        lang,
        `(A − ${lambda}·I)v = 0 homojen sistemi kurulur, satır indirgeme (RREF) ile çözülür. Serbest değişken 1 kabul edilip geri yerine koyma yapılarak v = [${vec}] bulunur, ardından birim vektör olacak şekilde normalize edilir.`,
        `The homogeneous system (A − ${lambda}·I)v = 0 is set up and solved via row reduction (RREF). Setting the free variable to 1 and back-substituting gives v = [${vec}], which is then normalized to a unit vector.`
      ),

    eigenShiftedMatrixTitle: (idx: Num, lambda: Num) =>
      pick(lang, `(A − ${lambda}·I) Matrisini Oluştur`, `Construct (A − ${lambda}·I) Matrix`),
    eigenShiftedMatrixDesc: (lambda: Num) =>
      pick(
        lang,
        `λ${''} = ${lambda} için (A − λI) matrisini oluşturuyoruz. A matrisinin köşegeninden λ değerini çıkarıyoruz: her a[i][i] elemanından ${lambda} çıkarılır. Bu matrisin null uzayı (çekirdek), ilgili özdeğere ait özvektörleri verir.`,
        `For λ = ${lambda}, we construct (A − λI) by subtracting λ from the diagonal of A: each a[i][i] becomes a[i][i] − ${lambda}. The null space (kernel) of this matrix gives the eigenvectors for this eigenvalue.`
      ),
    eigenRrefStartTitle: (idx: Num, lambda: Num) =>
      pick(lang, `λ${idx} = ${lambda}: RREF ile Çözüm`, `λ${idx} = ${lambda}: Solving via RREF`),
    eigenRrefStartDesc: (lambda: Num) =>
      pick(
        lang,
        `(A − ${lambda}·I)v = 0 homojen denklem sistemini çözmek için matrise satır indirgeme (RREF) uyguluyoruz. Amaç, pivot ve serbest değişkenleri belirleyerek null uzayın taban vektörlerini bulmaktır.`,
        `We apply row reduction (RREF) to solve the homogeneous system (A − ${lambda}·I)v = 0. The goal is to identify pivot and free variables in order to find the basis vectors of the null space.`
      ),
    eigenRrefSwapTitle: (p: Num, m: Num) =>
      pick(lang, `Satır Değiştirme: R${p} ↔ R${m}`, `Row Swap: R${p} ↔ R${m}`),
    eigenRrefSwapDesc: (p: Num, m: Num) =>
      pick(
        lang,
        `Kısmi pivotlama: mutlak değerce en büyük elemanı içeren satırı (R${m}) pivot satırına (R${p}) getiriyoruz. Bu, sayısal kararlılığı artırır.`,
        `Partial pivoting: we bring the row with the largest absolute pivot element (R${m}) to the pivot position (R${p}). This improves numerical stability.`
      ),
    eigenRrefNormTitle: (p: Num, val: Num) =>
      pick(lang, `Normalizasyon: R${p} / ${val}`, `Normalization: R${p} / ${val}`),
    eigenRrefNormDesc: (p: Num, val: Num) =>
      pick(
        lang,
        `Pivot satırını (R${p}) pivot elemanına (${val}) bölerek pivotu 1 yapıyoruz. Bu, sonraki eliminasyon adımlarını kolaylaştırır.`,
        `We divide the pivot row (R${p}) by its pivot element (${val}) to make the pivot equal to 1. This simplifies subsequent elimination steps.`
      ),
    eigenRrefElimTitle: (r: Num, p: Num) =>
      pick(lang, `Eliminasyon: R${r} üzerinde`, `Elimination: on R${r}`),
    eigenRrefElimDesc: (r: Num, factor: Num, p: Num) =>
      pick(
        lang,
        `R${r} = R${r} − (${factor}) × R${p} işlemiyle pivot sütunundaki R${r} elemanını sıfırlıyoruz. RREF'te her pivot sütununda yalnızca pivot pozisyonunda 1, diğer tüm satırlarda 0 olmalıdır.`,
        `We perform R${r} = R${r} − (${factor}) × R${p} to zero out the entry in R${r} at the pivot column. In RREF, each pivot column must contain 1 at the pivot position and 0 in all other rows.`
      ),

    // eigen 2x2: RREF simülasyonu yerine denklemlerden biri yazılıp serbest değişken 1 alınır. 2x2
    // sistemde satırlar zaten bağımlıdır (rank 1); pivotu 1'e normalize etmek (özellikle özdeğer
    // köklüyse) çirkin ara değerler üretiyordu.
    eigenEquationTitle: (idx: Num, lambda: Num) =>
      pick(lang, `λ${idx} = ${lambda}: Denklemi Kur`, `λ${idx} = ${lambda}: Set Up the Equation`),
    eigenEquationDesc: (eq: Num) =>
      pick(
        lang,
        `(A − λI)v = 0 sisteminin satırları birbirine bağımlıdır (çünkü det(A − λI) = 0); bu yüzden tek bir denklem yeterlidir:\n\n${eq} = 0`,
        `The rows of (A − λI)v = 0 are dependent (since det(A − λI) = 0), so a single equation suffices:\n\n${eq} = 0`
      ),
    eigenFreeVarSetTitle: (freeVar: Num) =>
      pick(lang, `Serbest Değişkeni Seç: x${freeVar} = 1`, `Choose the Free Variable: x${freeVar} = 1`),
    eigenFreeVarSetDesc: (freeVar: Num, pivotVar: Num) =>
      pick(
        lang,
        `x${freeVar} serbest değişken olarak alınır ve x${freeVar} = 1 kabul edilir. x${pivotVar} bu denklemden geriye doğru çözülecektir.`,
        `x${freeVar} is taken as the free variable and set to x${freeVar} = 1. x${pivotVar} will be solved for from the equation.`
      ),
    eigenSolveOtherTitle: (pivotVar: Num) =>
      pick(lang, `x${pivotVar} İçin Çöz`, `Solve for x${pivotVar}`),
    eigenSolveOtherDesc: (pivotVar: Num, value: Num) =>
      pick(
        lang,
        `Denklemde x${pivotVar} için çözüldüğünde: x${pivotVar} = ${value}.`,
        `Solving the equation for x${pivotVar} gives: x${pivotVar} = ${value}.`
      ),
    eigenGeneralSolutionTitle: () => pick(lang, 'Genel Çözüm', 'General Solution'),
    eigenGeneralSolutionDesc: (freeVar: Num, vec: string) =>
      pick(
        lang,
        `x${freeVar} serbest parametre olarak bırakılırsa, çözüm tek bir parametreye bağlı olarak şöyle yazılabilir:\n\nX = x${freeVar} · (${vec})\n\nBurada x${freeVar} istenilen herhangi bir gerçel sayı olabilir; her seçim aynı doğrultudaki bir özvektörü verir.`,
        `Leaving x${freeVar} as a free parameter, the solution can be written in terms of a single parameter:\n\nX = x${freeVar} · (${vec})\n\nHere x${freeVar} can be any real number; every choice gives an eigenvector along the same direction.`
      ),
    eigenSolutionSetTitle: () => pick(lang, 'Çözüm Kümesi', 'Solution Set'),
    eigenSolutionSetDesc: (vec: string) =>
      pick(
        lang,
        `Bu özdeğere ait özuzay (çözüm kümesi), tek bir vektörün tüm katlarından oluşur:\n\n{ t · (${vec}) : t ∈ ℝ }\n\nBir temsilci özvektör seçmek için t = 1 alınır.`,
        `The eigenspace (solution set) for this eigenvalue consists of all scalar multiples of a single vector:\n\n{ t · (${vec}) : t ∈ ℝ }\n\nTaking t = 1 gives a representative eigenvector.`
      ),
    eigenScaleTitle: () => pick(lang, 'Sadeleştir (Paydaları Temizle)', 'Simplify (Clear Denominators)'),
    eigenScaleDesc: (vec: Num) =>
      pick(
        lang,
        `Kesirli/köklü paydaları temizlemek için vektör uygun bir sabitle ölçeklenir (özvektörler herhangi bir sıfırdan farklı skalerle çarpılabilir, yön değişmez):\n\nv = [${vec}]`,
        `To clear fractional/radical denominators, the vector is scaled by a suitable constant (eigenvectors may be multiplied by any nonzero scalar without changing direction):\n\nv = [${vec}]`
      ),
    eigenFreeVarsTitle: (idx: Num) =>
      pick(lang, `Serbest ve Pivot Değişkenler`, `Free and Pivot Variables`),
    eigenFreeVarsDesc: (pivotVars: string, freeVars: string) =>
      pick(
        lang,
        `RREF sonucunda pivot değişkenler: ${pivotVars}. Serbest değişkenler: ${freeVars}. Serbest değişken(ler) serbestçe seçilebilir (genelde 1 alınır); pivot değişkenler bunlara bağlı olarak geriye doğru hesaplanır. Her serbest değişken için bir bağımsız özvektör elde edilir.`,
        `After RREF, pivot variables: ${pivotVars}. Free variables: ${freeVars}. Free variable(s) can be chosen freely (typically set to 1); pivot variables are computed via back-substitution. Each free variable yields one linearly independent eigenvector.`
      ),
    eigenBackSubTitle: (idx: Num, lambda: Num) =>
      pick(lang, `λ${idx} = ${lambda}: Geri Yerine Koyma ve Normalleştirme`, `λ${idx} = ${lambda}: Back-Substitution and Normalization`),
    eigenBackSubDesc: (lambda: Num, vec: string) =>
      pick(
        lang,
        `Serbest değişken(ler) 1 alınarak pivot değişkenler RREF satırlarından geriye doğru hesaplandı. Elde edilen vektör, mümkünse en sade tam sayı oranına indirgendi; bu mümkün değilse (bileşenler irrasyonel oranlıysa) birim uzunluğa normalize edildi.\n\nv = [${vec}]`,
        `Setting free variable(s) to 1, the pivot variables were computed via back-substitution from the RREF rows. The resulting vector was reduced to its simplest integer ratio where possible; otherwise (when the components are irrational multiples of one another) it was normalized to unit length.\n\nv = [${vec}]`
      ),
    eigenVerifyTitle: (idx: Num, lambda: Num) =>
      pick(lang, `λ${idx} = ${lambda}: Doğrulama (A·v = λ·v)`, `λ${idx} = ${lambda}: Verification (A·v = λ·v)`),
    eigenVerifyDesc: (lambda: Num, Av: string, lambdaV: string) =>
      pick(
        lang,
        `Doğrulama: Özvektörün doğru olup olmadığını A·v = λ·v eşitliğiyle kontrol ediyoruz.\n\nA·v = ${Av}\nλ·v = ${lambda} × v = ${lambdaV}\n\nİki sonuç eşit (veya yuvarlama sınırlarında) → özvektör doğrulandı. ✓`,
        `Verification: We check that the eigenvector is correct by testing A·v = λ·v.\n\nA·v = ${Av}\nλ·v = ${lambda} × v = ${lambdaV}\n\nBoth results are equal (within rounding tolerance) → eigenvector verified. ✓`
      ),

    // Kesirli modda A·v / λ·v bileşenleri tam yazılamıyorsa (ondalık çıkacaksa) sayı göstermeden doğrulama notu.
    eigenVerifyExactDesc: (lambda: Num) =>
      pick(
        lang,
        `Doğrulama: A·v = λ·v eşitliği (λ = ${lambda}) bulunan özvektör için sağlanıyor; iki vektörün karşılıklı bileşenleri eşit. ✓`,
        `Verification: A·v = λ·v holds for the vector found (λ = ${lambda}); the matching components of both vectors are equal. ✓`
      ),

    eigenResultTitle: () => pick(lang, 'Sonuç', 'Result'),
    eigenResultDesc: (count: Num) =>
      pick(
        lang,
        `${count} adet gerçel özdeğer ve her biri için bir özvektör bulundu. Doğrulama: her λ, v çifti için A·v = λ·v eşitliği sağlanır.`,
        `${count} real eigenvalue(s) were found, each with an eigenvector. Verification: A·v = λ·v holds for every (λ, v) pair.`
      ),

    cramerDimError: () => pick(lang, 'Cramer kuralı sadece kare katsayı matrisi için geçerlidir.', "Cramer's rule only applies to a square coefficient matrix."),
    cramerMainDetTitle: () => pick(lang, 'Ana Determinant', 'Main Determinant'),
    cramerMainDetDesc: (det: Num) =>
      pick(
        lang,
        `det(A) = ${det}\nCramer kuralında her bilinmeyen xᵢ = det(Aᵢ) / det(A) ile bulunur (Aᵢ: A'nın i. sütunu b ile değiştirilmiş hali). Bu yüzden det(A) ≠ 0 olmalıdır.`,
        `det(A) = ${det}\nIn Cramer's rule each unknown is xᵢ = det(Aᵢ) / det(A), where Aᵢ is A with column i replaced by b. This is why det(A) must be ≠ 0.`
      ),
    cramerSingularError: () =>
      pick(lang, 'det(A) = 0 olduğundan Cramer kuralı uygulanamaz (sistem tekil ya da sonsuz/çözümsüz olabilir).', "Since det(A) = 0, Cramer's rule cannot be applied (the system may be singular, or have infinite/no solutions)."),
    cramerXiTitle: (i: Num) => pick(lang, `x${i} hesapla`, `Compute x${i}`),
    cramerXiDesc: (i: Num, detAi: Num, detA: Num, xi: Num) =>
      pick(
        lang,
        `A${i} matrisi: A'nın ${i}. sütunu b ile değiştirildi.\ndet(A${i}) = ${detAi}\nx${i} = det(A${i}) / det(A) = ${detAi} / ${detA} = ${xi}`,
        `Matrix A${i}: column ${i} of A was replaced with b.\ndet(A${i}) = ${detAi}\nx${i} = det(A${i}) / det(A) = ${detAi} / ${detA} = ${xi}`
      ),
    solutionTitle: () => pick(lang, 'Çözüm', 'Solution'),
    solutionDesc: (sol: string) => pick(lang, `x = [${sol}]`, `x = [${sol}]`),
    inconsistentTitle: () => pick(lang, 'Tutarsızlık Tespit Edildi', 'Inconsistency Detected'),
    inconsistentDesc: () =>
      pick(lang, 'Bir satır 0 = sabit (sabit != 0) şeklinde; sistemin ÇÖZÜMÜ YOKTUR.', 'A row reduces to 0 = constant (constant ≠ 0); the system has NO SOLUTION.'),
    inconsistentError: () => pick(lang, 'Sistemin çözümü yoktur (tutarsız sistem).', 'The system has no solution (inconsistent system).'),
    infiniteTitle: () => pick(lang, 'Sonsuz Çözüm', 'Infinite Solutions'),
    infiniteDesc: (pivotCount: Num, cols: Num) =>
      pick(
        lang,
        `Pivot sayısı (${pivotCount}) bilinmeyen sayısından (${cols}) az; sistemin SONSUZ ÇOK çözümü vardır (serbest değişkenler mevcut).`,
        `The pivot count (${pivotCount}) is less than the number of unknowns (${cols}); the system has INFINITELY MANY solutions (free variables exist).`
      ),
    infiniteError: () => pick(lang, 'Sistemin sonsuz çözümü var (serbest değişken içeriyor). Detaylar için adımlara bakın.', 'The system has infinitely many solutions (it contains a free variable). See the steps for details.'),
    uniqueSolutionTitle: () => pick(lang, 'Tek Çözüm Bulundu', 'Unique Solution Found'),
  };
}

export type StepStrings = ReturnType<typeof strings>;
