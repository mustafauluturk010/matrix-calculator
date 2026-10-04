// General n×n eigenvalues/eigenvectors (n ≥ 2), possibly with complex entries. Used for every
// size in complex mode (input contains `i`) and for real 4x4 and larger (2x2/3x3 are handled
// in symbolicOps.ts).
//
// Method (exact field):
//   1. Characteristic polynomial via Faddeev–LeVerrier, computed exactly (only +, −, ×,
//      integer division).
//   2. Eigenvalue candidates come from a numeric complex QR algorithm (Householder, Wilkinson
//      shift). Each candidate is converted to an exact number for its real and imaginary part
//      (rational, q·s or q₁+q₂·s with s in {√r, π, π√r}) and p(λ) = 0 is verified exactly.
//      Once a root is found the polynomial is divided exactly (repeated for multiplicity).
//   3. A remaining polynomial of degree ≤ 2 is solved with the quadratic formula if the complex
//      square root can be taken exactly (a + bi = (x + yi)²).
//   4. Eigenvectors are a null-space basis from the exact RREF of (A − λI); multiplicity and
//      eigenspace dimension are exact (non-diagonalizable cases are reported).
// Eigenvalues that cannot be tracked exactly (irreducible, multi-term divisor, ...) stay
// numeric; the method never produces an unverified exact value.

import { OperationResult, SolutionStep } from '@/types';
import type { CxCtx } from './complexOps';
import { eliminate, matMul, snap, detOf } from './complexOps';
import { Field, CxSym, numericField, extField } from './complexField';
import { C, cToString } from './complexEigen';
import { parseQ, cubicClosedForms, polyText, cofactorEigenvector, sub as subDigits } from './algebraicRoots';
import { Ext, QuadCtx, ext, extSub, extConj, extToNumber, extToString, Cnum } from './quadExt';
import {
  SymNum,
  SYM_ZERO,
  symAdd,
  symMul,
  symSub,
  symDiv,
  symSqrt,
  symNeg,
  symIsZero,
  symToNumber,
  symFromRational,
  parseSymbolicInput,
  symCsqrt,
  iMul,
  iGcd,
  iAbs,
  iNeg,
  iDivExact,
  I,
} from './symbolic';

const T2 = (lang: 'tr' | 'en', tr: string, en: string) => (lang === 'en' ? en : tr);

const cabs = (z: C) => Math.hypot(z.re, z.im);
const cmul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const csub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
const cadd = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
const cconj = (a: C): C => ({ re: a.re, im: -a.im });
const cscale = (a: C, k: number): C => ({ re: a.re * k, im: a.im * k });
const zeroC: C = { re: 0, im: 0 };

function csqrt(z: C): C {
  const m = cabs(z);
  if (m === 0) return { re: 0, im: 0 };
  const re = Math.sqrt((m + z.re) / 2);
  const im = Math.sqrt(Math.max(0, (m - z.re) / 2));
  return { re, im: z.im < 0 ? -im : im };
}

/** Karmaşık kare matrisin tüm özdeğerleri (sayısal). Yakınsamazsa null. */
export function qrEigenvalues(A: C[][]): C[] | null {
  const n = A.length;
  let H: C[][] = A.map((r) => r.map((z) => ({ ...z })));
  let scale = 0;
  for (const row of H) for (const z of row) scale = Math.max(scale, cabs(z));
  if (scale === 0) return Array.from({ length: n }, () => ({ re: 0, im: 0 }));
  const out: C[] = [];
  let m = n;
  let iter = 0;
  while (m > 0) {
    if (m === 1) {
      out.push(H[0][0]);
      break;
    }
    let off = 0;
    for (let j = 0; j < m - 1; j++) off += cabs(H[m - 1][j]);
    if (off <= 1e-15 * scale * m || off <= 1e-15 * (cabs(H[m - 1][m - 1]) + cabs(H[m - 2][m - 2]))) {
      out.push(H[m - 1][m - 1]);
      H = H.slice(0, m - 1).map((r) => r.slice(0, m - 1));
      m--;
      iter = 0;
      continue;
    }
    if (++iter > 300) return null;
    // Wilkinson kaydırması: sağ-alt 2x2'nin d'ye yakın özdeğeri
    const a = H[m - 2][m - 2], b = H[m - 2][m - 1], c = H[m - 1][m - 2], d = H[m - 1][m - 1];
    const half = cscale(csub(a, d), 0.5);
    const disc = csqrt(cadd(cmul(half, half), cmul(b, c)));
    const mid = cscale(cadd(a, d), 0.5);
    const l1 = cadd(mid, disc);
    const l2 = csub(mid, disc);
    let mu = cabs(csub(l1, d)) < cabs(csub(l2, d)) ? l1 : l2;
    if (iter % 11 === 10) mu = cadd(mu, { re: 0.37 * scale, im: 0.21 * scale }); // istisnai kaydırma
    // H − μI = QR (Householder), H ← R·Q + μI
    const R: C[][] = H.map((row, i) => row.map((z, j) => (i === j ? csub(z, mu) : { ...z })));
    const Q: C[][] = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => ({ re: i === j ? 1 : 0, im: 0 })));
    for (let k = 0; k < m - 1; k++) {
      let normx = 0;
      for (let i = k; i < m; i++) normx += R[i][k].re ** 2 + R[i][k].im ** 2;
      normx = Math.sqrt(normx);
      if (normx === 0) continue;
      const x0 = R[k][k];
      const ax0 = cabs(x0);
      const phase: C = ax0 === 0 ? { re: 1, im: 0 } : { re: x0.re / ax0, im: x0.im / ax0 };
      const alpha = cscale(phase, -normx);
      const v: C[] = [];
      for (let i = k; i < m; i++) v.push(i === k ? csub(R[i][k], alpha) : { ...R[i][k] });
      let nv = 0;
      for (const z of v) nv += z.re ** 2 + z.im ** 2;
      nv = Math.sqrt(nv);
      if (nv === 0) continue;
      for (let i = 0; i < v.length; i++) v[i] = cscale(v[i], 1 / nv);
      for (let j = k; j < m; j++) {
        let s: C = { re: 0, im: 0 };
        for (let i = 0; i < v.length; i++) s = cadd(s, cmul(cconj(v[i]), R[k + i][j]));
        for (let i = 0; i < v.length; i++) R[k + i][j] = csub(R[k + i][j], cscale(cmul(v[i], s), 2));
      }
      for (let r = 0; r < m; r++) {
        let s: C = { re: 0, im: 0 };
        for (let i = 0; i < v.length; i++) s = cadd(s, cmul(Q[r][k + i], v[i]));
        for (let i = 0; i < v.length; i++) Q[r][k + i] = csub(Q[r][k + i], cscale(cmul(s, cconj(v[i])), 2));
      }
    }
    H = Array.from({ length: m }, (_, i) =>
      Array.from({ length: m }, (_, j) => {
        let s: C = { re: 0, im: 0 };
        for (let k = i; k < m; k++) s = cadd(s, cmul(R[i][k], Q[k][j]));
        return i === j ? cadd(s, mu) : s;
      })
    );
  }
  return out.length === n ? out : null;
}

