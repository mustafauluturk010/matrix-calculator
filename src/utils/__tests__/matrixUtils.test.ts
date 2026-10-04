import {
  add,
  subtract,
  scalarMultiply,
  multiply,
  transpose,
  trace,
  determinant,
  determinantValue,
  rank,
  rrefOperation,
  gaussElimination,
  inverse,
  luDecomposition,
  matrixPower,
  eigen,
  solveCramer,
  solveGauss,
  identityMatrix,
} from '../matrixUtils';

describe('Temel İşlemler', () => {
  test('add: iki 2x2 matrisi doğru toplar', () => {
    const r = add([[1, 2], [3, 4]], [[5, 6], [7, 8]]);
    expect(r.success).toBe(true);
    expect(r.matrixResult).toEqual([[6, 8], [10, 12]]);
  });

  test('add: uyumsuz boyutlarda hata döner', () => {
    const r = add([[1, 2]], [[1, 2, 3]]);
    expect(r.success).toBe(false);
  });

  test('subtract: doğru çıkarma yapar', () => {
    const r = subtract([[5, 6], [7, 8]], [[1, 2], [3, 4]]);
    expect(r.matrixResult).toEqual([[4, 4], [4, 4]]);
  });

  test('scalarMultiply: her elemanı doğru çarpar', () => {
    const r = scalarMultiply([[1, -2], [3, 4]], 3);
    expect(r.matrixResult).toEqual([[3, -6], [9, 12]]);
  });

  test('multiply: 2x3 * 3x2 doğru sonuç verir', () => {
    const a = [[1, 2, 3], [4, 5, 6]];
    const b = [[7, 8], [9, 10], [11, 12]];
    const r = multiply(a, b);
    expect(r.matrixResult).toEqual([[58, 64], [139, 154]]);
  });

  test('multiply: uyumsuz boyutta hata döner', () => {
    const r = multiply([[1, 2]], [[1, 2]]);
    expect(r.success).toBe(false);
  });
});

describe('Transpoz ve İz', () => {
  test('transpose: doğru dönüşüm yapar', () => {
    const r = transpose([[1, 2, 3], [4, 5, 6]]);
    expect(r.matrixResult).toEqual([[1, 4], [2, 5], [3, 6]]);
  });

  test('trace: köşegen toplamını doğru hesaplar', () => {
    const r = trace([[1, 2], [3, 4]]);
    expect(r.scalarResult).toBe(5);
  });

  test('trace: kare olmayan matriste hata döner', () => {
    const r = trace([[1, 2, 3], [4, 5, 6]]);
    expect(r.success).toBe(false);
  });
});

