// Division where π and roots share the denominator (rational functions). SymNum can only invert
// a single-term or π-free denominator (symDiv); 1/(π + √2) needs division by a multi-term
// polynomial in π. Since π is transcendental, Q(π) is just the field of rational functions in π,
// so this is written exactly and uniquely as 1/(π + √2) = (π − √2) / (π² − 2): roots are removed
// from the denominator with the conjugate, leaving a polynomial in π.
//
// SymFrac = { n, d } (n/d, both SymNum):
//   d ≠ 0, root-free (only rational terms in π), at least 2 terms
//   n, d: polynomials in π (exponents ≥ 0) with integer coefficients; d primitive with a
//         positive leading coefficient
// If d turns out to be single-term (invertible), the result drops to a plain SymNum (d = 1).
//
// The zero test is exact: n/d = 0 iff n = 0. Equality: a.n·b.d = b.n·a.d (exact, since SymNum
// products are canonical). The π-polynomial GCD of numerator and denominator (Euclid over Q) is
// cancelled; if coefficients overflow, SymOverflowError sends the calculation back to the
// decimal engine.

import {
  SymNum,
  Term,
  Q,
  SYM_ZERO,
  SYM_ONE,
  symAdd,
  symSub,
  symMul,
  symNeg,
  symIsZero,
  symDiv,
  symRationalize,
  symToNumber,
  symToString,
  decimalString,
  symToLatex,
  symFromRational,
  SymOverflowError,
  symSqrt,
  symRationalOf,
  parseExpressionAst,
  evalSymAst,
  Ast,
  I,
  iMul,
  iGcd,
  iAbs,
  iDivExact,
} from './symbolic';

export interface SymFrac {
  n: SymNum;
  d: SymNum;
}

export const FRAC_ZERO: SymFrac = { n: SYM_ZERO, d: SYM_ONE };
export const fracFromSym = (n: SymNum): SymFrac => ({ n, d: SYM_ONE });


const piPow = (k: number): SymNum => [{ c: { n: 1, d: 1 }, p: k, r: 1 }];

/** a·k (k rasyonel n/d). */
const scaleBy = (a: SymNum, n: I, d: I = 1): SymNum => symMul(a, symFromRational(n, d));

// ---- π'de polinom aritmetiği (SymNum'ın yalnızca r = 1, p ≥ 0 terimleri) ----

const polyLead = (a: SymNum): Term => a.reduce((best, t) => (t.p > best.p ? t : best), a[0]);

/**
 * Bir Q'nun (pay/payda) yaklaşık basamak sayısı. Naif Öklid algoritması Q[π] üzerinde
 * KATSAYI BÜYÜMESİ sorununa açıktır (terim SAYISI küçük kalsa bile pay/payda basamak
 * sayısı her adımda katlanarak büyüyebilir — bilgisayar cebirinde bilinen bir durum).
 * Bu yüzden polyRem/polyGcd, katsayılar bu eşiği aşarsa GÜVENLİ biçimde vazgeçer.
 */
const MAX_POLY_GCD_DIGITS = 300;
const qDigits = (q: Q): number => String(q.n).length + String(q.d).length;
const polyTooBig = (a: SymNum): boolean => a.some((t) => qDigits(t.c) > MAX_POLY_GCD_DIGITS);

/** a'nın b'ye bölümünden kalan (b ≠ 0). Katsayılar patlarsa SymOverflowError. */
function polyRem(a: SymNum, b: SymNum): SymNum {
  let r = a;
  const lb = polyLead(b);
  while (r.length > 0 && polyLead(r).p >= lb.p) {
    const q = symDiv([polyLead(r)], [lb]);
    if (q === null) break;
    r = symSub(r, symMul(q, b));
    if (polyTooBig(r)) throw new SymOverflowError();
  }
  return r;
}