/** p(λ) = Σ c[k] λ^k (monik, c[n] = 1), Faddeev–LeVerrier. */
export function charPoly<T>(F: Field<T>, A: T[][]): T[] {
  const n = A.length;
  const c: T[] = new Array(n + 1).fill(F.zero);
  c[n] = F.one;
  let M: T[][] = A.map((r) => r.map(() => F.zero));
  for (let k = 1; k <= n; k++) {
    // M_k = A·M_{k−1} + c_{n−k+1}·I
    const AM = matMul(F, A, M);
    M = AM.map((row, i) => row.map((x, j) => (i === j ? F.add(x, c[n - k + 1]) : x)));
    const prod = matMul(F, A, M);
    let tr = F.zero;
    for (let i = 0; i < n; i++) tr = F.add(tr, prod[i][i]);
    const q = F.div(tr, F.fromInt(k));
    if (q === null) throw Object.assign(new Error('bölme'), { noSymbolic: true });
    c[n - k] = F.neg(q);
  }
  return c;
}

function horner<T>(F: Field<T>, c: T[], z: T): T {
  let acc = F.zero;
  for (let k = c.length - 1; k >= 0; k--) acc = F.add(F.mul(acc, z), c[k]);
  return acc;
}

/** c(λ) = (λ − r)·q(λ) + kalan için q. */
function deflate<T>(F: Field<T>, c: T[], r: T): T[] {
  const m = c.length - 1;
  const q: T[] = new Array(m).fill(F.zero);
  q[m - 1] = c[m];
  for (let k = m - 1; k >= 1; k--) q[k - 1] = F.add(c[k], F.mul(r, q[k]));
  return q;
}

function approxRational(x: number, maxDen = 360, tol = 1e-9): [number, number] | null {
  if (!Number.isFinite(x) || Math.abs(x) > 1e6) return null;
  const sign = x < 0 ? -1 : 1;
  const v = Math.abs(x);
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0;
  let b = v;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) return null;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(v - h1 / k1) <= tol) return [sign * h1, k1];
    const frac = b - a;
    if (frac < 1e-13) return null;
    b = 1 / frac;
  }
  return null;
}

const gcdNum = (a: number, b: number): number => {
  let x = Math.abs(a), y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
};

function primeFactors(n: number): number[] {
  const out: number[] = [];
  let rem = n;
  for (let i = 2; i * i <= rem; i++) {
    if (rem % i === 0) {
      out.push(i);
      while (rem % i === 0) rem /= i;
    }
  }
  if (rem > 1) out.push(rem);
  return out;
}

/** Girişlerdeki π/√ yapısından aday baz elemanları (√r, π, π√r). */
function candidateBasis(A: CxSym[][]): SymNum[] {
  const primes = new Set<number>();
  let hasPi = false;
  for (const row of A)
    for (const z of row)
      for (const part of [z.re, z.im])
        for (const t of part) {
          if (t.p !== 0) hasPi = true;
          if (t.r > 1) primeFactors(t.r).forEach((q) => primes.add(q));
        }
  const plist = Array.from(primes).sort((x, y) => x - y).slice(0, 4);
  const radicands: number[] = [];
  for (let mask = 1; mask < 1 << plist.length; mask++) {
    let r = 1;
    for (let k = 0; k < plist.length; k++) if (mask & (1 << k)) r *= plist[k];
    radicands.push(r);
  }
  const out: SymNum[] = [];
  const add = (txt: string) => {
    const v = parseSymbolicInput(txt);
    if (v) out.push(v);
  };
  for (const r of radicands) add(`√${r}`);
  if (hasPi) {
    add('pi');
    for (const r of radicands) add(`pi√${r}`);
  }
  return out;
}