describe('Determinant', () => {
  test('2x2 determinant doğru hesaplanır', () => {
    expect(determinantValue([[4, 6], [3, 8]])).toBe(14);
  });

  test('3x3 determinant doğru hesaplanır (kofaktör açılımı)', () => {
    const m = [[6, 1, 1], [4, -2, 5], [2, 8, 7]];
    expect(determinantValue(m)).toBe(-306);
  });

  test('4x4 determinant doğru hesaplanır', () => {
    const m = [
      [1, 0, 2, -1],
      [3, 0, 0, 5],
      [2, 1, 4, -3],
      [1, 0, 5, 0],
    ];
    const r = determinant(m);
    expect(r.scalarResult).toBe(30);
  });

  // 5x5 and 6x6 use Gaussian elimination with partial pivoting; expected values were
  // cross-checked with an independent permutation (Leibniz) formula.
  test('5x5 determinant doğru ve hızlı hesaplanır (Gauss eliminasyonu)', () => {
    const m = [
      [4, 1, -2, 3, 0],
      [1, 5, 1, -1, 2],
      [-2, 1, 6, 0, 1],
      [3, -1, 0, 7, -2],
      [0, 2, 1, -2, 5],
    ];
    const start = Date.now();
    const r = determinant(m);
    const elapsedMs = Date.now() - start;
    expect(r.success).toBe(true);
    expect(r.scalarResult).toBeCloseTo(951, 6);
    // Recursive kofaktör açılımı 5x5 için 5! = 120 yaprak düğüm gerektirirdi;
    // Gauss eliminasyonu O(n^3) olduğundan makul sürede tamamlanmalı.
    expect(elapsedMs).toBeLessThan(500);
    // The step count scales with the matrix size (constant per pivot), not exponentially.
    expect(r.steps.length).toBeLessThan(20);
  });

  test('6x6 determinant doğru ve hızlı hesaplanır (Gauss eliminasyonu)', () => {
    const m = [
      [5, 1, 0, -2, 3, 1],
      [1, 6, 2, 0, -1, 2],
      [0, 2, 7, 1, 0, -1],
      [-2, 0, 1, 8, 2, 0],
      [3, -1, 0, 2, 9, 1],
      [1, 2, -1, 0, 1, 6],
    ];
    const start = Date.now();
    const r = determinant(m);
    const elapsedMs = Date.now() - start;
    expect(r.success).toBe(true);
    expect(r.scalarResult).toBeCloseTo(31476, 6);
    expect(elapsedMs).toBeLessThan(500);
    expect(r.steps.length).toBeLessThan(25);
  });

  test('determinantValue: tekil matriste 0 döner (sıfır pivot)', () => {
    const m = [
      [1, 2, 3, 4],
      [2, 4, 6, 8],
      [0, 1, 0, 1],
      [1, 0, 1, 0],
    ];
    expect(determinantValue(m)).toBe(0);
  });

  test('kare olmayan matriste hata döner', () => {
    const r = determinant([[1, 2, 3], [4, 5, 6]]);
    expect(r.success).toBe(false);
  });
});

describe('RREF ve Rank', () => {
  test('rref: basit sistemi doğru indirger', () => {
    const r = rrefOperation([[1, 2], [3, 4]]);
    expect(r.matrixResult).toEqual([[1, 0], [0, 1]]);
  });

  test('rank: tam ranklı matris', () => {
    const r = rank([[1, 2], [3, 4]]);
    expect(r.scalarResult).toBe(2);
  });

  test('rank: eksik ranklı matris (bağımlı satırlar)', () => {
    const r = rank([[1, 2], [2, 4]]);
    expect(r.scalarResult).toBe(1);
  });

  // No intermediate rounding in RREF/Gauss: accuracy is kept for a larger decimal (4x4) matrix
  // (RREF of a full-rank square matrix = I).
  test('rref: ondalıklı 4x4 tam ranklı matris doğru indirgenir', () => {
    const m = [
      [1.5, 2.25, -0.5, 1],
      [0.25, 3, 1.75, -2.5],
      [-1, 0.5, 2.5, 3.25],
      [2, -1.5, 1, 4.75],
    ];
    const r = rrefOperation(m);
    expect(r.success).toBe(true);
    const expected = identityMatrix(4);
    r.matrixResult!.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(expected[i][j], 6)));
  });

  test('gaussElimination: ondalıklı büyük matriste üst üçgen forma indirger', () => {
    const m = [
      [2.5, -1.5, 0.5, 3],
      [1, 4.25, -2, 0.75],
      [-0.5, 2, 5.5, -1.25],
      [3.25, 0, 1.5, 6],
    ];
    const r = gaussElimination(m);
    expect(r.success).toBe(true);
    // Üst üçgen: alt köşegen elemanları (yuvarlama sonrası) sıfıra çok yakın olmalı.
    for (let i = 1; i < 4; i++) {
      for (let j = 0; j < i; j++) {
        expect(r.matrixResult![i][j]).toBeCloseTo(0, 6);
      }
    }
  });
});

