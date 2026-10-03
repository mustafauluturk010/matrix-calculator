// Exact (decimal-free) display of eigenvalues/eigenvectors. In fraction mode, roots of the
// characteristic polynomial that have no simple radical/rational form get an exact name:
//   - irreducible cubic with rational coefficients: Cardano (one real root) or the
//     trigonometric form (three real roots);
//   - quadratic with a complex discriminant: (-b ± √Δ) / 2;
//   - anything else (degree 4+, ...): "k-th root of p(λ) = 0".
// Eigenvectors are the cofactor polynomials of (A - λI) in λ. Only display text is produced;
// every candidate is checked against the numeric roots.

import type { Field } from './complexField';
import type { C } from './complexEigen';

// ---------- BigInt rasyonel ----------
export type Q = { n: bigint; d: bigint };
const babs = (a: bigint) => (a < 0n ? -a : a);
function gcd(a: bigint, b: bigint): bigint {
  a = babs(a);
  b = babs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
export function q(n: bigint, d: bigint = 1n): Q {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
const qAdd = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const qSub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const qMul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const qDiv = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const qNeg = (a: Q) => q(-a.n, a.d);
const qSign = (a: Q) => (a.n > 0n ? 1 : a.n < 0n ? -1 : 0);
const qNum = (a: Q) => Number(a.n) / Number(a.d);
const qInt = (n: number) => q(BigInt(n));
export const fmtQ = (a: Q) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`);

/** "-3/4", "5" biçimindeki metni rasyonele çevirir; başka biçimde null. */
export function parseQ(s: string): Q | null {
  const m = /^(-?\d+)(?:\/(\d+))?$/.exec(s.trim());
  if (!m) return null;
  const d = m[2] ? BigInt(m[2]) : 1n;
  return d === 0n ? null : q(BigInt(m[1]), d);
}

function iroot(x: bigint, k: number): bigint {
  if (x < 2n) return x;
  let lo = 0n;
  let hi = 1n << BigInt(Math.ceil(x.toString(2).length / k) + 1);
  const K = BigInt(k);
  while (lo < hi) {
    const mid = (lo + hi + 1n) >> 1n;
    if (mid ** K <= x) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}
/** Rasyonelin KESİN k. kökü (k = 2: negatif olmayan, k = 3: işaretli); yoksa null. */
function qRoot(a: Q, k: 2 | 3): Q | null {
  if (k === 2 && a.n < 0n) return null;
  const sg = a.n < 0n ? -1n : 1n;
  const rn = iroot(babs(a.n), k);
  const rd = iroot(a.d, k);
  const K = BigInt(k);
  if (rn ** K !== babs(a.n) || rd ** K !== a.d) return null;
  return q(sg * rn, rd);
}

// ---------- metin yardımcıları ----------
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sup = (k: number) => String(k).split('').map((c) => SUP[+c]).join('');
const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const sub = (k: number) => String(k).split('').map((c) => SUB[+c]).join('');

/** Toplam metnine terim ekler; terim '-' ile başlıyorsa işareti çevirir. */
function addTerm(acc: string, text: string, sign: 1 | -1): string {
  if (text.startsWith('-')) {
    text = text.slice(1);
    sign = sign === 1 ? -1 : 1;
  }
  if (acc === '') return (sign === -1 ? '-' : '') + text;
  return `${acc} ${sign === -1 ? '-' : '+'} ${text}`;
}
const wrapIfSum = (s: string) => (/ [+-] /.test(s) ? `(${s})` : s);

interface Ex {
  text: string;
  num: number;
  zero: boolean;
}
const rationalEx = (a: Q): Ex => ({ text: fmtQ(a), num: qNum(a), zero: qSign(a) === 0 });

/**
 * √(n/d) = c·√m biçimine sadeleştirir (m kare çarpansız, c rasyonel):
 * √(23/108) = √69/18, √(292/9) = 2√73/3. Çok büyük sayılarda kısmi sadeleştirir.
 */
function simplifySqrt(a: Q): { c: Q; m: bigint } {
  const x = a.n * a.d;
  let rest = x;
  let out = 1n;
  for (let f = 2n; f * f <= rest && f <= 100000n; f++) {
    const f2 = f * f;
    while (rest % f2 === 0n) {
      rest /= f2;
      out *= f;
    }
  }
  return { c: q(out, a.d), m: rest };
}
/** c·√m metni: "√69/18", "2√73/3", "3√2"; m = 1 ise rasyonel. */
function radText(c: Q, m: bigint): string {
  if (m === 1n) return fmtQ(c);
  const sgn = c.n < 0n ? '-' : '';
  const cn = babs(c.n);
  const num = `${cn === 1n ? '' : cn}√${m}`;
  return `${sgn}${num}${c.d === 1n ? '' : `/${c.d}`}`;
}

/** ∛(a ± √D) (D rasyonel > 0). Rasyonel çıkabilen yerler sadeleştirilir. */
function cbrtTerm(a: Q, D: Q, sign: 1 | -1): Ex {
  const sqrtRat = qRoot(D, 2);
  const dNum = Math.sqrt(qNum(D));
  if (sqrtRat) {
    const inner = sign === 1 ? qAdd(a, sqrtRat) : qSub(a, sqrtRat);
    if (qSign(inner) === 0) return { text: '0', num: 0, zero: true };
    const r = qRoot(inner, 3);
    if (r) return rationalEx(r);
    return { text: `∛(${fmtQ(inner)})`, num: Math.cbrt(qNum(inner)), zero: false };
  }
  const ss = simplifySqrt(D);
  const sq = radText(ss.c, ss.m);
  let inner = '';
  if (qSign(a) !== 0) inner = fmtQ(a);
  inner = addTerm(inner, sq, sign);
  return { text: `∛(${inner})`, num: Math.cbrt(qNum(a) + sign * dNum), zero: false };
}

export interface ClosedForm {
  text: string;
  value: C;
}

/**
 * c3·λ³ + c2·λ² + c1·λ + c0 = 0 (rasyonel katsayılı, rasyonel kökü OLMAYAN) için
 * üç kökün kapalı biçimi. Δ' > 0: Cardano; Δ' < 0 (üç gerçel kök): trigonometrik.
 */
export function cubicClosedForms(c3: Q, c2: Q, c1: Q, c0: Q): ClosedForm[] | null {
  if (qSign(c3) === 0) return null;
  const b = qDiv(c2, c3);
  const c = qDiv(c1, c3);
  const e = qDiv(c0, c3);
  const three = qInt(3);
  const p = qSub(c, qDiv(qMul(b, b), three));
  const qq = qAdd(qSub(qDiv(qMul(qInt(2), qMul(b, qMul(b, b))), qInt(27)), qDiv(qMul(b, c), three)), e);
  const half = q(1n, 2n);
  const D = qAdd(qMul(qMul(qq, half), qMul(qq, half)), qMul(qDiv(p, three), qMul(qDiv(p, three), qDiv(p, three))));
  const shift = qNeg(qDiv(b, three));
  const shiftNum = qNum(shift);
  const withShift = (t: string) => (qSign(shift) === 0 ? t : addTerm(fmtQ(shift), t, 1));
  const out: ClosedForm[] = [];

  if (qSign(D) > 0) {
    const A = qNeg(qMul(qq, half));
    const u = cbrtTerm(A, D, 1);
    const v = cbrtTerm(A, D, -1);
    const sumUV = [u, v].filter((x) => !x.zero).map((x) => x.text);
    const sumText = sumUV.reduce((acc, t) => addTerm(acc, t, 1), '') || '0';
    let diffText = '';
    if (!u.zero) diffText = addTerm(diffText, u.text, 1);
    if (!v.zero) diffText = addTerm(diffText, v.text, -1);
    if (diffText === '') diffText = '0';
    out.push({ text: withShift(sumText), value: { re: shiftNum + u.num + v.num, im: 0 } });
    const halfSum = `${wrapIfSum(sumText)}/2`;
    const realPart = (() => {
      let t = qSign(shift) === 0 ? '' : fmtQ(shift);
      t = addTerm(t, halfSum, -1);
      return t;
    })();
    const imPart = `√3/2·i·${wrapIfSum(diffText)}`;
    const reN = shiftNum - (u.num + v.num) / 2;
    const imN = (Math.sqrt(3) / 2) * (u.num - v.num);
    out.push({ text: addTerm(realPart, imPart, 1), value: { re: reN, im: imN } });
    out.push({ text: addTerm(realPart, imPart, -1), value: { re: reN, im: -imN } });
    return out;
  }
  if (qSign(D) < 0) {
    const R = qNeg(qDiv(p, three)); // −p/3 > 0
    const alpha = qDiv(qMul(three, qq), qMul(qInt(2), p)); // 3q/(2p)
    const rho = qNeg(qDiv(three, p)); // −3/p > 0
    // 2·√R  (R = −p/3)
    const sR = simplifySqrt(R);
    const coefQ = qMul(qInt(2), sR.c);
    const coefT = sR.m === 1n ? (coefQ.n === 1n && coefQ.d === 1n ? '' : `${fmtQ(coefQ)}·`) : `${coefQ.d === 1n ? '' : '('}${radText(coefQ, sR.m)}${coefQ.d === 1n ? '' : ')'}·`;
    const coefText = coefT;
    const coefNum = 2 * Math.sqrt(qNum(R));
    // α·√ρ  (α = 3q/(2p), ρ = −3/p)
    const sRho = simplifySqrt(rho);
    let argText: string;
    let argNum: number;
    if (qSign(alpha) === 0) {
      argText = '0';
      argNum = 0;
    } else {
      const prod = qMul(alpha, sRho.c);
      argText = radText(prod, sRho.m);
      argNum = qNum(alpha) * Math.sqrt(qNum(rho));
    }
    argNum = Math.max(-1, Math.min(1, argNum));
    const th = Math.acos(argNum) / 3;
    for (let k = 0; k < 3; k++) {
      const ang = k === 0 ? '' : ` - ${2 * k === 2 ? '2' : '4'}π/3`;
      const trig = `${coefText}cos(arccos(${argText})/3${ang})`;
      out.push({ text: withShift(trig), value: { re: shiftNum + coefNum * Math.cos(th - (2 * Math.PI * k) / 3), im: 0 } });
    }
    return out;
  }
  return null; // D = 0: rasyonel kök var (çağıran taraf zaten ayrıştırmış olmalı)
}

// ---------- polinom (alan üzerinde) ----------
type Poly<T> = T[]; // düşük dereceden yükseğe

function trim<T>(F: Field<T>, p: Poly<T>): Poly<T> {
  const r = p.slice();
  while (r.length > 0 && F.isZero(r[r.length - 1])) r.pop();
  return r;
}
function pAdd<T>(F: Field<T>, a: Poly<T>, b: Poly<T>): Poly<T> {
  const n = Math.max(a.length, b.length);
  const r: Poly<T> = [];
  for (let i = 0; i < n; i++) r.push(F.add(i < a.length ? a[i] : F.zero, i < b.length ? b[i] : F.zero));
  return trim(F, r);
}
function pNeg<T>(F: Field<T>, a: Poly<T>): Poly<T> {
  return a.map((x) => F.neg(x));
}
function pMul<T>(F: Field<T>, a: Poly<T>, b: Poly<T>): Poly<T> {
  if (a.length === 0 || b.length === 0) return [];
  const r: Poly<T> = new Array(a.length + b.length - 1).fill(F.zero);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = F.add(r[i + j], F.mul(a[i], b[j]));
  return trim(F, r);
}
function pDet<T>(F: Field<T>, m: Poly<T>[][]): Poly<T> {
  const n = m.length;
  if (n === 1) return m[0][0];
  if (n === 2) return pAdd(F, pMul(F, m[0][0], m[1][1]), pNeg(F, pMul(F, m[0][1], m[1][0])));
  let acc: Poly<T> = [];
  for (let j = 0; j < n; j++) {
    if (m[0][j].length === 0) continue;
    const minor = m.slice(1).map((row) => row.filter((_, c) => c !== j));
    const term = pMul(F, m[0][j], pDet(F, minor));
    acc = j % 2 === 0 ? pAdd(F, acc, term) : pAdd(F, acc, pNeg(F, term));
  }
  return acc;
}

/** Katsayı metni: tek terimli sayı olduğu gibi, çok terimli (ör. "1 + i") parantezli. */
function coefText<T>(F: Field<T>, co: T): { body: string; neg: boolean } {
  let f = F.fmt(co, 'fraction');
  let neg = false;
  if (f.startsWith('-') && !/ [+-] /.test(f)) {
    neg = true;
    f = f.slice(1);
  }
  if (/ [+-] /.test(f)) f = `(${f})`;
  return { body: f, neg };
}

/** "λ³ - λ - 1", "(1 + i)λ² - 3" gibi polinom metni. `v` değişken adıdır. */
export function polyText<T>(F: Field<T>, cs: Poly<T>, v: string): string {
  let out = '';
  for (let k = cs.length - 1; k >= 0; k--) {
    if (F.isZero(cs[k])) continue;
    const { body, neg } = coefText(F, cs[k]);
    const mono = k === 0 ? '' : k === 1 ? v : `${v}${sup(k)}`;
    const text = k === 0 ? body : body === '1' ? mono : `${body}${mono}`;
    out = addTerm(out, text, neg ? -1 : 1);
  }
  return out || '0';
}

const evalPoly = <T>(F: Field<T>, p: Poly<T>, z: C): C => {
  let re = 0;
  let im = 0;
  for (let k = p.length - 1; k >= 0; k--) {
    const nr = re * z.re - im * z.im + F.re(p[k]);
    const ni = re * z.im + im * z.re + F.im(p[k]);
    re = nr;
    im = ni;
  }
  return { re, im };
};

/**
 * λ'nın KESİN kofaktör özvektörü: (n−1) satırlı alt matrislerin kofaktörleri, λ'da
 * polinom. Köke (sayısal `lam`) göre sıfırdan farklı ve A·v = λ·v sağlıyorsa döner.
 */
export function cofactorEigenvector<T>(
  F: Field<T>,
  A: T[][],
  lam: C,
  scale: number,
  /** Aynı A için kofaktör polinomları köklerden bağımsızdır; satır başına bir kez hesaplanıp paylaşılır. */
  cache: Map<number, Poly<T>[]> = new Map()
): { polys: Poly<T>[]; num: C[] } | null {
  const n = A.length;
  if (n < 2 || n > 6) return null;
  const M: Poly<T>[][] = A.map((row, i) => row.map((x, j) => (i === j ? trim(F, [x, F.neg(F.one)]) : trim(F, [x]))));
  const An = A.map((row) => row.map((x) => ({ re: F.re(x), im: F.im(x) })));
  for (let drop = 0; drop < n; drop++) {
    let polys = cache.get(drop);
    if (!polys) {
      const rows = M.filter((_, i) => i !== drop);
      polys = [];
      for (let k = 0; k < n; k++) {
        const minor = rows.map((row) => row.filter((_, j) => j !== k));
        const d = pDet(F, minor);
        polys.push(k % 2 === 0 ? d : pNeg(F, d));
      }
      cache.set(drop, polys);
    }
    const num = polys.map((p) => evalPoly(F, p, lam));
    const mag = Math.max(...num.map((z) => Math.hypot(z.re, z.im)));
    if (!(mag > 1e-7 * Math.max(1, scale))) continue; // bu satır atılınca vektör köklerde sıfırlandı
    // A·v = λ·v (sayısal doğrulama; bağıl hata)
    const ok = An.every((row, i) => {
      let re = 0;
      let im = 0;
      let big = 0;
      for (let j = 0; j < n; j++) {
        re += row[j].re * num[j].re - row[j].im * num[j].im;
        im += row[j].re * num[j].im + row[j].im * num[j].re;
        big += Math.hypot(row[j].re, row[j].im) * Math.hypot(num[j].re, num[j].im);
      }
      const er = lam.re * num[i].re - lam.im * num[i].im;
      const ei = lam.re * num[i].im + lam.im * num[i].re;
      return Math.hypot(re - er, im - ei) <= 1e-6 * (big + Math.hypot(lam.re, lam.im) * mag + 1);
    });
    if (ok) return { polys, num };
  }
  return null;
}