const numOf = (s: SymNum): number => {
  let v = 0;
  for (const t of s) v += (Number(t.c.n) / Number(t.c.d)) * Math.pow(Math.PI, t.p) * Math.sqrt(t.r);
  return v;
};

/** Gerçek sayı x için KESİN SymNum adayları (en basitten): 0, rasyonel, q·s, q₁ + q₂·s. */
function recognizeParts(x: number, basis: SymNum[], limit = 4): SymNum[] {
  if (Math.abs(x) < 1e-10) return [SYM_ZERO];
  const out: SymNum[] = [];
  const push = (s: SymNum) => {
    if (out.length < limit) out.push(s);
  };
  const q0 = approxRational(x);
  if (q0) push(symFromRational(q0[0], q0[1]));
  const bn = basis.map(numOf);
  for (let k = 0; k < basis.length && out.length < limit; k++) {
    const q = approxRational(x / bn[k]);
    if (q && q[0] !== 0) push(symMul(symFromRational(q[0], q[1]), basis[k]));
  }
  if (out.length === 0) {
    const DENS = [1, 2, 3, 4, 6, 8, 12];
    for (let k = 0; k < basis.length && out.length < limit; k++)
      for (const den of DENS)
        for (let num = -30; num <= 30 && out.length < limit; num++) {
          if (num === 0 || gcdNum(num, den) !== 1) continue;
          const q1 = approxRational(x - (num / den) * bn[k], 360, 1e-10);
          if (q1) push(symAdd(symFromRational(q1[0], q1[1]), symMul(symFromRational(num, den), basis[k])));
        }
  }
  return out;
}

function nullspaceFrom<T>(F: Field<T>, R: T[][], pivots: number[], n: number): T[][] {
  const pivSet = new Set(pivots);
  const basis: T[][] = [];
  for (let f = 0; f < n; f++) {
    if (pivSet.has(f)) continue;
    const v: T[] = new Array(n).fill(F.zero);
    v[f] = F.one;
    pivots.forEach((p, k) => {
      v[p] = F.neg(R[k][f]);
    });
    basis.push(v);
  }
  return basis;
}

/** Tüm bileşenler Gauss-rasyonelse: ilkel tam sayı vektörü (ilk sıfırdan farklı kısım pozitif). */
function cleanExactVector(v: CxSym[]): CxSym[] {
  const isRat = (s: SymNum) => s.length === 0 || (s.length === 1 && s[0].p === 0 && s[0].r === 1);
  if (!v.every((z) => isRat(z.re) && isRat(z.im))) return v;
  const parts = v.flatMap((z) => [z.re, z.im]);
  let L: I = 1;
  for (const s of parts) if (s.length) L = iMul(iDivExact(L, iGcd(L, s[0].c.d)), s[0].c.d);
  const scaled = parts.map((s) => (s.length ? iMul(s[0].c.n, iDivExact(L, s[0].c.d)) : 0));
  let G: I = 0;
  for (const n of scaled) G = G === 0 ? iAbs(n) : iGcd(G, n);
  if (G === 0) return v;
  const first = scaled.findIndex((x) => x !== 0);
  const flip = first >= 0 && scaled[first] < 0;
  const mk = (x: I): SymNum => symFromRational(flip ? iNeg(x) : x);
  return v.map((_, i) => ({ re: mk(iDivExact(scaled[2 * i], G)), im: mk(iDivExact(scaled[2 * i + 1], G)) }));
}

/**
 * Division-free null vector of an (n×n, rank n−1) system: pick n−1 rows and compute each
 * component as the (n−1)×(n−1) minor with the matching column removed (classic cofactor/Cramer
 * identity). detOf uses plain cofactor expansion for n−1 ≤ 4, so it is safe for fields like Ext
 * where division is expensive.
 * Returns null if the chosen rows are not actually independent (all cofactors zero) or the
 * vector does not exactly annihilate every row (including the omitted one); the caller then
 * tries another row set.
 */
function cofactorNullVector<T>(F: Field<T>, full: T[][]): T[] | null {
  const n = full.length;
  if (n < 2 || n > 5) return null; // (n−1) ≤ 4: detOf saf kofaktör kalır (bölmesiz)
  for (let drop = 0; drop < n; drop++) {
    const rows = full.filter((_, i) => i !== drop);
    const v: T[] = [];
    for (let k = 0; k < n; k++) {
      const sub = rows.map((row) => row.filter((_, j) => j !== k));
      const d = detOf(F, sub);
      v.push(k % 2 === 0 ? d : F.neg(d));
    }
    if (v.every((x) => F.isZero(x))) continue; // bu satır seçimiyle rank tam çıkmadı
    // KESİN doğrulama: her satırla (bırakılan dahil) iç çarpım tam sıfır.
    const dotZero = full.every((row) => F.isZero(row.reduce((acc, x, j) => F.add(acc, F.mul(x, v[j])), F.zero)));
    if (dotZero) return v;
  }
  return null;
}

