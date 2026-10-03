// Core of the symbolic engine (SymNum). A symbolic number is a sum of terms with rational
// coefficients:
//
//     value = Σ  cᵢ · π^pᵢ · √rᵢ
//
//   cᵢ : rational coefficient (n/d, integers, reduced)
//   pᵢ : power of π (integer, may be negative: p = -1 for 1/π)
//   rᵢ : square-free positive integer (1 means no root)
//
// The representation is closed under add, subtract and multiply, and it is unique (π is
// transcendental, and √r for distinct square-free r are independent over the rationals), so two
// expressions are equal only if their terms match exactly. This makes the "is it zero?" test exact.
//
// Division is possible for:
//   - single-term expressions (1/√2 = √2/2, 1/π, ...),
//   - multi-term sums of roots with no π (or the same power of π in every term): the denominator
//     is rationalized with conjugates (1/(√2+√3) = √3 − √2).
// Dividing by a multi-term expression mixing π and roots (1/(π+√2)) cannot be represented:
// symDiv returns null and the caller falls back to the decimal engine (see symFrac.ts).
//
// Numeric safety: integers are held as number and promoted to bigint beyond the safe range (see
// type I). SymOverflowError signals that symbolic tracking cannot continue; callers catch it and
// fall back to the decimal engine instead of producing a wrong result.
//
// This file deliberately does not import numberFormat.ts (numberFormat imports this file, and
// that would create a circular dependency).

import { getDecimalPlaces } from './displaySettings';

export class SymOverflowError extends Error {
  constructor() {
    super('SymNum: tam sayı taşması');
    this.name = 'SymOverflowError';
  }
}

/**
 * Integer: `number` when |x| ≤ 2⁵³−1, `bigint` beyond that (hybrid). A value that fits is always
 * demoted to number, so comparisons like `x === 1` or `x < 0` work for both types and the fast
 * path is kept. Do arithmetic only through iAdd/iMul/... below (mixing number and bigint throws
 * a TypeError).
 */
export type I = number | bigint;

/** İndirgenmiş rasyonel: d > 0, gcd(|n|, d) = 1. */
export interface Q {
  n: I;
  d: I;
}

export interface Term {
  c: Q;
  p: number;
  r: number;
}

/** Kanonik biçim: sıfır katsayı yok, (p, r) çiftleri tekil, sıralı. Boş dizi = 0. */
export type SymNum = readonly Term[];

const MAX_ROOT = 1e12;

// ------------------------------------------------------------
// Rasyonel aritmetik (taşma korumalı)
// ------------------------------------------------------------

function safe(x: number): number {
  if (!Number.isSafeInteger(x)) throw new SymOverflowError();
  return x;
}

const MAX_SAFE_BIG = BigInt(Number.MAX_SAFE_INTEGER);
const big = (x: I): bigint => (typeof x === 'bigint' ? x : BigInt(x));
const demote = (x: bigint): I => (x <= MAX_SAFE_BIG && x >= -MAX_SAFE_BIG ? Number(x) : x);

export function iAdd(a: I, b: I): I {
  if (typeof a === 'number' && typeof b === 'number') {
    const s = a + b;
    if (Number.isSafeInteger(s)) return s;
  }
  return demote(big(a) + big(b));
}

export function iMul(a: I, b: I): I {
  if (typeof a === 'number' && typeof b === 'number') {
    const p = a * b;
    if (Number.isSafeInteger(p)) return p;
  }
  return demote(big(a) * big(b));
}

export const iNeg = (a: I): I => (typeof a === 'number' ? (a === 0 ? 0 : -a) : demote(-a));
export const iAbs = (a: I): I => (a < 0 ? iNeg(a) : a);

/** a / b, b | a olduğu bilinen (kalansız) bölme. */
export function iDivExact(a: I, b: I): I {
  if (typeof a === 'number' && typeof b === 'number') return a / b;
  return demote(big(a) / big(b));
}

/** ebob(|a|, |b|) ≥ 1 (ikisi de 0 ise 1). */
export function iGcd(a: I, b: I): I {
  if (typeof a === 'number' && typeof b === 'number') {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) [x, y] = [y, x % y];
    return x || 1;
  }
  let x = big(iAbs(a));
  let y = big(iAbs(b));
  const zero = BigInt(0);
  while (y !== zero) [x, y] = [y, x % y];
  return x === zero ? 1 : demote(x);
}

/** Sonuç number olmak ZORUNDAYSA (kök/√ işlemleri): bigint ise taşma sayılır. */
function toNum(x: I): number {
  if (typeof x === 'bigint') throw new SymOverflowError();
  return x;
}

/** Rasyonelin en yakın double değeri (çok büyük pay/payda için ölçeklenir). */
export function qToNumber(q: Q): number {
  if (typeof q.n === 'number' && typeof q.d === 'number') return q.n / q.d;
  let a = big(q.n);
  let b = big(q.d);
  const bits = (x: bigint) => (x < BigInt(0) ? (-x).toString(2).length : x.toString(2).length);
  const m = Math.max(bits(a), bits(b));
  if (m > 1000) {
    const sh = BigInt(m - 1000);
    a >>= sh;
    b >>= sh;
    if (b === BigInt(0)) return a === BigInt(0) ? 0 : a > BigInt(0) ? Infinity : -Infinity;
  }
  return Number(a) / Number(b);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

function qMake(n: I, d: I): Q {
  if (n === 0) return { n: 0, d: 1 };
  if (d < 0) {
    n = iNeg(n);
    d = iNeg(d);
  }
  const g = iGcd(n, d);
  if (g !== 1) {
    n = iDivExact(n, g);
    d = iDivExact(d, g);
  }
  return { n, d };
}

const Q_ZERO: Q = { n: 0, d: 1 };
const Q_ONE: Q = { n: 1, d: 1 };

function qIsZero(a: Q): boolean {
  return a.n === 0;
}

function qAdd(a: Q, b: Q): Q {
  const g = iGcd(a.d, b.d);
  const da = iDivExact(a.d, g);
  const db = iDivExact(b.d, g);
  return qMake(iAdd(iMul(a.n, db), iMul(b.n, da)), iMul(a.d, db));
}

function qMul(a: Q, b: Q): Q {
  const g1 = iGcd(a.n, b.d);
  const g2 = iGcd(b.n, a.d);
  return qMake(iMul(iDivExact(a.n, g1), iDivExact(b.n, g2)), iMul(iDivExact(a.d, g2), iDivExact(b.d, g1)));
}

// ------------------------------------------------------------
// Kare-çarpansız ayrıştırma:  n = s² · r  (r kare-çarpansız)
// ------------------------------------------------------------

function squareFreeSplit(n: number): { s: number; r: number } {
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_ROOT) throw new SymOverflowError();
  let rem = n;
  let s = 1;
  let r = 1;
  for (let i = 2; i * i <= rem; i++) {
    if (rem % i !== 0) continue;
    let e = 0;
    while (rem % i === 0) {
      rem /= i;
      e++;
    }
    s *= Math.pow(i, Math.floor(e / 2));
    if (e % 2 === 1) r *= i;
  }
  r *= rem; // kalan (varsa) asal çarpan, kuvveti 1
  return { s, r };
}

