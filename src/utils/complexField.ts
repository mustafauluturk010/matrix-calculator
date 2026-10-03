// Generic field interface for complex linear algebra (complexOps.ts, eigenGeneral.ts), so the
// same algorithm runs on two number types:
//   - exactField: exact complex numbers re + im·i (re, im: SymNum -> π, √, bigint rationals)
//   - numericField: double-precision complex numbers (fallback when exact arithmetic fails)
// Division is not always possible in the exact field (multi-term divisor mixing π and roots);
// div() then returns null and the caller switches to the numeric field.

import {
  SymNum,
  SYM_ZERO,
  SYM_ONE,
  symAdd,
  symSub,
  symMul,
  symNeg,
  symIsZero,
  symDiv,
  symToNumber,
  symFromRational,
} from './symbolic';
import { extToString, extToNumber, extAdd, extSub, extMul, extDiv, extNeg, extConj, extIsZero, ext, EXT_ZERO, Ext, QuadCtx } from './quadExt';
import { cToString, C } from './complexEigen';
import { NumberDisplayMode } from './numberFormat';

export type Mode = NumberDisplayMode;

export interface Field<T> {
  readonly exact: boolean;
  readonly zero: T;
  readonly one: T;
  fromInt(n: number): T;
  add(a: T, b: T): T;
  sub(a: T, b: T): T;
  mul(a: T, b: T): T;
  neg(a: T): T;
  conj(a: T): T;
  /** a / b; b = 0 ya da temsil edilemiyorsa null. */
  div(a: T, b: T): T | null;
  isZero(a: T): boolean;
  fmt(a: T, mode: Mode): string;
  re(a: T): number;
  im(a: T): number;
  /** Okunabilirlik ölçüsü (terim sayısı); numerikte 1. */
  size(a: T): number;
}

/** Bir hücre bu kadar terimi aşarsa kesin takip bırakılır (sayısal cisme düşülür). */
export const MAX_CX_TERMS = 16;

/** Sembolik takip sürdürülemiyor (symbolicOps.noSym ile aynı işaret). */
export function bail(): never {
  const e = new Error('Karmaşık motor: kesin takip sürdürülemiyor');
  (e as Error & { noSymbolic?: boolean }).noSymbolic = true;
  throw e;
}

export interface CxSym {
  re: SymNum;
  im: SymNum;
}

const I_CTX: QuadCtx = { M: symFromRational(-1), kind: 'i' };

// İşlem BÜTÇESİ: kesin takip, girişler π/√/i karışık ve bölen çok terimli olduğunda
// pahalı ama sonunda yine sayısala düşen hesaplar yapabilir. Belirli sayıda işlemden
// sonra (tipik kesin başarılar bunun çok altındadır) hemen sayısal cisme geçilir.
let exactOpsUsed = 0;
let exactOpsLimit = 6000;
export function resetExactBudget(limit = 6000): void {
  exactOpsUsed = 0;
  exactOpsLimit = limit;
}

/** Bir işlem sayacını artırır; bütçe ya da terim sınırı aşılırsa kesin takibi bırakır. */
export function checkBudget(size: number, maxTerms = MAX_CX_TERMS): void {
  if (++exactOpsUsed > exactOpsLimit || size > maxTerms) bail();
}

const guard = (x: CxSym): CxSym => {
  checkBudget(x.re.length + x.im.length);
  return x;
};

export const exactField: Field<CxSym> = {
  exact: true,
  zero: { re: SYM_ZERO, im: SYM_ZERO },
  one: { re: SYM_ONE, im: SYM_ZERO },
  fromInt: (n) => ({ re: symFromRational(n), im: SYM_ZERO }),
  add: (a, b) => guard({ re: symAdd(a.re, b.re), im: symAdd(a.im, b.im) }),
  sub: (a, b) => guard({ re: symSub(a.re, b.re), im: symSub(a.im, b.im) }),
  neg: (a) => ({ re: symNeg(a.re), im: symNeg(a.im) }),
  conj: (a) => ({ re: a.re, im: symNeg(a.im) }),
  mul: (a, b) =>
    guard({
      re: symSub(symMul(a.re, b.re), symMul(a.im, b.im)),
      im: symAdd(symMul(a.re, b.im), symMul(a.im, b.re)),
    }),
  div(a, b) {
    if (symIsZero(b.re) && symIsZero(b.im)) return null;
    const norm = symAdd(symMul(b.re, b.re), symMul(b.im, b.im));
    const nre = symAdd(symMul(a.re, b.re), symMul(a.im, b.im));
    const nim = symSub(symMul(a.im, b.re), symMul(a.re, b.im));
    const re = symDiv(nre, norm);
    const im = symDiv(nim, norm);
    return re === null || im === null ? null : guard({ re, im });
  },
  isZero: (a) => symIsZero(a.re) && symIsZero(a.im),
  fmt: (a, mode) => extToString(I_CTX, { a: a.re, b: a.im }, mode),
  re: (a) => symToNumber(a.re),
  im: (a) => symToNumber(a.im),
  size: (a) => a.re.length + a.im.length,
};

/**
 * a + b·s (s² = ctx.M) İKİNCİ DERECE GENİŞLEME cismi. Karekökü sadeleşmeyen (3+
 * terimli, π+kök karışık) diskriminantlı bir özdeğer ÇİFTİNİ, sayıya
 * indirgemeden KESİN taşımak için kullanılır (bkz. quadExt.ts). Yalnızca bir
 * KONTEKST (ctx) için geçerlidir; farklı ctx'lerden değerler karıştırılamaz.
 */
export function extField(ctx: QuadCtx): Field<Ext> {
  return {
    exact: true,
    zero: EXT_ZERO,
    one: ext(SYM_ONE),
    fromInt: (n) => ext(symFromRational(n)),
    add: extAdd,
    sub: extSub,
    neg: extNeg,
    conj: extConj,
    mul: (a, b) => extMul(ctx, a, b),
    div: (a, b) => extDiv(ctx, a, b),
    isZero: extIsZero,
    fmt: (a, mode) => extToString(ctx, a, mode),
    re: (a) => extToNumber(ctx, a).re,
    im: (a) => extToNumber(ctx, a).im,
    size: (a) => a.a.length + a.b.length,
  };
}

/** Sayısal (çift duyarlıklı) karmaşık cisim; eps: sıfır eşiği (mutlak). */
export function numericField(eps: number): Field<C> {
  const abs = (a: C) => Math.hypot(a.re, a.im);
  return {
    exact: false,
    zero: { re: 0, im: 0 },
    one: { re: 1, im: 0 },
    fromInt: (n) => ({ re: n, im: 0 }),
    add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
    sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
    neg: (a) => ({ re: -a.re, im: -a.im }),
    conj: (a) => ({ re: a.re, im: -a.im }),
    mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
    div(a, b) {
      const n = b.re * b.re + b.im * b.im;
      if (abs(b) <= eps || n === 0) return null;
      return { re: (a.re * b.re + a.im * b.im) / n, im: (a.im * b.re - a.re * b.im) / n };
    },
    isZero: (a) => abs(a) <= eps,
    fmt: (a, mode) => cToString(a, mode),
    re: (a) => a.re,
    im: (a) => a.im,
    size: () => 1,
  };
}