/** a / b tam bölünüyorsa bölüm, değilse null. */
function polyExactDiv(a: SymNum, b: SymNum): SymNum | null {
  let r = a;
  let quo: SymNum = SYM_ZERO;
  const lb = polyLead(b);
  while (r.length > 0) {
    if (polyLead(r).p < lb.p) return null;
    const q = symDiv([polyLead(r)], [lb]);
    if (q === null) return null;
    quo = symAdd(quo, q);
    r = symSub(r, symMul(q, b));
    if (polyTooBig(r) || polyTooBig(quo)) throw new SymOverflowError();
  }
  return quo;
}

/** Sonuç x'in içeriği (katsayıların OBEB'i) bilerek alınmaz; yalnızca ORTAK ÇARPANI
 * bulma amaçlı, katsayı büyümesi eşiği aşılırsa (SymOverflowError) vazgeçilir - bkz.
 * cancelCommonFactor: sadeleştirme yalnızca bir OPTİMİZASYONdur, atlanması sonucu
 * YANLIŞ yapmaz, yalnızca sadeleşmemiş bırakır. */
function polyGcd(a: SymNum, b: SymNum): SymNum {
  let x = a;
  let y = b;
  while (y.length > 0) {
    const r = polyRem(x, y);
    x = y;
    y = r;
  }
  return x;
}

/** Payı √r bileşenlerine ayırır: N = Σ g_r(π)·√r (g_r: r = 1'e indirgenmiş polinomlar). */
function splitByRadical(N: SymNum): Map<number, SymNum> {
  const m = new Map<number, SymNum>();
  for (const t of N) {
    const term: SymNum = [{ c: t.c, p: t.p, r: 1 }];
    m.set(t.r, symAdd(m.get(t.r) ?? SYM_ZERO, term));
  }
  return m;
}

/**
 * N ve D'nin ortak π-polinom çarpanını (varsa) sadeleştirir. Bu SADECE bir
 * okunabilirlik iyileştirmesidir: polyGcd/polyExactDiv katsayı büyümesi yüzünden
 * vazgeçerse (SymOverflowError), sonuç YANLIŞ olmaz, yalnızca SADELEŞMEMİŞ kalır.
 */
function cancelCommonFactor(N: SymNum, D: SymNum): { N: SymNum; D: SymNum } {
  try {
    const comps = splitByRadical(N);
    let g: SymNum = D;
    comps.forEach((poly) => {
      if (poly.length > 0 && g.length > 0 && !(g.length === 1 && g[0].p === 0)) g = polyGcd(g, poly);
    });
    // g sabit (yalnızca π^0 terimi) ise sadeleşecek bir şey yok.
    if (g.length === 0 || (g.length === 1 && g[0].p === 0)) return { N, D };
    const D2 = polyExactDiv(D, g);
    if (D2 === null) return { N, D };
    let N2: SymNum = SYM_ZERO;
    for (const [r, poly] of comps) {
      if (poly.length === 0) continue;
      const q = polyExactDiv(poly, g);
      if (q === null) return { N, D };
      N2 = symAdd(N2, symMul(q, [{ c: { n: 1, d: 1 }, p: 0, r }]));
    }
    return { N: N2, D: D2 };
  } catch (e) {
    if (e instanceof SymOverflowError) return { N, D }; // sadeleştirme atlanır, sonuç yine doğru
    throw e;
  }
}

/**
 * n/d'yi kanonik-benzeri biçime getirir (bkz. dosya başlığı). d = 0 ise null.
 * Adımlar: paydadan kökleri at → tek terimli payda ise düz SymNum'a in →
 * π'de polinom yap → tam sayı katsayı → ilkel payda, pozitif baş katsayı.
 */
/** Bir SymNum'daki farklı kare-çarpansız kök asalı sayısı. */
function distinctRadicalPrimes(x: SymNum): number {
  const primes = new Set<number>();
  for (const t of x) {
    let r = t.r;
    for (let f = 2; r > 1 && f * f <= r; f++) {
      if (r % f === 0) {
        primes.add(f);
        while (r % f === 0) r /= f;
      }
    }
    if (r > 1) primes.add(r);
    if (primes.size > 3) return primes.size;
  }
  return primes.size;
}