// ------------------------------------------------------------
// Terim ve SymNum işlemleri
// ------------------------------------------------------------

const termKey = (t: Term) => `${t.p}|${t.r}`;

/** Görüntüleme/kanonik sıralama: rasyonel → kökler → π'li → 1/π'li. */
function termOrder(a: Term, b: Term): number {
  const group = (t: Term) => (t.p === 0 ? 0 : t.p > 0 ? 1 : 2);
  const ga = group(a);
  const gb = group(b);
  if (ga !== gb) return ga - gb;
  if (Math.abs(a.p) !== Math.abs(b.p)) return Math.abs(a.p) - Math.abs(b.p);
  return a.r - b.r;
}

// Global safety limit: if the number of distinct (p, r) keys exceeds this, give up. Not the same
// as the readability limit (MAX_RESULT_TERMS = 24, applied to final result cells only): this one
// applies on every symAdd/symMul, including intermediate steps (cofactor expansion, successive
// elimination), and keeps a calculation from growing exponentially even if no call site checks.
// When exceeded, SymOverflowError is thrown; the symbolic engine already catches it to fall back
// to the decimal engine.
const MAX_INTERMEDIATE_TERMS = 200;

function normalize(terms: Term[]): SymNum {
  const map = new Map<string, Term>();
  for (const t of terms) {
    const k = termKey(t);
    const prev = map.get(k);
    map.set(k, prev ? { c: qAdd(prev.c, t.c), p: t.p, r: t.r } : t);
    if (map.size > MAX_INTERMEDIATE_TERMS) throw new SymOverflowError();
  }
  return Array.from(map.values())
    .filter((t) => !qIsZero(t.c))
    .sort(termOrder);
}

export const SYM_ZERO: SymNum = [];
export const SYM_ONE: SymNum = [{ c: Q_ONE, p: 0, r: 1 }];

export function symFromRational(n: I, d: I = 1): SymNum {
  if (d === 0) throw new SymOverflowError();
  if (typeof n === 'number') safe(n);
  if (typeof d === 'number') safe(d);
  const c = qMake(n, d);
  return qIsZero(c) ? SYM_ZERO : [{ c, p: 0, r: 1 }];
}

export function symIsZero(a: SymNum): boolean {
  return a.length === 0;
}

/** π veya kök içeren (yani rasyonel OLMAYAN) bir terim var mı? */
export function symIsIrrational(a: SymNum): boolean {
  return a.some((t) => t.p !== 0 || t.r !== 1);
}

export function symAdd(a: SymNum, b: SymNum): SymNum {
  return normalize([...a, ...b]);
}

export function symNeg(a: SymNum): SymNum {
  return a.map((t) => ({ c: { n: iNeg(t.c.n), d: t.c.d }, p: t.p, r: t.r }));
}

export function symSub(a: SymNum, b: SymNum): SymNum {
  return symAdd(a, symNeg(b));
}

function mulTerm(a: Term, b: Term): Term {
  // √r1 · √r2 = g · √((r1/g)(r2/g))   (g = gcd; r1/g ve r2/g aralarında asal
  // ve kare-çarpansız olduğundan çarpımları da kare-çarpansızdır)
  const g = gcd(a.r, b.r);
  const r = safe((a.r / g) * (b.r / g));
  const c = qMul(qMul(a.c, b.c), { n: g, d: 1 });
  return { c, p: a.p + b.p, r };
}

export function symMul(a: SymNum, b: SymNum): SymNum {
  const out: Term[] = [];
  for (const x of a) for (const y of b) out.push(mulTerm(x, y));
  return normalize(out);
}

/** Terimlerin π kuvvetini sıfırlar (aynı (p,r) anahtarı tekil kaldığı için normalize gerekmez). */
function withoutPi(a: SymNum): SymNum {
  return a.map((t) => ({ c: t.c, p: 0, r: t.r }));
}

/** r'nin en küçük asal çarpanı (r ≥ 2). */
function smallestPrimeFactor(r: number): number {
  for (let i = 2; i * i <= r; i++) if (r % i === 0) return i;
  return r;
}

/**
 * Rationalizes the denominator of b, a non-zero expression without π (rational and root terms
 * only). Conjugate method: pick a prime q appearing in b and write b = A + B·√q (no q in A, B);
 * then b·(A − B·√q) = A² − q·B² no longer contains √q. Repeat for every root prime until the
 * denominator is rational.
 *   a / b = (a · Πconjugates) / (b · Πconjugates)
 * Returns { num: Πconjugates, den: single rational term } or null.
 */
function rationalizeDenominator(b: SymNum): { num: SymNum; den: SymNum } | null {
  let num: SymNum = SYM_ONE;
  let den: SymNum = b;
  // Her turda en az bir asal elenir; asal sayısı r ≤ MAX_ROOT için sınırlıdır.
  for (let guard = 0; guard < 16; guard++) {
    const rad = den.find((t) => t.r > 1);
    if (!rad) break;
    // Her eşlenik adımı terim sayısını yaklaşık ikiye katlar; okunamayacak ve çok pahalı
    // bir payda (ör. dört-beş farklı kök) oluşmadan bırak.
    if (den.length > 48) return null;
    const q = smallestPrimeFactor(rad.r);
    // A: q'suz terimler, B√q: q'lu terimler → eşlenik = A − B√q
    const conj: SymNum = normalize(
      den.map((t) => (t.r % q === 0 ? { c: { n: iNeg(t.c.n), d: t.c.d }, p: t.p, r: t.r } : t))
    );
    den = symMul(den, conj);
    num = symMul(num, conj);
  }
  if (den.length !== 1 || den[0].r !== 1 || den[0].p !== 0) return null;
  return { num, den };
}

/**
 * b (sıfırdan farklı) için eşlenik çarpanı `mult` ve KÖKSÜZ paydayı `den` = b·mult
 * döndürür (π'li olabilir, çok terimli olabilir): 1/b = mult / den.
 * Örn. b = π + √2 ⇒ mult = π − √2, den = π² − 2. Sıfır ya da başarısızsa null.
 */