interface EigEntry<T> {
  num: C;
  exact: T | null;
  /** KESİN ama "opak" (sadeleşmeyen köklü) özdeğer: a + b·s, s² = ctx.M. Yalnızca
   *  gerçel n×n matrislerde, kalan ikinci derece denklemin diskriminantı ne
   *  gerçel ne de sanal olarak sade bir köke sahipken kullanılır (bkz.
   *  solveOpaqueQuadratic). `exact` bu durumda null kalır. */
  opaque?: { ctx: QuadCtx; val: Ext };
  /** KESİRLİ modda, sade ifadesi olmayan kökün KESİN adı (Cardano / trigonometrik /
   *  (−b ± √Δ)/2 / "p(λ) = 0 denkleminin k. kökü"). Bkz. algebraicRoots.ts. */
  alg?: { label: string };
}

/**
 * Carries the real roots of the remaining quadratic λ² + c1·λ + c0 = 0 exactly as an "opaque"
 * a + b·s (s² = Δ) when the discriminant has no simple root in either the real (√Δ) or the
 * imaginary (i√(−Δ)) direction (see quadExt.ts; symbolicOps.ts uses the same for 2x2/3x3).
 * Applies only when the matrix is entirely real (every imaginary part is symbolic zero);
 * otherwise returns null and the caller falls back to the numeric engine.
 */
function solveOpaqueQuadratic(A: CxSym[][], c: CxSym[]): { ctx: QuadCtx; lam1: Ext; lam2: Ext } | null {
  if (c.length !== 3) return null;
  if (A.some((row) => row.some((z) => !symIsZero(z.im)))) return null; // yalnızca gerçel matris
  const c1 = c[1];
  const c0 = c[0];
  if (!symIsZero(c1.im) || !symIsZero(c0.im)) return null; // yalnızca gerçel katsayılı kalan
  // λ² + c1·λ + c0 = 0 ⇒ Δ = c1² − 4c0 (monik, c[2] = 1)
  const disc = symSub(symMul(c1.re, c1.re), symMul(symFromRational(4), c0.re));
  if (symSqrt(disc) !== null || symSqrt(symNeg(disc)) !== null) return null; // sade kök var: buraya gelinmemeli
  const trHalf = symDiv(symNeg(c1.re), symFromRational(2));
  if (trHalf === null) return null;
  const complex = symToNumber(disc) < 0;
  const ctx: QuadCtx = { M: disc, kind: complex ? 'isqrt' : 'sqrt' };
  const half = symFromRational(1, 2);
  const lam1 = ext(trHalf, half);
  const lam2 = extConj(lam1);
  return { ctx, lam1, lam2 };
}

/**
 * √disc (disc ≥ 0), symSqrt'in yakalayamadığı bir biçimde (ör. (2−π)² = 4−4π+π²
 * gibi π'de TAM KARE bir polinom) sade olabilir. symSqrt yalnızca √radikal
 * yapısına bakar; bu, sayısal köke en yakın adayı (candidateBasis ile) deneyip
 * KARESİNİN disc'e KESİN eşit olup olmadığını sınayarak o boşluğu kapatır.
 */
function sqrtViaRecognition(disc: SymNum, basis: SymNum[]): SymNum | null {
  const d = symToNumber(disc);
  if (d < 0) return null;
  for (const cand of recognizeParts(Math.sqrt(d), basis)) {
    if (symIsZero(symSub(symMul(cand, cand), disc))) return cand;
  }
  return null;
}

/** c(λ), derece ≤ 2, KESİN çözüm (karmaşık karekök kesin alınabiliyorsa). */
function solveLowDegree<T>(F: Field<T>, c: T[], basis?: SymNum[]): T[] | null {
  if (c.length === 2) {
    const r = F.div(F.neg(c[0]), c[1]);
    return r === null ? null : [r];
  }
  if (c.length !== 3 || !F.exact) return null;
  const a = c[2], b = c[1], cc = c[0];
  const disc = F.sub(F.mul(b, b), F.mul(F.mul(F.fromInt(4), a), cc));
  const dcx = disc as unknown as CxSym;
  let sq = symCsqrt(dcx) as unknown as T | null;
  // symCsqrt yalnızca √radikal yapısına bakar; π'de TAM KARE olan (ör. (2−π)² =
  // 4−4π+π²) ama radikal biçimde OLMAYAN diskriminantları kaçırır. Gerçel
  // (im=0) durumda candidateBasis adaylarıyla bu boşluğu ayrıca dene.
  if (sq === null && basis && symIsZero(dcx.im)) {
    const s = sqrtViaRecognition(dcx.re, basis);
    if (s) sq = { re: s, im: SYM_ZERO } as unknown as T;
  }
  if (sq === null) return null;
  const twoA = F.mul(F.fromInt(2), a);
  const r1 = F.div(F.add(F.neg(b), sq), twoA);
  const r2 = F.div(F.sub(F.neg(b), sq), twoA);
  return r1 === null || r2 === null ? null : [r1, r2];
}

