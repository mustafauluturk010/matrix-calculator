// Quadratic extension: a + b·s, s² = M. a and b are SymNum; s is one of:
//   'i'     : s = i (M = −1)         -> complex numbers (a + b·i)
//   'sqrt'  : s = √M, M > 0          -> real eigenvalue whose root does not simplify
//   'isqrt' : s = i·√(−M), M < 0     -> complex eigenvalue whose root does not simplify
// Used in eigenvalue/eigenvector computation when the discriminant has no simple square root
// (3+ terms, π mixed with roots, ...) or is negative: the expression M inside s is kept as an
// opaque symbol, and add/subtract/multiply are exact using s² = M.
//
// Assumes s lies outside the field of a and b (Q(π, √r, ...)); otherwise a + b·s = 0 could hold
// with a, b ≠ 0. This always holds for 'i'. For an opaque root, M may actually be a perfect
// square that symSqrt missed; the zero test then says "non-zero" (the safe direction: verification
// fails and the numeric engine takes over), so callers also verify numerically.

import {
  SymNum,
  Term,
  SYM_ZERO,
  SYM_ONE,
  symAdd,
  symSub,
  symMul,
  symNeg,
  symIsZero,
  symDiv,
  symToNumber,
  symToString,
  symJoinTerms,
  decimalComplexString,
} from './symbolic';

export type SKind = 'i' | 'sqrt' | 'isqrt';

export interface QuadCtx {
  /** s² = M */
  M: SymNum;
  kind: SKind;
}

export interface Ext {
  a: SymNum;
  b: SymNum;
}

export type Cnum = { re: number; im: number };

export const ext = (a: SymNum, b: SymNum = SYM_ZERO): Ext => ({ a, b });
export const EXT_ZERO: Ext = { a: SYM_ZERO, b: SYM_ZERO };

export const extIsZero = (x: Ext): boolean => symIsZero(x.a) && symIsZero(x.b);
export const extAdd = (x: Ext, y: Ext): Ext => ({ a: symAdd(x.a, y.a), b: symAdd(x.b, y.b) });
export const extSub = (x: Ext, y: Ext): Ext => ({ a: symSub(x.a, y.a), b: symSub(x.b, y.b) });
export const extNeg = (x: Ext): Ext => ({ a: symNeg(x.a), b: symNeg(x.b) });
/** Galois eşleniği: s → −s. */
export const extConj = (x: Ext): Ext => ({ a: x.a, b: symNeg(x.b) });

export function extMul(ctx: QuadCtx, x: Ext, y: Ext): Ext {
  return {
    a: symAdd(symMul(x.a, y.a), symMul(symMul(x.b, y.b), ctx.M)),
    b: symAdd(symMul(x.a, y.b), symMul(x.b, y.a)),
  };
}

/** x / y; y = 0 ya da norm (a² − b²·M) sembolik olarak bölünemiyorsa null. */
export function extDiv(ctx: QuadCtx, x: Ext, y: Ext): Ext | null {
  if (extIsZero(y)) return null;
  const norm = symSub(symMul(y.a, y.a), symMul(symMul(y.b, y.b), ctx.M));
  const num = extMul(ctx, x, extConj(y));
  const a = symDiv(num.a, norm);
  const b = symDiv(num.b, norm);
  return a === null || b === null ? null : { a, b };
}

/** s'nin sayısal değeri. */
export function sValue(ctx: QuadCtx): Cnum {
  if (ctx.kind === 'i') return { re: 0, im: 1 };
  const m = symToNumber(ctx.M);
  if (ctx.kind === 'sqrt') return { re: Math.sqrt(Math.max(m, 0)), im: 0 };
  return { re: 0, im: Math.sqrt(Math.max(-m, 0)) };
}

export function extToNumber(ctx: QuadCtx, x: Ext): Cnum {
  const s = sValue(ctx);
  const a = symToNumber(x.a);
  const b = symToNumber(x.b);
  return { re: a + b * s.re, im: b * s.im };
}

export const cabs = (z: Cnum): number => Math.hypot(z.re, z.im);

function sLabel(ctx: QuadCtx, mode: 'decimal' | 'fraction'): string {
  if (ctx.kind === 'i') return 'i';
  if (ctx.kind === 'sqrt') return `√(${symToString(ctx.M, mode)})`;
  return `i√(${symToString(symNeg(ctx.M), mode)})`;
}

/** a + b·s metni: "1/2 + √3i/2", "π/2 + √(π² + 2π√2 + 2)/2". */
export function extToString(ctx: QuadCtx, x: Ext, mode: 'decimal' | 'fraction' = 'fraction'): string {
  if (mode === 'decimal') {
    const z = extToNumber(ctx, x);
    return decimalComplexString(z.re, z.im);
  }
  const items: { t: Term; suffix: string }[] = x.a.map((t) => ({ t, suffix: '' }));
  const sl = sLabel(ctx, mode);
  if (x.b.length === 0) return symJoinTerms(items, mode);
  if (ctx.kind === 'i' || x.b.length === 1) {
    x.b.forEach((t) => items.push({ t, suffix: sl }));
    return symJoinTerms(items, mode);
  }
  // Çok terimli b ve opak kök: (b)·√(M) biçiminde grupla.
  const tail = `(${symToString(x.b, mode)})${sl}`;
  return items.length === 0 ? tail : `${symJoinTerms(items, mode)} + ${tail}`;
}