export function symRationalize(b: SymNum): { mult: SymNum; den: SymNum } | null {
  let mult: SymNum = SYM_ONE;
  let den: SymNum = b;
  for (let guard = 0; guard < 16; guard++) {
    const rad = den.find((t) => t.r > 1);
    if (!rad) break;
    const q = smallestPrimeFactor(rad.r);
    const conj: SymNum = normalize(
      den.map((t) => (t.r % q === 0 ? { c: { n: iNeg(t.c.n), d: t.c.d }, p: t.p, r: t.r } : t))
    );
    den = symMul(den, conj);
    mult = symMul(mult, conj);
  }
  if (den.length === 0 || den.some((t) => t.r !== 1)) return null;
  return { mult, den };
}

/**
 * b sembolik olarak ters çevrilebilir mi (a/b temsil edilebilir mi)?
 * Sıfırdan farklı olmalı ve ya tek terimli ya da tüm terimleri aynı π
 * kuvvetini taşıyan (π'yi dışarı çekince yalnızca kök toplamı kalan) olmalı.
 */
export function symIsInvertible(b: SymNum): boolean {
  if (b.length === 0) return false;
  if (b.length === 1) return true;
  return b.every((t) => t.p === b[0].p);
}

/**
 * a / b. b sıfırsa veya temsil edilemiyorsa null (bkz. dosya başlığı).
 *   Tek terimli:  1 / (c·π^p·√r) = (1 / (c·r)) · π^(−p) · √r
 *   Çok terimli:  π^p ortak çarpanı çekilir, kalan kök toplamı eşlenikle
 *                 rasyonelleştirilir.
 */
export function symDiv(a: SymNum, b: SymNum): SymNum | null {
  if (b.length === 0) return null;
  if (b.length === 1) {
    const t = b[0];
    const inv: Term = {
      c: qMake(t.c.d, iMul(t.c.n, t.r)),
      p: -t.p,
      r: t.r,
    };
    return symMul(a, [inv]);
  }
  if (!symIsInvertible(b)) return null;
  const p0 = b[0].p;
  const rat = rationalizeDenominator(withoutPi(b));
  if (rat === null) return null;
  const scaled = symMul(a, rat.num);
  const inner = symDiv(scaled, rat.den);
  if (inner === null) return null;
  return p0 === 0 ? inner : symMul(inner, [{ c: Q_ONE, p: -p0, r: 1 }]);
}

function qNeg(a: Q): Q {
  return { n: iNeg(a.n), d: a.d };
}

function qSub(a: Q, b: Q): Q {
  return qAdd(a, qNeg(b));
}

function qDiv(a: Q, b: Q): Q {
  return qMake(iMul(a.n, b.d), iMul(a.d, b.n));
}

function qEquals(a: Q, b: Q): boolean {
  return a.n === b.n && a.d === b.d; // ikisi de qMake ile indirgenmiş kabul edilir
}

/**
 * Negatif olmayan bir rasyonel sayının karekökünü c·√r biçiminde (rasyonel
 * katsayı × kare-çarpansız kök) verir - squareFreeSplit'in payda/pay için
 * ayrı ayrı uygulanıp sonra paydanın rasyonelleştirilmesiyle elde edilir.
 * Örnek: √(12) = 2√3, √(9/2) = (3/2)√2. x=0 için {c:0,r:1} döner.
 */
function qSqrtRadical(x: Q): { c: Q; r: number } | null {
  if (x.n < 0) return null;
  if (x.n === 0) return { c: Q_ZERO, r: 1 };
  const sfN = squareFreeSplit(toNum(x.n));
  const sfD = squareFreeSplit(toNum(x.d));
  const sfE = squareFreeSplit(safe(sfN.r * sfD.r));
  const c = qMake(safe(sfN.s * sfE.s), safe(sfD.s * sfD.r));
  return { c, r: sfE.r };
}

/** Negatif olmayan bir rasyonelin karekökü, yine rasyonelse döner (aksi halde null). */
function qSqrt(x: Q): Q | null {
  if (x.n < 0) return null;
  const sqrtInt = (v: number): number | null => {
    const s = Math.round(Math.sqrt(v));
    return s * s === v ? s : null;
  };
  const sn = sqrtInt(toNum(x.n));
  const sd = sqrtInt(toNum(x.d));
  if (sn === null || sd === null) return null;
  return qMake(sn, sd);
}

/**
 * Square root of a two-term "rational + single root" expression A0 + b·√D (A0, b rational;
 * D > 1 square-free; no π), returned as a sum/difference of two roots when possible (denesting).
 *
 * Classic result (Landau / Borodin): if S = A0² − D·b² is a rational perfect square, then
 *   x = (A0 + √S)/2,  y = (A0 − √S)/2   (rational, both ≥ 0)
 *   √(A0 + b√D) = √x + sign(b)·√y       (x ≥ y, so the result is ≥ 0)
 * Proof: (√x + √y)² = x + y + 2√(xy) = A0 + 2√(xy), with xy = (A0² − S)/4 = D·b²/4,
 * so 2√(xy) = |b|√D.
 *
 * √x and √y each reduce to c·√r (qSqrtRadical), so the result is representable in SymNum even
 * with different roots: √(5 − 2√6) = √3 − √2, √(7 + 4√3) = 2 + √3, √(3 + 2√2) = 1 + √2.
 * If S is not a perfect square (or A0 < 0, i.e. the expression is negative/complex) it cannot be
 * denested: returns null and the caller falls back to the decimal engine.
 * The result is verified by squaring it and comparing exactly with the input.
 */
function denestBinomial(a: SymNum): SymNum | null {
  if (a.length !== 2) return null;
  const [t0, t1] = a;
  if (t0.p !== 0 || t1.p !== 0) return null; // π karışıksa bu yöntem uygulanmaz
  let A0: Q, b: Q, D: number;
  if (t0.r === 1 && t1.r > 1) {
    A0 = t0.c;
    b = t1.c;
    D = t1.r;
  } else if (t1.r === 1 && t0.r > 1) {
    A0 = t1.c;
    b = t0.c;
    D = t0.r;
  } else {
    return null; // rasyonel + tek kök biçiminde değil (ör. √2 + √3)
  }

  const DQ = qMake(D, 1);
  const S = qSub(qMul(A0, A0), qMul(DQ, qMul(b, b))); // A0² − D·b²
  const rootS = qSqrt(S);
  if (rootS === null) return null;

  const half = qMake(1, 2);
  const x = qMul(qAdd(A0, rootS), half);
  const y = qMul(qSub(A0, rootS), half);
  if (x.n < 0 || y.n < 0) return null; // A0 < 0 ⇒ radikand ≤ 0

  const rx = qSqrtRadical(x);
  const ry = qSqrtRadical(y);
  if (rx === null || ry === null) return null;
  const yc = b.n < 0 ? qNeg(ry.c) : ry.c;
  const root = normalize([
    { c: rx.c, p: 0, r: rx.r },
    { c: yc, p: 0, r: ry.r },
  ]);

  // Kesin doğrulama (kanonik biçim sayesinde eşitlik testi kesindir) ve
  // "√ sonucu negatif olamaz" kuralı.
  if (root.length === 0 || !symIsZero(symSub(symMul(root, root), a))) return null;
  if (symToNumber(root) < 0) return null;
  return root;
}

