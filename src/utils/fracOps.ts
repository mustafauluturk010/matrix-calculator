// General engine over SymFrac (rational functions) for real π/√ matrices. symbolicOps.ts keeps
// cells as SymNum (Σ c·π^p·√r), where division is only possible for invertible divisors (single
// term, or rationalizable with a root). A multi-term divisor mixing π and roots (in RREF, Gauss,
// LU, or 1/(π+√2) in a cell) ended symbolic tracking.
// This module runs the same algorithms (complexOps.runGeneric) over a Field<SymFrac>, where
// division is always possible (non-zero divisor), results have the form `(numerator)/(denominator)`
// and the zero test is exact. It only runs when symbolicOps fails (null); the order is
// SymNum -> SymFrac -> decimal.

import { LanguageCode, MatrixData, OperationResult, OperationType } from '@/types';
import { strings } from './matrixStepText';
import { Field, Mode, bail, checkBudget, resetExactBudget } from './complexField';
import { runGeneric } from './complexOps';
import {
  SymFrac,
  FRAC_ZERO,
  fracFromSym,
  fracAdd,
  fracSub,
  fracMul,
  fracDiv,
  fracNeg,
  fracIsZero,
  fracToNumber,
  fracToString,
  fracTermCount,
  parseFracInput,
} from './symFrac';
import { SYM_ONE, SymNum, SymOverflowError, symFromRational } from './symbolic';
import type { SymbolicInputs } from './symbolicOps';

const MAX_FRAC_TERMS = 24; // ara değerler
/** Sonuç hücresi okunabilirlik eşiği (symbolicOps.MAX_FRAC_TERMS ile aynı). */
const MAX_FRAC_RESULT_TERMS = 12;

const chk = (x: SymFrac | null): SymFrac => {
  if (x === null) bail();
  checkBudget(fracTermCount(x), MAX_FRAC_TERMS);
  return x;
};

/** Bir SymNum'daki farklı kare-çarpansız kök asalları (rasyonelleştirme maliyetinin ölçüsü). */
function radicalPrimes(x: SymNum, into: Set<number>): void {
  for (const t of x) {
    let r = t.r;
    for (let f = 2; r > 1 && f * f <= r; f++) {
      if (r % f === 0) {
        into.add(f);
        while (r % f === 0) r /= f;
      }
    }
    if (r > 1) into.add(r);
  }
}

/**
 * Bölme, paydayı (a.d·b.n) eşlenik çarpımlarıyla köksüz yapar: her yeni kök asalı terim sayısını
 * ikiye katlar. Dörtten fazla farklı kök (ya da çok büyük işlenenler) okunamayacak sonuç verir ve
 * çok pahalıdır ⇒ önceden bırak.
 */
function divisionTooCostly(a: SymFrac, b: SymFrac): boolean {
  if (fracTermCount(a) + fracTermCount(b) > 40) return true;
  const primes = new Set<number>();
  radicalPrimes(a.d, primes);
  radicalPrimes(b.n, primes);
  return primes.size > 3 || b.n.length > 8;
}

export const fracField: Field<SymFrac> = {
  exact: true,
  zero: FRAC_ZERO,
  one: fracFromSym(SYM_ONE),
  fromInt: (n) => fracFromSym(symFromRational(n)),
  add: (a, b) => (fracTermCount(a) + fracTermCount(b) > 40 ? bail() : chk(fracAdd(a, b))),
  sub: (a, b) => (fracTermCount(a) + fracTermCount(b) > 40 ? bail() : chk(fracSub(a, b))),
  mul: (a, b) => (fracTermCount(a) + fracTermCount(b) > 40 ? bail() : chk(fracMul(a, b))),
  neg: fracNeg,
  conj: (a) => a,
  div: (a, b) => {
    if (fracIsZero(b)) return null;
    if (divisionTooCostly(a, b)) bail();
    const r = fracDiv(a, b);
    return r === null ? null : chk(r);
  },
  isZero: fracIsZero,
  fmt: (a, mode) => fracToString(a, mode),
  re: fracToNumber,
  im: () => 0,
  size: fracTermCount,
};

const usesB = (t: OperationType) => t === 'add' || t === 'subtract' || t === 'multiply';

const isBail = (e: unknown): boolean =>
  (!!e && (e as { noSymbolic?: boolean }).noSymbolic === true) || e instanceof SymOverflowError || (e as Error)?.name === 'SymOverflowError';

/** Giriş tamamen rasyonelse (ondalık motor zaten kesin gösterir) ya da ayrıştırılamıyorsa null. */
export function tryFracOperation(
  type: OperationType,
  matrixA: MatrixData,
  matrixB: MatrixData,
  inputs: SymbolicInputs | undefined,
  lang: LanguageCode,
  mode: Mode
): OperationResult | null {
  if (!inputs || !inputs.A || type === 'eigen') return null;
  if (inputs.A.length !== matrixA.length) return null;
  if (usesB(type) && (!inputs.B || inputs.B.length !== matrixB.length)) return null;

  const parseM = (texts: string[][]): SymFrac[][] | null => {
    const out: SymFrac[][] = [];
    for (const row of texts) {
      const r: SymFrac[] = [];
      for (const t of row) {
        const f = parseFracInput(t);
        if (f === null) return null;
        r.push(f);
      }
      out.push(r);
    }
    return out;
  };
  const irrational = (f: SymFrac) => [...f.n, ...f.d].some((t) => t.p !== 0 || t.r !== 1);

  const A = parseM(inputs.A);
  if (A === null) return null;
  const B = usesB(type) ? parseM(inputs.B!) : null;
  if (usesB(type) && B === null) return null;
  const scalar = type === 'scalarMultiply' ? parseFracInput(inputs.scalar ?? '') : null;
  if (type === 'scalarMultiply' && scalar === null) return null;
  let vecB: SymFrac[] | null = null;
  if (type === 'solveLinearSystem') {
    vecB = (inputs.b ?? []).map((t) => parseFracInput(t)) as SymFrac[];
    if (vecB.some((f) => f === null)) return null;
  }
  const all = [...A.flat(), ...(B ? B.flat() : []), ...(scalar ? [scalar] : []), ...(vecB ?? [])];
  if (!all.some(irrational)) return null; // saf rasyonel: ondalık motor

  try {
    resetExactBudget(8000);
    return runGeneric(
      { F: fracField, lang, mode, S: strings(lang), real: true, maxResultSize: MAX_FRAC_RESULT_TERMS },
      type,
      A,
      B,
      scalar,
      vecB,
      inputs.exponent ?? 2,
      inputs.method ?? 'gauss'
    );
  } catch (e) {
    if (isBail(e)) return null;
    return null;
  }
}