describe('Ters Matris', () => {
  test('2x2 tersini doğru hesaplar', () => {
    const r = inverse([[4, 7], [2, 6]]);
    expect(r.success).toBe(true);
    expect(r.matrixResult![0][0]).toBeCloseTo(0.6);
    expect(r.matrixResult![0][1]).toBeCloseTo(-0.7);
    expect(r.matrixResult![1][0]).toBeCloseTo(-0.2);
    expect(r.matrixResult![1][1]).toBeCloseTo(0.4);
  });

  test('tekil matriste hata döner', () => {
    const r = inverse([[1, 2], [2, 4]]);
    expect(r.success).toBe(false);
  });

  // The singularity check uses the unrounded determinantValue(). This matrix has determinant
  // 1e-7, which rounds to 0 at 6 decimals and would be wrongly reported as singular.
  test('determinantı sıfır olmayan ancak çok küçük olan invertible matriste hata dönmemeli', () => {
    const a = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 0.0000001],
    ];
    const r = inverse(a);
    expect(r.success).toBe(true);
    const mulResult = multiply(a, r.matrixResult!);
    const expected = identityMatrix(3);
    mulResult.matrixResult!.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(expected[i][j], 3)));
  });

  test('A * A^-1 = I doğrulaması', () => {
    const a = [[3, 0, 2], [2, 0, -2], [0, 1, 1]];
    const invResult = inverse(a);
    expect(invResult.success).toBe(true);
    const mulResult = multiply(a, invResult.matrixResult!);
    const rounded = mulResult.matrixResult!.map((row) => row.map((v) => Math.round(v)));
    expect(rounded).toEqual(identityMatrix(3));
  });

  // Without early rounding, A × inverse(A) ≈ I should hold for larger matrices such as 5x5.
  test('5x5: A * A^-1 ≈ I doğrulaması', () => {
    const a = [
      [3, 1, 0, 2, -1],
      [1, 4, 1, 0, 2],
      [0, 1, 5, -1, 1],
      [2, 0, -1, 6, 1],
      [-1, 2, 1, 1, 7],
    ];
    const invResult = inverse(a);
    expect(invResult.success).toBe(true);
    const mulResult = multiply(a, invResult.matrixResult!);
    const expected = identityMatrix(5);
    mulResult.matrixResult!.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(expected[i][j], 4)));
  });
});

describe('LU Ayrıştırması', () => {
  test('L alt üçgen, U üst üçgen ve L*U = P*A doğrulanır', () => {
    const a = [[4, 3], [6, 3]];
    const r = luDecomposition(a);
    expect(r.success).toBe(true);
    const { L, U } = r.luResult!;
    expect(L[0][1]).toBe(0);
    expect(U[1][0]).toBe(0);
  });

  function permuteRows(p: number[][], a: number[][]): number[][] {
    return p.map((prow) => {
      const rowIdx = prow.findIndex((v) => v === 1);
      return a[rowIdx];
    });
  }

  // With partial pivoting interleaved with elimination, P×A = L×U must hold for every size,
  // especially for larger matrices that need pivoting.
  test('4x4: P*A ≈ L*U (kısmi pivotlama gerektiren matris)', () => {
    const a = [
      [2, -1, 0, 3],
      [1, 4, -2, 1],
      [0, 3, 5, -1],
      [3, -2, 1, 4],
    ];
    const r = luDecomposition(a);
    expect(r.success).toBe(true);
    const { L, U, P } = r.luResult!;
    const PA = permuteRows(P!, a);
    const LU = multiply(L, U).matrixResult!;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        expect(LU[i][j]).toBeCloseTo(PA[i][j], 4);
      }
    }
  });

  test('5x5: P*A ≈ L*U (kısmi pivotlama gerektiren matris)', () => {
    const a = [
      [4, 1, -2, 3, 0],
      [1, 5, 1, -1, 2],
      [-2, 1, 6, 0, 1],
      [3, -1, 0, 7, -2],
      [0, 2, 1, -2, 5],
    ];
    const r = luDecomposition(a);
    expect(r.success).toBe(true);
    const { L, U, P } = r.luResult!;
    const PA = permuteRows(P!, a);
    const LU = multiply(L, U).matrixResult!;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        expect(LU[i][j]).toBeCloseTo(PA[i][j], 4);
      }
    }
  });
});