/**
 * Tries to represent the square root of a SymNum as a SymNum. Two cases:
 *   1) Single term without a root (r=1): rational × π^(even power):
 *      √(c·π^p) = √c · π^(p/2). With r>1 this is never representable, since the square of the
 *      result is always rational.
 *   2) Two terms A0 + b·√D (no π, rational + one root): if A0² − D·b² is a perfect square the
 *      result is √x ± √y (may involve different roots, e.g. √(5−2√6) = √3−√2); see denestBinomial.
 * Everything else (3+ terms, π mixed with a root in two terms, A0² − D·b² not a perfect square)
 * returns null and the caller drops symbolic tracking in favor of the decimal engine
 * (see symbolicOps.ts).
 */
export function symSqrt(a: SymNum): SymNum | null {
  if (a.length === 0) return SYM_ZERO;
  if (a.length === 2) return denestBinomial(a);
  if (a.length !== 1) return null;
  const t = a[0];
  if (t.r !== 1) return null;
  if (t.p % 2 !== 0) return null;
  if (t.c.n < 0) return null;
  const rad = qSqrtRadical(t.c);
  if (rad === null) return null;
  return normalize([{ c: rad.c, p: t.p / 2, r: rad.r }]);
}

export function symToNumber(a: SymNum): number {
  let sum = 0;
  for (const t of a) {
    let v = qToNumber(t.c);
    if (t.p !== 0) v *= Math.pow(Math.PI, t.p);
    if (t.r !== 1) v *= Math.sqrt(t.r);
    sum += v;
  }
  return sum;
}

// ------------------------------------------------------------
// Metin gösterimi
// ------------------------------------------------------------

const SUPERSCRIPT: Record<number, string> = { 2: '²', 3: '³' };
const piText = (k: number) => (k === 1 ? 'π' : SUPERSCRIPT[k] ? `π${SUPERSCRIPT[k]}` : `π^${k}`);
const piLatex = (k: number) => (k === 1 ? '\\pi' : `\\pi^{${k}}`);

/** Ondalık mod için: sayıyı Ayarlar'daki basamak sayısıyla yuvarlayıp metne çevirir. */
export function decimalString(v: number): string {
  const scale = Math.pow(10, getDecimalPlaces());
  const r = Math.round(v * scale) / scale;
  return String(Object.is(r, -0) ? 0 : r);
}

/** Ondalık karmaşık sayı metni: "2.5 + 0.25i", "i", "-i", "1 - 4i", "5". */
export function decimalComplexString(re: number, im: number): string {
  const r = decimalString(re);
  const i = decimalString(Math.abs(im));
  const imNeg = im < 0 && i !== '0';
  const imBody = i === '1' ? 'i' : `${i}i`;
  if (i === '0') return r;
  if (r === '0') return (imNeg ? '-' : '') + imBody;
  return `${r} ${imNeg ? '-' : '+'} ${imBody}`;
}

function decimalText(n: I, d: I): string {
  if (d === 1) return String(n); // tam sayı: bigint dahil TÜM basamaklar
  // Kullanıcının Ayarlar → Ondalık Basamak seçimiyle AYNI hassasiyet (bkz.
  // displaySettings.ts) - formatNumber'ın ondalık gösterimiyle tutarlı olsun.
  const scale = Math.pow(10, getDecimalPlaces());
  const v = Math.round(qToNumber({ n, d }) * scale) / scale;
  return String(Object.is(v, -0) ? 0 : v);
}

/**
 * Bir terimin (işaretsiz) metni. `suffix` (ör. "i" ya da "√(Δ)") verilirse terim
 * bu sembolle ÇARPILMIŞ gösterilir ve payda kalır: "3π/4" + "i" → "3πi/4".
 */
export function symTermAbs(t: Term, mode: 'decimal' | 'fraction', suffix = ''): string {
  const n = iAbs(t.c.n);
  const d = t.c.d;
  if (suffix) {
    if (t.p === 0 && t.r === 1 && mode === 'decimal') {
      const dec = decimalText(n, d);
      return (dec === '1' ? '' : dec) + suffix;
    }
    // Sanal birim katsayıdan hemen sonra ("2i√3", "iπ") - "√3i" √(3i) gibi okunabilir;
    // opak kök ("√(Δ)") ise sona eklenir ("3π√(Δ)/4").
    const front = suffix === 'i';
    const numS =
      (n !== 1 ? String(n) : '') + (front ? suffix : '') + (t.p > 0 ? piText(t.p) : '') + (t.r > 1 ? `√${t.r}` : '') + (front ? '' : suffix);
    const denF = [d !== 1 ? String(d) : '', t.p < 0 ? piText(-t.p) : ''].filter(Boolean);
    if (denF.length === 0) return numS;
    return `${numS}/${denF.length > 1 ? `(${denF.join('')})` : denF.join('')}`;
  }
  if (t.p === 0 && t.r === 1) {
    if (mode === 'decimal') return decimalText(n, d);
    return d === 1 ? `${n}` : `${n}/${d}`;
  }
  const num =
    (n !== 1 ? String(n) : '') + (t.p > 0 ? piText(t.p) : '') + (t.r > 1 ? `√${t.r}` : '');
  const denFactors = [d !== 1 ? String(d) : '', t.p < 0 ? piText(-t.p) : ''].filter(Boolean);
  const numStr = num || '1';
  if (denFactors.length === 0) return numStr;
  const denStr = denFactors.join('');
  return `${numStr}/${denFactors.length > 1 ? `(${denStr})` : denStr}`;
}

const termAbs = (t: Term, mode: 'decimal' | 'fraction') => symTermAbs(t, mode);

/**
 * Sembolle çarpılmış terimlerin (ör. karmaşık bir sayının a + b·i toplamı)
 * işaretli toplam metni. `items[k].suffix` boşsa düz terimdir.
 */