export function fracNormalize(n: SymNum, d: SymNum): SymFrac | null {
  if (symIsZero(d)) return null;
  if (symIsZero(n)) return FRAC_ZERO;
  // Maliyet koruması: dörtten fazla FARKLI kök asalı içeren (ya da çok uzun) bir payda,
  // rasyonelleştirmede terimleri üstel büyütür ve sonuç okunamaz olur ⇒ null (çağıran
  // taraf ondalık motora düşer).
  if (d.length > 24 || distinctRadicalPrimes(d) > 3) return null;

  const rat = symRationalize(d);
  if (rat === null) return null;
  let N = symMul(n, rat.mult);
  let D = rat.den;

  if (D.length === 1) {
    const q = symDiv(N, D);
    return q === null ? null : fracFromSym(q);
  }

  // π'de polinom: en küçük π üssü negatifse hem paya hem paydaya π^k çarp.
  const minP = Math.min(...N.map((t) => t.p), ...D.map((t) => t.p));
  if (minP !== 0) {
    const sh = piPow(-minP);
    N = symMul(N, sh);
    D = symMul(D, sh);
  }
  // Ortak π-polinom çarpanını sadeleştir (ör. (π²−2)²(π²+2) / (π²−2)⁴ → (π²+2)/(π²−2)²).
  ({ N, D } = cancelCommonFactor(N, D));
  if (D.length === 1) {
    const q = symDiv(N, D);
    return q === null ? null : fracFromSym(q);
  }

  // Tam sayı katsayı: paydaların OKEK'i ile çarp.
  let L: I = 1;
  for (const t of [...N, ...D]) L = iMul(iDivExact(L, iGcd(L, t.c.d)), t.c.d);
  if (L !== 1) {
    N = scaleBy(N, L);
    D = scaleBy(D, L);
  }
  // Ortak tam sayı çarpanı sadeleştir (payda ilkel, pay ile ortak içerik yok).
  let G: I = 0;
  for (const t of [...N, ...D]) G = G === 0 ? iAbs(t.c.n) : iGcd(G, t.c.n);
  if (G !== 0 && G !== 1) {
    N = scaleBy(N, 1, G);
    D = scaleBy(D, 1, G);
  }
  // Payda baş katsayısı (en yüksek π üssü) pozitif.
  const lead: Term = D.reduce((best, t) => (t.p > best.p || (t.p === best.p && t.r < best.r) ? t : best), D[0]);
  if (lead.c.n < 0) {
    N = symNeg(N);
    D = symNeg(D);
  }
  return { n: N, d: D };
}

export const fracIsZero = (a: SymFrac): boolean => symIsZero(a.n);
export const fracNeg = (a: SymFrac): SymFrac => ({ n: symNeg(a.n), d: a.d });

export function fracAdd(a: SymFrac, b: SymFrac): SymFrac | null {
  return fracNormalize(symAdd(symMul(a.n, b.d), symMul(b.n, a.d)), symMul(a.d, b.d));
}

export function fracSub(a: SymFrac, b: SymFrac): SymFrac | null {
  return fracNormalize(symSub(symMul(a.n, b.d), symMul(b.n, a.d)), symMul(a.d, b.d));
}

export function fracMul(a: SymFrac, b: SymFrac): SymFrac | null {
  return fracNormalize(symMul(a.n, b.n), symMul(a.d, b.d));
}

/** a / b (b ≠ 0). */
export function fracDiv(a: SymFrac, b: SymFrac): SymFrac | null {
  if (symIsZero(b.n)) return null;
  return fracNormalize(symMul(a.n, b.d), symMul(a.d, b.n));
}

export const fracToNumber = (a: SymFrac): number => symToNumber(a.n) / symToNumber(a.d);