/** Ters iterasyon: (A − (λ+ε)I)x = b'yi 3 kez çöz, normalle. */
function inverseIteration(shifted: C[][], scale: number): C[] {
  const n = shifted.length;
  const eps = 1e-9 * scale;
  const M: C[][] = shifted.map((row, i) => row.map((z, j) => (i === j ? { re: z.re - eps, im: z.im } : z)));
  let x: C[] = Array.from({ length: n }, (_, i) => ({ re: 1 + 0.1 * i, im: 0.05 * i }));
  const F = numericField(1e-300);
  for (let it = 0; it < 3; it++) {
    const A2 = M.map((row, i) => [...row, x[i]].map((z) => ({ ...z })));
    for (let col = 0; col < n; col++) {
      let pr = col;
      for (let r = col + 1; r < n; r++) if (cabs(A2[r][col]) > cabs(A2[pr][col])) pr = r;
      [A2[pr], A2[col]] = [A2[col], A2[pr]];
      const piv = cabs(A2[col][col]) < 1e-300 ? { re: 1e-300, im: 0 } : A2[col][col];
      for (let r = col + 1; r < n; r++) {
        const f = F.div(A2[r][col], piv) ?? zeroC;
        A2[r] = A2[r].map((z, j) => csub(z, cmul(f, A2[col][j])));
      }
    }
    const y: C[] = new Array(n).fill(zeroC);
    for (let i = n - 1; i >= 0; i--) {
      let s = A2[i][n];
      for (let j = i + 1; j < n; j++) s = csub(s, cmul(A2[i][j], y[j]));
      const piv = cabs(A2[i][i]) < 1e-300 ? { re: 1e-300, im: 0 } : A2[i][i];
      y[i] = F.div(s, piv) ?? zeroC;
    }
    const nrm = Math.sqrt(y.reduce((a, z) => a + z.re * z.re + z.im * z.im, 0)) || 1;
    x = y.map((z) => cscale(z, 1 / nrm));
  }
  return x;
}

/** Karmaşık kare matrisin özdeğer/özvektörleri (kesin cisimde kesin, aksi halde sayısal). */

/**
 * `cur` (kalan, kesin polinom) köklerine KESİN ad verir. `roots` sayısal köklerdir
 * (gerçel kısma göre azalan sıralı); dönen dizi aynı sıradadır. Cardano/trig ya da
 * (−b ± √Δ)/2 sayısal olarak DOĞRULANMAZSA "k. kök" gösterimine düşülür.
 */
function algebraicLabels<T>(F: Field<T>, cur: T[], roots: C[], lang: 'tr' | 'en'): string[] | null {
  const deg = cur.length - 1;
  const near = (cands: { text: string; value: C }[]): string[] | null => {
    const out: string[] = [];
    const taken = new Set<number>();
    for (const r of roots) {
      let bi = -1;
      let bd = Infinity;
      cands.forEach((c, i) => {
        const d = cabs(csub(c.value, r));
        if (!taken.has(i) && d < bd) {
          bd = d;
          bi = i;
        }
      });
      if (bi < 0 || bd > 1e-6 * (1 + cabs(r))) return null;
      taken.add(bi);
      out.push(cands[bi].text);
    }
    return out;
  };
  const fm = (x: T) => F.fmt(x, 'fraction');
  // 1) rasyonel katsayılı kübik
  if (deg === 3 && cur.every((co) => F.im(co) === 0)) {
    const qs = cur.map((co) => parseQ(fm(co)));
    if (qs.every((x) => x !== null)) {
      const cands = cubicClosedForms(qs[3]!, qs[2]!, qs[1]!, qs[0]!);
      const hit = cands ? near(cands) : null;
      if (hit) return hit;
    }
  }
  // 2) monik ikinci derece: (−b ± √Δ)/2 (Δ karmaşık, sade karekökü yok)
  if (deg === 2 && fm(cur[2]) === '1') {
    const b = cur[1];
    const c0 = cur[0];
    const c2x = F.add(c0, c0);
    const disc = F.sub(F.mul(b, b), F.add(c2x, c2x));
    const dz: C = { re: F.re(disc), im: F.im(disc) };
    const m = cabs(dz);
    const sq: C = m === 0 ? { re: 0, im: 0 } : { re: Math.sqrt((m + dz.re) / 2), im: (dz.im < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (m - dz.re) / 2)) };
    const nb: C = { re: -F.re(b), im: -F.im(b) };
    const negB = F.isZero(b) ? '' : fm(F.neg(b));
    const D = `√(${fm(disc)})`;
    const mk = (sgn: 1 | -1) => {
      const body = negB === '' ? (sgn === 1 ? D : `-${D}`) : `${negB} ${sgn === 1 ? '+' : '-'} ${D}`;
      return `(${body})/2`;
    };
    const cands = [
      { text: mk(1), value: { re: (nb.re + sq.re) / 2, im: (nb.im + sq.im) / 2 } },
      { text: mk(-1), value: { re: (nb.re - sq.re) / 2, im: (nb.im - sq.im) / 2 } },
    ];
    const hit = near(cands);
    if (hit) return hit;
  }
  // 3) genel: "p(λ) = 0 denkleminin k. kökü"
  const ptxt = polyText(F, cur, 'λ');
  return roots.map((_, i) => (lang === 'en' ? `root #${i + 1} of ${ptxt} = 0` : `${ptxt} = 0 denkleminin ${i + 1}. kökü`));
}