export function symJoinTerms(items: { t: Term; suffix: string }[], mode: 'decimal' | 'fraction' = 'fraction'): string {
  if (items.length === 0) return '0';
  // Ondalık mod: gerçel ('') ve sanal ('i') kısımlar ayrı ayrı toplanıp TEK sayı olarak
  // yazılır (köklü/π'li terim kalmaz). Başka bir sembolle çarpılmış terim varsa eski yol.
  if (mode === 'decimal' && items.every((x) => x.suffix === '' || x.suffix === 'i')) {
    let re = 0;
    let im = 0;
    for (const { t, suffix } of items) (suffix === 'i' ? (im += symToNumber([t])) : (re += symToNumber([t])));
    return decimalComplexString(re, im);
  }
  let out = '';
  items.forEach(({ t, suffix }, i) => {
    const neg = t.c.n < 0;
    const body = symTermAbs(t, mode, suffix);
    if (i === 0) out += (neg ? '-' : '') + body;
    else out += (neg ? ' - ' : ' + ') + body;
  });
  return out;
}

/** Sembolik sayıyı okunabilir metne çevirir: "0", "√2 + √3", "3π/4", "π√2 - 1/2". */
export function symToString(a: SymNum, mode: 'decimal' | 'fraction' = 'fraction'): string {
  if (a.length === 0) return '0';
  // Ondalık mod: toplamın sayısal değeri tek ondalık sayı olarak yazılır ("-1 + √6" → 1.44949).
  if (mode === 'decimal') return decimalString(symToNumber(a));
  let out = '';
  a.forEach((t, i) => {
    const neg = t.c.n < 0;
    const body = termAbs(t, mode);
    if (i === 0) out += (neg ? '-' : '') + body;
    else out += (neg ? ' - ' : ' + ') + body;
  });
  return out;
}

/** Adım açıklamalarında kullanılan, her zaman parantezli biçim. */
export function symToStringParen(a: SymNum, mode: 'decimal' | 'fraction' = 'fraction'): string {
  return `(${symToString(a, mode)})`;
}

function termLatexAbs(t: Term): string {
  const n = iAbs(t.c.n);
  const d = t.c.d;
  if (t.p === 0 && t.r === 1) return d === 1 ? `${n}` : `\\frac{${n}}{${d}}`;
  const num =
    (n !== 1 ? String(n) : '') + (t.p > 0 ? piLatex(t.p) : '') + (t.r > 1 ? `\\sqrt{${t.r}}` : '');
  const den = (d !== 1 ? String(d) : '') + (t.p < 0 ? piLatex(-t.p) : '');
  return den ? `\\frac{${num || '1'}}{${den}}` : num || '1';
}

/** LaTeX gösterimi (matematik modu içinde kullanılır). */
export function symToLatex(a: SymNum): string {
  if (a.length === 0) return '0';
  let out = '';
  a.forEach((t, i) => {
    const neg = t.c.n < 0;
    const body = termLatexAbs(t);
    if (i === 0) out += (neg ? '-' : '') + body;
    else out += (neg ? ' - ' : ' + ') + body;
  });
  return out;
}

/**
 * Düz metin etiketindeki (unicode) √, π ve tek-terimli kesirleri LaTeX'e
 * çevirir: "3π/4" → "\frac{3\pi}{4}", "√2/2" → "\frac{\sqrt{2}}{2}".
 * Birden çok terimli toplamlarda yalnızca sembol dönüşümü yapılır.
 */
export function latexifyLabel(label: string): string {
  const plainSymbols = (s: string) =>
    s
      .replace(/√(\d+)/g, '\\sqrt{$1}')
      .replace(/π\^(\d+)/g, '\\pi^{$1}')
      .replace(/π²/g, '\\pi^{2}')
      .replace(/π³/g, '\\pi^{3}')
      .replace(/π/g, '\\pi');

  // "√(...)" (opak kök, iç içe olabilir) → \sqrt{...}; parantez dengesi gözetilir.
  const symbols = (s: string): string => {
    let out = '';
    let i = 0;
    while (i < s.length) {
      if (s[i] === '√' && s[i + 1] === '(') {
        const close = matchParen(s, i + 1);
        if (close !== -1) {
          out += `\\sqrt{${symbols(s.slice(i + 2, close))}}`;
          i = close + 1;
          continue;
        }
      }
      let j = i;
      while (j < s.length && !(s[j] === '√' && s[j + 1] === '(')) j++;
      if (j === i) j = i + 1;
      out += plainSymbols(s.slice(i, j));
      i = j;
    }
    return out;
  };

  const stripParens = (s: string) => (/^\(.*\)$/.test(s) ? s.slice(1, -1) : s);

  // "(pay)/(payda)" (SymFrac etiketi, toplamlı pay/payda): \frac
  const pf = label.match(/^(-?)(\(.*\))\/(\(.*\))$/);
  if (pf && matchParen(pf[2], 0) === pf[2].length - 1 && matchParen(pf[3], 0) === pf[3].length - 1) {
    return `${pf[1]}\\frac{${symbols(pf[2].slice(1, -1))}}{${symbols(pf[3].slice(1, -1))}}`;
  }

  // Tek terimli, tek en-üst-düzey "/" içeren etiketleri \frac yap.
  const m = label.match(/^(-?)([^/+]*?[^/+\s-][^/]*?)\s*\/\s*(\([^)]*\)|[^/+\s-][^/+ ]*)$/);
  if (m && !/\s[+-]\s/.test(label) && !label.includes('√(')) {
    return `${m[1]}\\frac{${symbols(stripParens(m[2]))}}{${symbols(stripParens(m[3]))}}`;
  }
  return symbols(label);
}

/** s[start] '(' ise eşleşen ')' indeksi, yoksa -1. */
function matchParen(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return i;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

// ------------------------------------------------------------
// Giriş metnini ayrıştırma
// ------------------------------------------------------------

/**
 * "123", "0,37", ".5" gibi bir ondalık sayıyı TAM rasyonel olarak okur
 * (0.37 → 37/100). En fazla 60 anlamlı basamak (büyük değerler bigint).
 */
function parseDecimalToken(tok: string): Q {
  const s = tok.replace(',', '.');
  const [ip, fp = ''] = s.split('.');
  if (ip.length + fp.length > 60) throw new SymOverflowError();
  const digits = (ip + fp) || '0';
  return qMake(demote(BigInt(digits)), demote(BigInt(10) ** BigInt(fp.length)));
}

// Grammar (a whole cell):
//   expr    := ['+'|'-'] term (('+'|'-') term)*
//   term    := product ('/' product)*     (division binds weaker than juxtaposition:
//                                          "1/2π" = 1/(2π), "3√2/4" = (3√2)/4)
//   product := factor (['*'] factor)*     (juxtaposition = multiplication: "2√3", "3pi")
//   factor  := number | 'pi' | 'π' | '√' integer | '(' expr ')'   (exponents: see factor below)
// The old single-term form is a subset of this grammar.
// Parsing produces an AST that can be evaluated both exactly (SymNum) and numerically (number),
// so valid expressions that cannot be represented symbolically (e.g. 1/(π+√2)) can still be read
// by the numeric engine.

export type Ast =
  | { k: 'num'; text: string }
  | { k: 'pi' }
  | { k: 'i' }
  | { k: 'sqrt'; n: number }
  | { k: 'sqrtE'; x: Ast } // √(ifade)
  | { k: 'pow'; a: Ast; b: Ast } // a^b
  | { k: 'neg'; x: Ast }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; a: Ast; b: Ast };