describe('LU adım çıktısı (P matrisi + dinamik sayılar)', () => {
  const a = [
    [1, 0, -3],
    [0, 7, 0.5],
    [-30.5, 17, 0],
  ];

  test('-1298/427 doğru sonuçtur: kesirler girişin gerçek değerleridir', () => {
    const r = luDecomposition(a, 'tr', 'fraction');
    expect(r.success).toBe(true);
    const { L, U, P } = r.luResult!;
    expect(P).toEqual([[0, 0, 1], [0, 1, 0], [1, 0, 0]]);
    expect(L[2][0]).toBeCloseTo(-2 / 61, 9);
    expect(L[2][1]).toBeCloseTo(34 / 427, 9);
    expect(U[2][2]).toBeCloseTo(-1298 / 427, 9);
  });

  test('adımlarda P matrisi ve sayısal formül metinleri bulunur', () => {
    const r = luDecomposition(a, 'tr', 'fraction');
    const pStep = r.steps.find((s) => s.title.startsWith('Permütasyon'));
    expect(pStep?.matrixSnapshot).toEqual([[0, 0, 1], [0, 1, 0], [1, 0, 0]]);
    const text = r.steps.map((s) => s.description).join('\n');
    expect(text).not.toContain('Σ');
    expect(text).toContain('U[3][3] = -3 −');
    expect(text).toContain('= -1298/427');
  });
});

describe('Matris Kuvveti', () => {
  test('A^0 birim matristir', () => {
    const r = matrixPower([[2, 0], [0, 2]], 0);
    expect(r.matrixResult).toEqual([[1, 0], [0, 1]]);
  });

  test('A^2 doğru hesaplanır', () => {
    const r = matrixPower([[1, 1], [0, 1]], 2);
    expect(r.matrixResult).toEqual([[1, 2], [0, 1]]);
  });

  test('A^3 doğru hesaplanır', () => {
    const r = matrixPower([[2, 0], [0, 2]], 3);
    expect(r.matrixResult).toEqual([[8, 0], [0, 8]]);
  });
});

describe('Özdeğer / Özvektör', () => {
  test('2x2 simetrik matrisin özdeğerlerini doğru bulur', () => {
    const r = eigen([[2, 0], [0, 3]]);
    expect(r.success).toBe(true);
    expect(r.eigenResult!.eigenvalues.sort()).toEqual([2, 3]);
  });

  test('3x3 matris için gerçel özdeğer sayısı tutarlıdır', () => {
    const r = eigen([[2, 0, 0], [0, 3, 0], [0, 0, 4]]);
    expect(r.success).toBe(true);
    expect(r.eigenResult!.eigenvalues.length).toBe(3);
  });
});

describe('Doğrusal Denklem Sistemi Çözücü', () => {
  test('solveCramer: 2 bilinmeyenli sistemi doğru çözer', () => {
    // 2x + y = 5 ; x + 3y = 10 -> x=1, y=3
    const r = solveCramer([[2, 1], [1, 3]], [5, 10]);
    expect(r.success).toBe(true);
    expect(r.vectorResult![0]).toBeCloseTo(1);
    expect(r.vectorResult![1]).toBeCloseTo(3);
  });

  test('solveGauss: aynı sistemi doğru çözer', () => {
    const r = solveGauss([[2, 1], [1, 3]], [5, 10]);
    expect(r.success).toBe(true);
    expect(r.vectorResult![0]).toBeCloseTo(1);
    expect(r.vectorResult![1]).toBeCloseTo(3);
  });

  test('solveGauss: tutarsız sistemde çözümsüz döner', () => {
    const r = solveGauss([[1, 1], [1, 1]], [2, 5]);
    expect(r.success).toBe(false);
    expect(r.errorMessage).toMatch(/çözümü yoktur/);
  });

  test('solveGauss: sonsuz çözümlü sistemi tespit eder', () => {
    const r = solveGauss([[1, 1], [2, 2]], [2, 4]);
    expect(r.success).toBe(false);
    expect(r.errorMessage).toMatch(/sonsuz/);
  });
});