/** "(π − √2)/(π² − 2)", "-√2/(π² − 2)", "π/(π² − 2)"; d = 1 ise düz SymNum metni. */
export function fracToString(a: SymFrac, mode: 'decimal' | 'fraction' = 'fraction'): string {
  if (mode === 'decimal') return decimalString(fracToNumber(a));
  if (a.d.length === 1 && a.d[0].p === 0 && a.d[0].r === 1 && a.d[0].c.n === 1 && a.d[0].c.d === 1) {
    return symToString(a.n, mode);
  }
  const nStr = symToString(a.n, mode);
  const dStr = `(${symToString(a.d, mode)})`;
  return a.n.length > 1 ? `(${nStr})/${dStr}` : `${nStr}/${dStr}`;
}

export function fracToLatex(a: SymFrac): string {
  if (a.d.length === 1 && a.d[0].p === 0 && a.d[0].r === 1 && a.d[0].c.n === 1 && a.d[0].c.d === 1) {
    return symToLatex(a.n);
  }
  return `\\frac{${symToLatex(a.n)}}{${symToLatex(a.d)}}`;
}

/** n + d toplam terim sayısı (okunabilirlik eşiği için). */
export const fracTermCount = (a: SymFrac): number => a.n.length + a.d.length;


// ------------------------------------------------------------
// Hücre metninden SymFrac: 1/(π+√2) gibi çok terimli bölenli girişler de okunur
// ------------------------------------------------------------

const FRAC_ONE: SymFrac = fracFromSym(SYM_ONE);

function fracPowInt(a: SymFrac, k: number): SymFrac | null {
  if (!Number.isInteger(k) || Math.abs(k) > 64) return null;
  let result: SymFrac | null = FRAC_ONE;
  let base: SymFrac | null = a;
  for (let e = Math.abs(k); e > 0 && result && base; e = Math.floor(e / 2)) {
    if (e % 2 === 1) result = fracMul(result, base);
    if (e > 1 && result) base = fracMul(base, base);
  }
  if (result === null) return null;
  return k < 0 ? fracDiv(FRAC_ONE, result) : result;
}

/** √(n/d) = √(n·d)/d; kök temsil edilemezse null. */
function fracSqrt(a: SymFrac): SymFrac | null {
  const s = symSqrt(symMul(a.n, a.d));
  return s === null ? null : fracNormalize(s, a.d);
}

function evalFrac(ast: Ast): SymFrac | null {
  switch (ast.k) {
    case 'neg': {
      const x = evalFrac(ast.x);
      return x === null ? null : fracNeg(x);
    }
    case 'bin': {
      const a = evalFrac(ast.a);
      const b = evalFrac(ast.b);
      if (a === null || b === null) return null;
      if (ast.op === '+') return fracAdd(a, b);
      if (ast.op === '-') return fracSub(a, b);
      if (ast.op === '*') return fracMul(a, b);
      return fracDiv(a, b);
    }
    case 'sqrtE': {
      const x = evalFrac(ast.x);
      return x === null ? null : fracSqrt(x);
    }
    case 'pow': {
      const base = evalFrac(ast.a);
      const ex = evalSymAst(ast.b);
      if (base === null || ex === null) return null;
      const r = symRationalOf(ex);
      if (r === null) return null;
      if (r.d === 1) return fracPowInt(base, r.n);
      if (r.d === 2) {
        const root = fracSqrt(base);
        return root === null ? null : fracPowInt(root, r.n);
      }
      return null;
    }
    default: {
      const v = evalSymAst(ast);
      return v === null ? null : fracFromSym(v);
    }
  }
}

/**
 * Hücre metnini SymFrac'a çevirir (gerçel). parseSymbolicInput'tan farkı: bölen
 * π+kök karışık çok terimli olabilir ("1/(π+√2)" = (π−√2)/(π²−2)). Boş/"-" → 0.
 * Ayrıştırılamıyorsa (ya da temsil edilemiyorsa) null.
 */
export function parseFracInput(text: string): SymFrac | null {
  try {
    const t = text.trim();
    if (t === '' || t === '-') return FRAC_ZERO;
    const ast = parseExpressionAst(t, false);
    return ast === null ? null : evalFrac(ast);
  } catch {
    return null;
  }
}