const cross = (ctx: QuadCtx, u: Ext[], v: Ext[]): Ext[] => {
  const c = (a: Ext, b: Ext, e: Ext, f: Ext) => extSub(extMul(ctx, a, b), extMul(ctx, e, f));
  return [c(u[1], v[2], u[2], v[1]), c(u[2], v[0], u[0], v[2]), c(u[0], v[1], u[1], v[0])];
};

const extLen = (v: Ext[], ctx: QuadCtx) => v.reduce((sum, x) => sum + extToString(ctx, x).length, 0);
const extTerms = (v: Ext[]) => v.reduce((sum, x) => sum + x.a.length + x.b.length, 0);

/**
 * Özvektörü sadeleştirir (yönü değişmez): ilk sıfırdan farklı bileşen ya da
 * yalnızca tek terimli (a ya da b) bileşenlerden birine bölmek daha kısa bir
 * sonuç veriyorsa onu seçer. Tek sıfırdan farklı bileşen ⇒ birim vektör.
 */
export function extSimplifyVector(ctx: QuadCtx, v: Ext[]): Ext[] {
  const nz = v.findIndex((x) => !extIsZero(x));
  if (nz < 0) return v;
  if (v.filter((x) => !extIsZero(x)).length === 1) {
    return v.map((x, i) => (i === nz ? ext(SYM_ONE) : EXT_ZERO));
  }
  let best = v;
  const divisors = v.filter((x) => !extIsZero(x) && (x.a.length + x.b.length <= 2 || x === v[nz]));
  for (const div of divisors) {
    try {
      const scaled = v.map((x) => extDiv(ctx, x, div));
      if (scaled.some((x) => x === null)) continue;
      const cand = scaled as Ext[];
      if (extLen(cand, ctx) < extLen(best, ctx)) best = cand;
    } catch {
      /* taşma: bu bölen atlanır */
    }
  }
  return best;
}

/**
 * (A − λI)'nın (3x3, Ext girişli, λ özdeğer ⇒ det = 0, rank 2 varsayımıyla)
 * null vektörü: iki satırın vektörel çarpımı. Sonuç KESİN doğrulanır
 * (her satırla iç çarpım 0) ve sayısal olarak sıfır vektörü olmadığı kontrol
 * edilir. Bulunamazsa null.
 */
export function extNullVector3(ctx: QuadCtx, shifted: Ext[][]): Ext[] | null {
  // Tek sıfırdan farklı girişli satır o bileşeni sıfıra sabitler (v_k = 0);
  // ayrık bloklu matrislerde (ör. 2x2 blok ⊕ [c]) vektörün gereksiz (c − λ)
  // çarpanıyla şişmesini önler. Kalan 2 serbest bileşende (−y, x) çözümü.
  {
    const pinned = new Set<number>();
    for (let changed = true; changed; ) {
      changed = false;
      for (const row of shifted) {
        const free = [0, 1, 2].filter((k) => !pinned.has(k) && !extIsZero(row[k]));
        if (free.length === 1) {
          pinned.add(free[0]);
          changed = true;
        }
      }
    }
    const F = [0, 1, 2].filter((k) => !pinned.has(k));
    if (F.length === 2) {
      const rows2 = shifted.map((r) => [r[F[0]], r[F[1]]]).filter((r) => !(extIsZero(r[0]) && extIsZero(r[1])));
      if (rows2.length > 0) {
        rows2.sort((x, y) => extTerms(x) - extTerms(y));
        const [x, y] = rows2[0];
        const w: Ext[] = [EXT_ZERO, EXT_ZERO, EXT_ZERO];
        w[F[0]] = extNeg(y);
        w[F[1]] = x;
        const v = extSimplifyVector(ctx, w);
        let ok = Math.max(...v.map((z) => cabs(extToNumber(ctx, z)))) > 1e-9;
        for (const row of shifted) {
          const dot = extAdd(extAdd(extMul(ctx, row[0], v[0]), extMul(ctx, row[1], v[1])), extMul(ctx, row[2], v[2]));
          if (!extIsZero(dot)) ok = false;
        }
        if (ok) return v;
      }
    }
  }
  const candidates = ([[0, 1], [0, 2], [1, 2]] as const)
    .map(([i, j]) => cross(ctx, shifted[i], shifted[j]))
    .filter((c) => !c.every(extIsZero))
    .filter((c) => Math.max(...c.map((x) => cabs(extToNumber(ctx, x)))) > 1e-9);
  if (candidates.length === 0) return null;
  candidates.sort((x, y) => extTerms(x) - extTerms(y));
  const v = extSimplifyVector(ctx, candidates[0]);
  for (const row of shifted) {
    const dot = extAdd(extAdd(extMul(ctx, row[0], v[0]), extMul(ctx, row[1], v[1])), extMul(ctx, row[2], v[2]));
    if (!extIsZero(dot)) return null;
  }
  return v;
}

/** 2x2 (A − λI) satırından null vektör: (−b, a) (bölmesiz), sonra sadeleştirme. */
export function extNullVector2(ctx: QuadCtx, shifted: Ext[][]): Ext[] | null {
  const rows = shifted.filter((r) => !(extIsZero(r[0]) && extIsZero(r[1])));
  if (rows.length === 0) return null;
  const [x, y] = rows[0];
  let v: Ext[];
  if (extIsZero(x)) v = [ext(SYM_ONE), EXT_ZERO];
  else if (extIsZero(y)) v = [EXT_ZERO, ext(SYM_ONE)];
  else v = extSimplifyVector(ctx, [extNeg(y), x]);
  for (const row of shifted) {
    const dot = extAdd(extMul(ctx, row[0], v[0]), extMul(ctx, row[1], v[1]));
    if (!extIsZero(dot)) return null;
  }
  return v;
}