const MAX_EXPR_LENGTH = 2000;
const MAX_EXPR_DEPTH = 16;

export function parseExpressionAst(text: string, allowI = false): Ast | null {
  if (text.length > MAX_EXPR_LENGTH) return null;
  let pos = 0;
  let depth = 0;

  const skipWs = () => {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
  };
  const peek = (): string => {
    skipWs();
    return pos < text.length ? text[pos] : '';
  };
  const startsFactor = (): boolean => {
    skipWs();
    const rest = text.slice(pos, pos + 2);
    return /^[0-9.,(√π]/.test(rest) || /^pi/i.test(rest) || (allowI && /^i/i.test(rest));
  };

  // Her ayrıştırma işlevi null dönerse ifade geçersizdir.
  const atom = (): { ast: Ast; isNum: boolean } | null => {
    skipWs();
    const numRe = /(\d+(?:[.,]\d*)?|[.,]\d+)/y;
    numRe.lastIndex = pos;
    const nm = numRe.exec(text);
    if (nm) {
      pos = numRe.lastIndex;
      return { ast: { k: 'num', text: nm[1] }, isNum: true };
    }
    if (text[pos] === 'π') {
      pos += 1;
      return { ast: { k: 'pi' }, isNum: false };
    }
    if (/^pi/i.test(text.slice(pos, pos + 2))) {
      pos += 2;
      return { ast: { k: 'pi' }, isNum: false };
    }
    if (allowI && /^i/i.test(text.slice(pos, pos + 1))) {
      pos += 1;
      return { ast: { k: 'i' }, isNum: false };
    }
    if (text[pos] === '√') {
      pos += 1;
      if (text[pos] === '(') {
        // √(ifade)
        pos += 1;
        if (++depth > MAX_EXPR_DEPTH) return null;
        const inner = expr();
        if (inner === null) return null;
        if (peek() !== ')') return null;
        pos += 1;
        depth -= 1;
        return { ast: { k: 'sqrtE', x: inner }, isNum: false };
      }
      const dm = /\d+/y;
      dm.lastIndex = pos;
      const m = dm.exec(text);
      if (!m) return null;
      pos = dm.lastIndex;
      return { ast: { k: 'sqrt', n: parseInt(m[0], 10) }, isNum: false };
    }
    if (text[pos] === '(') {
      pos += 1;
      if (++depth > MAX_EXPR_DEPTH) return null;
      const inner = expr();
      if (inner === null) return null;
      if (peek() !== ')') return null;
      pos += 1;
      depth -= 1;
      return { ast: inner, isNum: false };
    }
    return null;
  };

  // çarpan := atom ['^' [işaret] (sayı | '(' ifade ')')]*   (üs, bitişik yazımdan GÜÇLÜ bağlanır: 2π^2 = 2·(π²))
  const factor = (): { ast: Ast; isNum: boolean } | null => {
    const a = atom();
    if (a === null) return null;
    let ast = a.ast;
    let isNum = a.isNum;
    while (peek() === '^') {
      pos += 1;
      skipWs();
      let negExp = false;
      if (text[pos] === '-' || text[pos] === '+') {
        negExp = text[pos] === '-';
        pos += 1;
        skipWs();
      }
      let e: Ast;
      if (text[pos] === '(') {
        pos += 1;
        if (++depth > MAX_EXPR_DEPTH) return null;
        const inner = expr();
        if (inner === null) return null;
        if (peek() !== ')') return null;
        pos += 1;
        depth -= 1;
        e = inner;
      } else {
        const nre = /(\d+(?:[.,]\d*)?|[.,]\d+)/y;
        nre.lastIndex = pos;
        const m = nre.exec(text);
        if (!m) return null;
        pos = nre.lastIndex;
        e = { k: 'num', text: m[1] };
      }
      ast = { k: 'pow', a: ast, b: negExp ? { k: 'neg', x: e } : e };
      isNum = false;
    }
    return { ast, isNum };
  };

  const product = (): Ast | null => {
    const first = factor();
    if (first === null) return null;
    let acc = first.ast;
    let lastIsNum = first.isNum;
    for (;;) {
      const c = peek();
      let explicit = false;
      if (c === '*' || c === '×' || c === '·') {
        pos += 1;
        explicit = true;
      } else if (!startsFactor()) {
        break;
      }
      const next = factor();
      if (next === null) return null;
      // "2 3" (boşlukla ayrılmış iki sayı) belirsizdir - geçersiz say.
      if (!explicit && lastIsNum && next.isNum) return null;
      acc = { k: 'bin', op: '*', a: acc, b: next.ast };
      lastIsNum = next.isNum;
    }
    return acc;
  };

  const term = (): Ast | null => {
    let acc = product();
    if (acc === null) return null;
    while (peek() === '/') {
      pos += 1;
      const rhs = product();
      if (rhs === null) return null;
      acc = { k: 'bin', op: '/', a: acc, b: rhs };
    }
    return acc;
  };

  const expr = (): Ast | null => {
    let neg = false;
    const c = peek();
    if (c === '-' || c === '+') {
      neg = c === '-';
      pos += 1;
    }
    const first = term();
    if (first === null) return null;
    let acc: Ast = neg ? { k: 'neg', x: first } : first;
    for (;;) {
      const op = peek();
      if (op !== '+' && op !== '-') break;
      pos += 1;
      const rhs = term();
      if (rhs === null) return null;
      acc = { k: 'bin', op, a: acc, b: rhs };
    }
    return acc;
  };

  const ast = expr();
  if (ast === null) return null;
  skipWs();
  return pos === text.length ? ast : null;
}

/** Yalnızca rasyonel sabit olan (π/√ içermeyen) SymNum'un n/d'si; aksi halde null. */
export function symRationalOf(x: SymNum): { n: number; d: number } | null {
  if (x.length === 0) return { n: 0, d: 1 };
  if (x.length !== 1 || x[0].p !== 0 || x[0].r !== 1) return null;
  const { n, d } = x[0].c;
  if (typeof n !== 'number' || typeof d !== 'number') return null;
  return { n, d };
}

const MAX_POW = 64;

function symPowInt(x: SymNum, k: number): SymNum | null {
  if (!Number.isInteger(k) || Math.abs(k) > MAX_POW) return null;
  if (k === 0) return SYM_ONE;
  let result: SymNum = SYM_ONE;
  let base = x;
  for (let e = Math.abs(k); e > 0; e = Math.floor(e / 2)) {
    if (e % 2 === 1) result = symMul(result, base);
    if (e > 1) base = symMul(base, base);
  }
  return k < 0 ? symDiv(SYM_ONE, result) : result;
}

/** x^(n/d): d = 1 (tamsayı üs) ya da d = 2 (√'in kuvveti) desteklenir. */
function symPowRational(x: SymNum, n: number, d: number): SymNum | null {
  if (d === 1) return symPowInt(x, n);
  if (d === 2) {
    const r = symSqrt(x);
    return r === null ? null : symPowInt(r, n);
  }
  return null;
}

export const evalSymAst = (ast: Ast): SymNum | null => evalSym(ast);

function evalSym(ast: Ast): SymNum | null {
  switch (ast.k) {
    case 'num': {
      const q = parseDecimalToken(ast.text);
      return qIsZero(q) ? SYM_ZERO : [{ c: q, p: 0, r: 1 }];
    }
    case 'pi':
      return [{ c: Q_ONE, p: 1, r: 1 }];
    case 'i':
      return null; // gerçel değerlendirmede sanal birim yok
    case 'sqrt': {
      if (ast.n === 0) return SYM_ZERO;
      const { s, r } = squareFreeSplit(ast.n);
      return [{ c: { n: s, d: 1 }, p: 0, r }];
    }
    case 'sqrtE': {
      const x = evalSym(ast.x);
      return x === null ? null : symSqrt(x); // gerçel kök: negatif ya da temsil edilemezse null
    }
    case 'pow': {
      const base = evalSym(ast.a);
      const ex = evalSym(ast.b);
      if (base === null || ex === null) return null;
      const r = symRationalOf(ex);
      if (r === null) return null;
      return symPowRational(base, r.n, r.d);
    }
    case 'neg': {
      const x = evalSym(ast.x);
      return x === null ? null : symNeg(x);
    }
    case 'bin': {
      const a = evalSym(ast.a);
      const b = evalSym(ast.b);
      if (a === null || b === null) return null;
      if (ast.op === '+') return symAdd(a, b);
      if (ast.op === '-') return symSub(a, b);
      if (ast.op === '*') return symMul(a, b);
      return symDiv(a, b); // temsil edilemiyorsa null
    }
  }
}

function evalNum(ast: Ast): number {
  switch (ast.k) {
    case 'num':
      return parseFloat(ast.text.replace(',', '.'));
    case 'pi':
      return Math.PI;
    case 'i':
      return NaN;
    case 'sqrt':
      return Math.sqrt(ast.n);
    case 'sqrtE':
      return Math.sqrt(evalNum(ast.x));
    case 'pow':
      return Math.pow(evalNum(ast.a), evalNum(ast.b));
    case 'neg':
      return -evalNum(ast.x);
    case 'bin': {
      const a = evalNum(ast.a);
      const b = evalNum(ast.b);
      if (ast.op === '+') return a + b;
      if (ast.op === '-') return a - b;
      if (ast.op === '*') return a * b;
      return b === 0 ? NaN : a / b;
    }
  }
}

/**
 * Bir hücre metnini ondalık sayı olarak değerlendirir (sembolik olarak temsil
 * edilemeyen ifadeler için de çalışır, ör. "1/(π+√2)"). Geçersiz / yarım
 * ifadede NaN döner.
 */
export function parseExpressionNumber(text: string): number {
  const t = text.trim();
  if (t === '' || t === '-') return 0;
  const ast = parseExpressionAst(t);
  return ast === null ? NaN : evalNum(ast);
}

/**
 * Converts the text of a matrix cell / scalar field into a SymNum. Format: see the grammar above,
 * including sums/differences, parentheses and division ("1+π", "(1+π)/2", "2√3 - 1/2",
 * "-2pi√3/5", "0.37", "1/3").
 *
 * Returns null (fall back to the decimal engine) for:
 *   - text that is still being typed or is invalid ("√", "1/", "1+", "pi/0"),
 *   - division that cannot be represented symbolically (e.g. "1/(π+√2)"),
 *   - very large numbers (overflow).
 * Empty text and a lone "-" count as rational 0 (same as the numeric engine).
 */
export function parseSymbolicInput(text: string): SymNum | null {
  try {
    const t = text.trim();
    if (t === '' || t === '-') return SYM_ZERO;
    const ast = parseExpressionAst(t);
    return ast === null ? null : evalSym(ast);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// KARMAŞIK giriş (a + bi): karmaşık sayı modu
// ------------------------------------------------------------

/** Kesin karmaşık sayı: re + im·i (re, im birer SymNum). */
export interface SymCx {
  re: SymNum;
  im: SymNum;
}

const CX_ONE: SymCx = { re: SYM_ONE, im: SYM_ZERO };
const cxMulS = (a: SymCx, b: SymCx): SymCx => ({
  re: symSub(symMul(a.re, b.re), symMul(a.im, b.im)),
  im: symAdd(symMul(a.re, b.im), symMul(a.im, b.re)),
});

function cxDivS(a: SymCx, b: SymCx): SymCx | null {
  // (a + bi)/(c + di) = (a + bi)(c − di) / (c² + d²)
  const norm = symAdd(symMul(b.re, b.re), symMul(b.im, b.im));
  const nre = symAdd(symMul(a.re, b.re), symMul(a.im, b.im));
  const nim = symSub(symMul(a.im, b.re), symMul(a.re, b.im));
  const re = symDiv(nre, norm);
  const im = symDiv(nim, norm);
  return re === null || im === null ? null : { re, im };
}

function cxPowInt(x: SymCx, k: number): SymCx | null {
  if (!Number.isInteger(k) || Math.abs(k) > MAX_POW) return null;
  let result = CX_ONE;
  let base = x;
  for (let e = Math.abs(k); e > 0; e = Math.floor(e / 2)) {
    if (e % 2 === 1) result = cxMulS(result, base);
    if (e > 1) base = cxMulS(base, base);
  }
  return k < 0 ? cxDivS(CX_ONE, result) : result;
}

/**
 * Karmaşık ana karekök, KESİN: (x + yi)² = re + im·i olacak x + yi (x ≥ 0). Gauss-rasyonel
 * ve tek-kök durumlarında çalışır; a² + b²'nin karekökü temsil edilemiyorsa null.
 * (a + bi = (x + yi)²: x² = (a + √(a²+b²))/2, y = b/(2x); sonuç kesin doğrulanır.)
 */
export function symCsqrt(z: SymCx): SymCx | null {
  const { re, im } = z;
  if (symIsZero(im)) {
    const s = symSqrt(re);
    if (s) return { re: s, im: SYM_ZERO };
    const s2 = symSqrt(symNeg(re));
    return s2 ? { re: SYM_ZERO, im: s2 } : null;
  }
  const m = symSqrt(symAdd(symMul(re, re), symMul(im, im)));
  if (!m) return null;
  const x = symSqrt(symMul(symAdd(re, m), symFromRational(1, 2)));
  if (!x || symIsZero(x)) return null;
  const y = symDiv(im, symMul(symFromRational(2), x));
  if (!y) return null;
  const sqRe = symSub(symMul(x, x), symMul(y, y));
  const sqIm = symMul(symFromRational(2), symMul(x, y));
  return symIsZero(symSub(sqRe, re)) && symIsZero(symSub(sqIm, im)) ? { re: x, im: y } : null;
}

function evalCx(ast: Ast): SymCx | null {
  switch (ast.k) {
    case 'i':
      return { re: SYM_ZERO, im: SYM_ONE };
    case 'sqrtE': {
      const x = evalCx(ast.x);
      return x === null ? null : symCsqrt(x);
    }
    case 'pow': {
      const base = evalCx(ast.a);
      const ex = evalSym(ast.b);
      if (base === null || ex === null) return null;
      const r = symRationalOf(ex);
      if (r === null) return null;
      if (r.d === 1) return cxPowInt(base, r.n);
      if (r.d === 2) {
        const root = symCsqrt(base);
        return root === null ? null : cxPowInt(root, r.n);
      }
      return null;
    }
    case 'neg': {
      const x = evalCx(ast.x);
      return x === null ? null : { re: symNeg(x.re), im: symNeg(x.im) };
    }
    case 'bin': {
      const a = evalCx(ast.a);
      const b = evalCx(ast.b);
      if (a === null || b === null) return null;
      if (ast.op === '+') return { re: symAdd(a.re, b.re), im: symAdd(a.im, b.im) };
      if (ast.op === '-') return { re: symSub(a.re, b.re), im: symSub(a.im, b.im) };
      if (ast.op === '*') {
        return {
          re: symSub(symMul(a.re, b.re), symMul(a.im, b.im)),
          im: symAdd(symMul(a.re, b.im), symMul(a.im, b.re)),
        };
      }
      // (a + bi)/(c + di) = (a + bi)(c − di) / (c² + d²)
      const norm = symAdd(symMul(b.re, b.re), symMul(b.im, b.im));
      const nre = symAdd(symMul(a.re, b.re), symMul(a.im, b.im));
      const nim = symSub(symMul(a.im, b.re), symMul(a.re, b.im));
      const re = symDiv(nre, norm);
      const im = symDiv(nim, norm);
      return re === null || im === null ? null : { re, im };
    }
    default: {
      const v = evalSym(ast);
      return v === null ? null : { re: v, im: SYM_ZERO };
    }
  }
}

function evalNumC(ast: Ast): { re: number; im: number } {
  switch (ast.k) {
    case 'i':
      return { re: 0, im: 1 };
    case 'sqrtE': {
      const x = evalNumC(ast.x);
      const m = Math.hypot(x.re, x.im);
      const re = Math.sqrt((m + x.re) / 2);
      const im = Math.sqrt(Math.max(0, (m - x.re) / 2));
      return { re, im: x.im < 0 ? -im : im };
    }
    case 'pow': {
      const z = evalNumC(ast.a);
      const w = evalNumC(ast.b);
      if (w.im === 0 && Number.isInteger(w.re) && Math.abs(w.re) <= 1000) {
        let acc = { re: 1, im: 0 };
        for (let e = 0; e < Math.abs(w.re); e++) acc = { re: acc.re * z.re - acc.im * z.im, im: acc.re * z.im + acc.im * z.re };
        if (w.re >= 0) return acc;
        const n = acc.re * acc.re + acc.im * acc.im;
        return n === 0 ? { re: NaN, im: NaN } : { re: acc.re / n, im: -acc.im / n };
      }
      const m = Math.hypot(z.re, z.im);
      if (m === 0) return w.re > 0 ? { re: 0, im: 0 } : { re: NaN, im: NaN };
      // z^w = exp(w·ln z), ln z = ln|z| + iθ
      const lr = Math.log(m), li = Math.atan2(z.im, z.re);
      const er = w.re * lr - w.im * li, ei = w.re * li + w.im * lr;
      const mag = Math.exp(er);
      return { re: mag * Math.cos(ei), im: mag * Math.sin(ei) };
    }
    case 'neg': {
      const x = evalNumC(ast.x);
      return { re: 0 - x.re, im: 0 - x.im }; // 0 − x: −0 üretmez
    }
    case 'bin': {
      const a = evalNumC(ast.a);
      const b = evalNumC(ast.b);
      if (ast.op === '+') return { re: a.re + b.re, im: a.im + b.im };
      if (ast.op === '-') return { re: a.re - b.re, im: a.im - b.im };
      if (ast.op === '*') return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
      const n = b.re * b.re + b.im * b.im;
      if (n === 0) return { re: NaN, im: NaN };
      return { re: (a.re * b.re + a.im * b.im) / n, im: (a.im * b.re - a.re * b.im) / n };
    }
    default:
      return { re: evalNum(ast), im: 0 };
  }
}

/** Metin karmaşık birim `i` içeriyor mu? ("pi"nin i'si sayılmaz.) */
export function hasImaginaryUnit(text: string): boolean {
  return /i/i.test(text.replace(/pi/gi, ''));
}

/**
 * "3+2i", "i", "-i/2", "(1+i)/√2", "2πi" gibi bir metni KESİN karmaşık sayıya çevirir.
 * Boş metin / "-" → 0. Ayrıştırılamıyor, "^" içeriyor ya da bölme temsil
 * edilemiyorsa null.
 */
export function parseComplexInput(text: string): SymCx | null {
  try {
    const t = text.trim();
    if (t === '' || t === '-') return { re: SYM_ZERO, im: SYM_ZERO };
    const ast = parseExpressionAst(t, true);
    return ast === null ? null : evalCx(ast);
  } catch {
    return null;
  }
}

/** Karmaşık metnin ondalık değeri; geçersizse null. */
export function parseComplexNumber(text: string): { re: number; im: number } | null {
  const t = text.trim();
  if (t === '' || t === '-') return { re: 0, im: 0 };
  const ast = parseExpressionAst(t, true);
  if (ast === null) return null;
  const v = evalNumC(ast);
  return Number.isFinite(v.re) && Number.isFinite(v.im) ? v : null;
}