export function eigenGeneral<T>(c: CxCtx<T>, A: T[][]): OperationResult {
  const { F, lang, mode, S } = c;
  const n = A.length;
  const An: C[][] = A.map((row) => row.map((x) => ({ re: F.re(x), im: F.im(x) })));
  let scale = 1;
  for (const row of An) for (const z of row) scale = Math.max(scale, cabs(z));
  const steps: SolutionStep[] = [
    {
      title: T2(lang, 'Matris', 'Matrix'),
      description: T2(lang, `${n}x${n} matrisin özdeğer/özvektörleri hesaplanıyor.`, `Computing the eigenvalues/eigenvectors of the ${n}x${n} matrix.`),
      ...snap(c, A),
    },
  ];

  const numEigs = qrEigenvalues(An);
  if (!numEigs) return { success: false, errorMessage: S.eigenComplexError(), steps };

  const entries: EigEntry<T>[] = [];
  const opaqueVectors = new Map<Ext, Ext[]>();
  const used: boolean[] = new Array(n).fill(false);
  let poly: T[] | null = null;
  let exactNote = '';
  if (F.exact) {
    try {
      poly = charPoly(F, A);
      const fmtPoly = (cs: T[]) =>
        cs
          .map((co, k) => ({ co, k }))
          .filter(({ co }) => !F.isZero(co))
          .reverse()
          .map(({ co, k }) => `(${F.fmt(co, mode)})${k === 0 ? '' : k === 1 ? 'λ' : `λ^${k}`}`)
          .join(' + ');
      steps.push({ title: T2(lang, 'Karakteristik Polinom', 'Characteristic Polynomial'), description: `p(λ) = det(A − λI) = ${fmtPoly(poly)}` });
    } catch (e) {
      if (!(e as { noSymbolic?: boolean }).noSymbolic) throw e;
      poly = null;
    }
  }

  let cur = poly;
  if (cur) {
    const basis = candidateBasis(A as unknown as CxSym[][]);
    const tolMatch = 1e-6 * scale;
    // Sınır cur.length > 2 (yalnızca 1 kök kalana dek dener) - böylece "kalan
    // ikinci derece denklem" aslında BİRBİRİNDEN BAĞIMSIZ iki sade kökse (ör.
    // üst üçgen bir bloktaki π ve √2 gibi, disc'leri π−√2 içerse de tek tek π ve
    // √2 doğrudan tanınabilir), opak/ikinci-derece formülüne düşmeden önce
    // TEK TEK bulunurlar. Her aday yine de p(λ)=0 ile KESİN doğrulanır.
    for (let i = 0; i < n && cur && cur.length > 2; i++) {
      if (used[i]) continue;
      const z = numEigs[i];
      const res = recognizeParts(z.re, basis);
      const ims = recognizeParts(z.im, basis);
      let found: T | null = null;
      outer: for (const re of res)
        for (const im of ims) {
          const cand = { re, im } as unknown as T; // yalnızca kesin cisimde (F.exact) çalışır
          if (F.isZero(horner(F, cur, cand))) {
            found = cand;
            break outer;
          }
        }
      if (found === null) continue;
      let mult = 0;
      while (cur.length > 1 && F.isZero(horner(F, cur, found))) {
        cur = deflate(F, cur, found);
        mult++;
      }
      const fn: C = { re: F.re(found), im: F.im(found) };
      let assigned = 0;
      for (let k = 0; k < n && assigned < mult; k++) {
        if (!used[k] && cabs(csub(numEigs[k], fn)) <= tolMatch) {
          used[k] = true;
          assigned++;
        }
      }
      for (let m = 0; m < mult; m++) entries.push({ num: fn, exact: found });
      if (assigned < mult) break; // sayısal eşleşme bulunamadı: güvenli tarafta dur
      i = -1; // yeni polinomla baştan tara
    }
    if (cur && cur.length <= 3 && cur.length > 1) {
      const solved = solveLowDegree(F, cur, basis);
      if (solved) {
        for (const r of solved) {
          const fn: C = { re: F.re(r), im: F.im(r) };
          let best = -1, bd = Infinity;
          numEigs.forEach((z, k) => {
            if (!used[k] && cabs(csub(z, fn)) < bd) {
              bd = cabs(csub(z, fn));
              best = k;
            }
          });
          if (best >= 0) used[best] = true;
          entries.push({ num: fn, exact: r });
        }
      } else if (F.exact && cur.length === 3) {
        // √Δ ve i√(−Δ) sade değil: opak (a + b·s) biçiminde KESİN dene (yalnızca
        // gerçel n×n matrislerde; bkz. solveOpaqueQuadratic).
        const opq = solveOpaqueQuadratic(A as unknown as CxSym[][], cur as unknown as CxSym[]);
        if (opq) {
          const { ctx, lam1, lam2 } = opq;
          const extF = extField(ctx);
          const Aext: Ext[][] = (A as unknown as CxSym[][]).map((row) => row.map((z) => ext(z.re)));
          const shifted = Aext.map((row, i) => row.map((x, j) => (i === j ? extSub(x, lam1) : x)));
          try {
            // BÖLMESİZ null vektör (bkz. cofactorNullVector): (shifted)·v = 0 zaten
            // KESİN doğrulanmış olarak döner; ek sayısal kontrol yalnızca λ2/v2
            // (eşlenik) çiftinin de tutarlı olduğunu (kod hatasına karşı) sınar.
            const v1 = cofactorNullVector(extF, shifted);
            if (v1) {
              const v2 = v1.map(extConj);
              const l1n = extToNumber(ctx, lam1);
              const l2n = extToNumber(ctx, lam2);
              const resOk = (l: Cnum, v: Ext[]) =>
                An.every((row, i) => {
                  let re = 0, im = 0;
                  for (let j = 0; j < n; j++) {
                    const vj = extToNumber(ctx, v[j]);
                    re += row[j].re * vj.re - row[j].im * vj.im;
                    im += row[j].re * vj.im + row[j].im * vj.re;
                  }
                  const vi = extToNumber(ctx, v[i]);
                  const er = l.re * vi.re - l.im * vi.im, ei = l.re * vi.im + l.im * vi.re;
                  return Math.hypot(re - er, im - ei) < 1e-6 * scale * (1 + cabs(l));
                });
              if (resOk(l1n, v1) && resOk(l2n, v2)) {
                for (const [lam, ln] of [[lam1, l1n], [lam2, l2n]] as const) {
                  let best = -1, bd = Infinity;
                  numEigs.forEach((z, k) => {
                    if (!used[k] && cabs(csub(z, ln)) < bd) {
                      bd = cabs(csub(z, ln));
                      best = k;
                    }
                  });
                  if (best >= 0) used[best] = true;
                  entries.push({ num: ln, exact: null, opaque: { ctx, val: lam } });
                }
                opaqueVectors.set(lam1, v1);
                opaqueVectors.set(lam2, v2);
                cur = [F.one];
              }
            }
          } catch (e) {
            if (!(e as { noSymbolic?: boolean }).noSymbolic) throw e;
          }
        }
      }
    }
    if (entries.length > 0) {
      exactNote = T2(lang, `${entries.length} özdeğer KESİN bulundu (p(λ) = 0 kesin doğrulandı).`, `${entries.length} eigenvalue(s) found EXACTLY (p(λ) = 0 verified exactly).`);
    }
  }
  // KESİRLİ mod: kalan (sade ifadesi bulunamayan) kökler ondalık yerine KESİN adla yazılır.
  if (mode === 'fraction' && F.exact && cur && cur.length >= 3 && n <= 6) {
    const unresolved = numEigs.map((z, k) => ({ z, k })).filter(({ k }) => !used[k]);
    if (unresolved.length === cur.length - 1) {
      unresolved.sort((a, b) => (Math.abs(b.z.re - a.z.re) > 1e-9 * scale ? b.z.re - a.z.re : b.z.im - a.z.im));
      const labels = algebraicLabels(F, cur, unresolved.map((u) => u.z), lang);
      if (labels) {
        unresolved.forEach(({ z, k }, idx) => {
          used[k] = true;
          entries.push({ num: z, exact: null, alg: { label: labels[idx] } });
        });
      }
    }
  }
  numEigs.forEach((z, k) => {
    if (!used[k]) entries.push({ num: z, exact: null });
  });

  entries.sort((a, b) => (Math.abs(b.num.re - a.num.re) > 1e-9 * scale ? b.num.re - a.num.re : b.num.im - a.num.im));
  if (entries.length !== n) return { success: false, errorMessage: S.eigenComplexError(), steps };

  const lamStr = (e: EigEntry<T>) =>
    e.alg ? e.alg.label : e.opaque ? extToString(e.opaque.ctx, e.opaque.val, mode) : e.exact !== null ? F.fmt(e.exact, mode) : cToString(e.num, mode);
  steps.push({
    title: T2(lang, 'Özdeğerler', 'Eigenvalues'),
    description:
      entries.map((e, i) => `λ${i + 1} = ${lamStr(e)}`).join('\n') +
      (exactNote ? `\n${exactNote}` : '') +
      (entries.some((e) => e.alg)
        ? '\n' +
          T2(
            lang,
            'Sade (rasyonel/köklü) ifadesi olmayan kökler ondalık yerine kesin biçimde yazıldı. "k. kök" gösteriminde kökler gerçel kısma göre azalan sırada numaralandırılır.',
            'Roots without a simple (rational/radical) form are written exactly instead of as decimals. In the "root #k" notation roots are numbered by decreasing real part.'
          )
        : '') +
      (entries.some((e) => e.exact === null && !e.opaque && !e.alg)
        ? '\n' + T2(lang, 'Kesin ifadesi bulunamayan özdeğerler sayısal (karmaşık QR algoritması) hesaplandı.', 'Eigenvalues without an exact form were computed numerically (complex QR algorithm).')
        : ''),
  });

  const groups: { idxs: number[]; e: EigEntry<T> }[] = [];
  entries.forEach((e, i) => {
    const g = groups.find((gr) =>
      e.exact !== null && gr.e.exact !== null
        ? F.isZero(F.sub(e.exact, gr.e.exact))
        : e.exact === null && gr.e.exact === null && cabs(csub(e.num, gr.e.num)) <= 1e-7 * scale
    );
    if (g) g.idxs.push(i);
    else groups.push({ idxs: [i], e });
  });

  type VecOut = { re: number[]; im: number[]; str: string[] };
  const vecs: VecOut[] = new Array(n);
  const notes: string[] = [];
  let algVec = false;
  const cofCache = new Map<number, T[][]>();
  const fnum = numericField(1e-8 * scale);
  for (const g of groups) {
    let basis: VecOut[] = [];
    let done = false;
    if (g.e.opaque) {
      const v = opaqueVectors.get(g.e.opaque.val);
      if (v) {
        const { ctx } = g.e.opaque;
        basis = [{ re: v.map((x) => extToNumber(ctx, x).re), im: v.map((x) => extToNumber(ctx, x).im), str: v.map((x) => extToString(ctx, x, mode)) }];
        done = true;
      }
    }
    if (!done && g.e.exact !== null && F.exact) {
      try {
        const lam = g.e.exact;
        const shifted = A.map((row, i) => row.map((x, j) => (i === j ? F.sub(x, lam) : x)));
        const { R, pivots } = eliminate(c, shifted, 'rref', n, null);
        let vs = nullspaceFrom(F, R, pivots, n);
        if (vs.length > 0) {
          vs = vs.map((v) => cleanExactVector(v as unknown as CxSym[]) as unknown as T[]);
          basis = vs.map((v) => ({ re: v.map((x) => F.re(x)), im: v.map((x) => F.im(x)), str: v.map((x) => F.fmt(x, mode)) }));
          done = true;
        }
      } catch (e) {
        if (!(e as { noSymbolic?: boolean }).noSymbolic) throw e;
      }
    }
    if (!done && g.e.alg && F.exact) {
      const firstIdx = g.idxs[0];
      let cf: ReturnType<typeof cofactorEigenvector<T>> = null;
      try {
        cf = cofactorEigenvector(F, A, g.e.num, scale, cofCache);
      } catch (e) {
        if (!(e as { noSymbolic?: boolean }).noSymbolic) throw e;
      }
      if (cf) {
        const name = `λ${subDigits(firstIdx + 1)}`;
        basis = [{ re: cf.num.map((z) => z.re), im: cf.num.map((z) => z.im), str: cf.polys.map((p) => polyText(F, p, name)) }];
        algVec = true;
        done = true;
      }
    }
    if (!done) {
      // sayısal özuzay: (A − λI) sayısal RREF (gevşek eşik) ya da ters iterasyon
      const lam = g.e.num;
      const shifted: C[][] = An.map((row, i) => row.map((z, j) => (i === j ? csub(z, lam) : z)));
      const cc: CxCtx<C> = { F: fnum, lang, mode, S };
      let vs: C[][] = [];
      try {
        const { R, pivots } = eliminate(cc, shifted, 'rref', n, null);
        vs = nullspaceFrom(fnum, R, pivots, n);
      } catch {
        vs = [];
      }
      if (vs.length === 0) vs = [inverseIteration(shifted, scale)];
      basis = vs.map((v) => {
        const k = v.findIndex((z) => cabs(z) > 1e-9);
        const d = k >= 0 ? v[k] : { re: 1, im: 0 };
        const nv = v.map((z) => fnum.div(z, d) ?? z);
        return { re: nv.map((z) => z.re), im: nv.map((z) => z.im), str: nv.map((z) => cToString(z, mode)) };
      });
    }
    g.idxs.forEach((idx, occ) => {
      vecs[idx] = basis[Math.min(occ, basis.length - 1)];
    });
    if (g.idxs.length > 1) {
      const dim = basis.length;
      notes.push(
        dim >= g.idxs.length
          ? T2(lang, `λ = ${lamStr(g.e)}: cebirsel katlılık ${g.idxs.length}, özuzay ${dim} boyutlu.`, `λ = ${lamStr(g.e)}: algebraic multiplicity ${g.idxs.length}, eigenspace dimension ${dim}.`)
          : T2(lang, `λ = ${lamStr(g.e)}: cebirsel katlılık ${g.idxs.length}, ama özuzay yalnızca ${dim} boyutlu ⇒ matris köşegenleştirilemez (aynı özvektör tekrar gösterilir).`, `λ = ${lamStr(g.e)}: algebraic multiplicity ${g.idxs.length}, but the eigenspace has dimension ${dim} only ⇒ the matrix is not diagonalizable (the same eigenvector is repeated).`)
      );
    }
  }
  if (algVec) {
    notes.push(
      T2(
        lang,
        'λₖ cinsinden yazılan özvektörlerde λₖ yerine yukarıdaki k. özdeğerin kesin ifadesi konur (bileşenler (A − λI)\'nın bir satırı atılarak alınan kofaktörlerdir).',
        'In the eigenvectors written in terms of λₖ, substitute the exact expression of the k-th eigenvalue above for λₖ (components are cofactors of (A − λI) with one row removed).'
      )
    );
  }
  steps.push({
    title: T2(lang, 'Özvektörler', 'Eigenvectors'),
    description: [...vecs.map((v, i) => `v${i + 1} (λ${i + 1}) = [${v.str.join(', ')}]`), ...notes].join('\n'),
  });

  const anyComplex = entries.some((e) => Math.abs(e.num.im) > 1e-12) || vecs.some((v) => v.im.some((x) => Math.abs(x) > 1e-12));
  return {
    success: true,
    eigenResult: {
      eigenvalues: entries.map((e) => e.num.re),
      eigenvectors: vecs.map((v) => v.re),
      ...(anyComplex ? { eigenvaluesIm: entries.map((e) => e.num.im), eigenvectorsIm: vecs.map((v) => v.im) } : {}),
      radicalExpressions: entries.map(lamStr),
      eigenvectorRadicals: vecs.map((v) => v.str),
    },
    steps,
  };
}
