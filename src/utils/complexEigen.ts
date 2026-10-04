// Numeric complex eigenvalues/eigenvectors (2x2 and 3x3) for real matrices with complex
// conjugate eigenvalues. The exact symbolic path (symbolicOps.ts + quadExt.ts) is tried first;
// this runs when that fails (e.g. irreducible cubic) or there is no symbolic input.
//   2x2: λ = trace/2 ± i·√(-Δ)/2, eigenvector (-b, a - λ).
//   3x3: one real root of the characteristic polynomial plus the remaining quadratic;
//        eigenvectors are the (complex) cross product of rows of (A - λI).

import { LanguageCode, MatrixData, OperationResult, SolutionStep } from '@/types';
import { getDecimalPlaces } from './displaySettings';
import { formatNumber, NumberDisplayMode } from './numberFormat';

export type C = { re: number; im: number };

const cSub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cAbs = (a: C) => Math.hypot(a.re, a.im);
const cDiv = (a: C, b: C): C => {
  const n = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / n, im: (a.im * b.re - a.re * b.im) / n };
};

/** x³ + b·x² + c·x + e = 0'ın gerçel kökleri (sayısal, artan sırada, tekrarlılar tek sayılır). */
export function realRootsCubic(b: number, c: number, e: number): number[] {
  const f = (x: number) => ((x + b) * x + c) * x + e;
  const scaleAt = (x: number) => Math.max(Math.abs(x * x * x), Math.abs(b * x * x), Math.abs(c * x), Math.abs(e), 1e-12);
  const R = 1 + Math.max(Math.abs(b), Math.abs(c), Math.abs(e));
  const bisect = (lo: number, hi: number): number => {
    let flo = f(lo);
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      const fm = f(mid);
      if (fm === 0) return mid;
      if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const pts: number[] = [-R];
  const D = 4 * b * b - 12 * c; // türevin diskriminantı
  const roots: number[] = [];
  if (D > 0) {
    const sq = Math.sqrt(D);
    for (const xc of [(-2 * b - sq) / 6, (-2 * b + sq) / 6]) {
      pts.push(xc);
      if (Math.abs(f(xc)) <= 1e-9 * scaleAt(xc)) roots.push(xc); // teğet (çift) kök
    }
  } else if (D === 0) {
    const x0 = -b / 3;
    if (Math.abs(f(x0)) <= 1e-9 * scaleAt(x0)) roots.push(x0); // üçlü kök
  }
  pts.push(R);
  for (let i = 0; i + 1 < pts.length; i++) {
    const lo = pts[i], hi = pts[i + 1];
    const flo = f(lo), fhi = f(hi);
    if (flo === 0) roots.push(lo);
    else if (fhi === 0) roots.push(hi);
    else if ((flo < 0) !== (fhi < 0)) roots.push(bisect(lo, hi));
  }
  roots.sort((x, y) => x - y);
  const out: number[] = [];
  for (const r of roots) if (out.length === 0 || Math.abs(r - out[out.length - 1]) > 1e-9 * Math.max(1, Math.abs(r))) out.push(r);
  return out;
}

const T = (lang: LanguageCode, tr: string, en: string) => (lang === 'en' ? en : tr);

// formatNumber (kök/π tanıma) pahalıdır; eliminasyon adımlarında aynı değerler defalarca
// biçimlendirilir. Küçük bir bellek (değer, mod) → metin.
const FMT_CACHE = new Map<string, string>();
function fmtNum(v: number, mode: NumberDisplayMode): string {
  // Anahtara ondalık basamak sayısı da girer: aksi halde Ayarlar'da basamak değişince
  // eski hassasiyetteki metin önbellekten dönüp sonuç "donuk" kalırdı.
  const key = `${mode}|${getDecimalPlaces()}|${v}`;
  const hit = FMT_CACHE.get(key);
  if (hit !== undefined) return hit;
  const out = formatNumber(v, mode);
  if (FMT_CACHE.size > 4000) FMT_CACHE.clear();
  FMT_CACHE.set(key, out);
  return out;
}

function cleanNum(v: number): number {
  const r = Math.round(v * 1e9) / 1e9;
  return Object.is(r, -0) || Math.abs(r) < 1e-12 ? 0 : r;
}

/**
 * Sanal kısmın (işaretsiz, ≠ 0) metni. `i` payın içine, kesir/kök yazımıyla
 * ÇELİŞMEYECEK biçimde konur: "152541/400000" → "152541i/400000", "√3/2" → "i√3/2",
 * "2√3/5" → "2i√3/5", "π" → "iπ". ("a/bi" yazımı a/(b·i) diye okunurdu.)
 */
function imagBody(absIm: number, mode: NumberDisplayMode): string {
  if (absIm === 1) return 'i';
  const s = fmtNum(absIm, mode);
  const slash = s.indexOf('/');
  const num = slash >= 0 ? s.slice(0, slash) : s;
  const den = slash >= 0 ? s.slice(slash) : '';
  return num.replace(/^(\d*\.?\d*)/, '$1i') + den;
}

export function cToString(z: C, mode: NumberDisplayMode): string {
  const re = cleanNum(z.re);
  const im = cleanNum(z.im);
  if (im === 0) return fmtNum(re, mode);
  const imBody = imagBody(Math.abs(im), mode);
  if (re === 0) return `${im < 0 ? '-' : ''}${imBody}`;
  return `${fmtNum(re, mode)} ${im < 0 ? '-' : '+'} ${imBody}`;
}

function cross(u: C[], v: C[]): C[] {
  const c = (a: C, b: C, e: C, f: C) => cSub(cMul(a, b), cMul(e, f));
  return [c(u[1], v[2], u[2], v[1]), c(u[2], v[0], u[0], v[2]), c(u[0], v[1], u[1], v[0])];
}

/** İlk (mutlak değerce yeterince büyük) bileşen 1 olacak şekilde ölçekler. */
function normalizeFirst(v: C[]): C[] {
  const maxAbs = Math.max(...v.map(cAbs));
  const k = v.findIndex((z) => cAbs(z) > 1e-9 * Math.max(1, maxAbs));
  if (k < 0) return v;
  const d = v[k];
  return v.map((z) => cDiv(z, d));
}

function nullVector3(shifted: C[][]): C[] | null {
  let best: C[] | null = null;
  let bestNorm = 0;
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as const) {
    const c = cross(shifted[i], shifted[j]);
    const n = Math.max(...c.map(cAbs));
    if (n > bestNorm) {
      bestNorm = n;
      best = c;
    }
  }
  return bestNorm > 1e-9 ? normalizeFirst(best!) : null;
}

/** Karmaşık özdeğer yoksa (ya da hesap güvenilir değilse) null döner. */
export function eigenComplexNumeric(a: MatrixData, lang: LanguageCode, mode: NumberDisplayMode): OperationResult | null {
  const n = a.length;
  if ((n !== 2 && n !== 3) || a.some((row) => row.length !== n)) return null;

  let lambdas: C[];
  let vectors: C[][];
  const steps: SolutionStep[] = [];

  if (n === 2) {
    const tr = a[0][0] + a[1][1];
    const det = a[0][0] * a[1][1] - a[0][1] * a[1][0];
    const disc = tr * tr - 4 * det;
    if (!(disc < -1e-12 * Math.max(1, tr * tr))) return null;
    const s = Math.sqrt(-disc) / 2;
    const l1: C = { re: tr / 2, im: s };
    lambdas = [l1, { re: tr / 2, im: -s }];
    // (A − λI) = [[a00−λ, a01],[a10, a11−λ]] ⇒ v = (−a01, a00−λ) → ilk bileşen 1
    const v1 = normalizeFirst([{ re: -a[0][1], im: 0 }, cSub({ re: a[0][0], im: 0 }, l1)]);
    vectors = [v1, v1.map((z) => ({ re: z.re, im: -z.im }))];
    steps.push({
      title: T(lang, 'Karmaşık Özdeğerler', 'Complex Eigenvalues'),
      description: T(
        lang,
        `İz(A) = ${formatNumber(cleanNum(tr), mode)}, det(A) = ${formatNumber(cleanNum(det), mode)}\nΔ = İz² − 4·det = ${formatNumber(cleanNum(disc), mode)} < 0 ⇒ özdeğerler karmaşık eşlenik çifttir: λ = İz/2 ± i·√(−Δ)/2`,
        `trace(A) = ${formatNumber(cleanNum(tr), mode)}, det(A) = ${formatNumber(cleanNum(det), mode)}\nΔ = trace² − 4·det = ${formatNumber(cleanNum(disc), mode)} < 0 ⇒ the eigenvalues are a complex conjugate pair: λ = trace/2 ± i·√(−Δ)/2`
      ),
    });
  } else {
    const t = a[0][0] + a[1][1] + a[2][2];
    const m = (i: number, j: number, k: number, l: number) => a[i][j] * a[k][l] - a[i][l] * a[k][j];
    const c2 = m(0, 0, 1, 1) + m(0, 0, 2, 2) + m(1, 1, 2, 2);
    const d =
      a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
      a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
      a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    const roots = realRootsCubic(-t, c2, -d);
    if (roots.length !== 1) return null; // 3 gerçel kök (ya da tekrarlı) ⇒ karmaşık yok
    const x = roots[0];
    const u = x - t;
    const w = c2 + x * u;
    const disc = u * u - 4 * w;
    if (!(disc < 0)) return null;
    const s = Math.sqrt(-disc) / 2;
    const l1: C = { re: -u / 2, im: s };
    const l2: C = { re: -u / 2, im: -s };
    const shiftedFor = (lam: C): C[][] =>
      a.map((row, i) => row.map((v, j) => cSub({ re: v, im: 0 }, i === j ? lam : { re: 0, im: 0 })));
    const vr = nullVector3(shiftedFor({ re: x, im: 0 }));
    const vc = nullVector3(shiftedFor(l1));
    if (!vr || !vc) return null;
    lambdas = [{ re: x, im: 0 }, l1, l2];
    vectors = [vr, vc, vc.map((z) => ({ re: z.re, im: -z.im }))];
    steps.push({
      title: T(lang, 'Karakteristik Polinom', 'Characteristic Polynomial'),
      description: T(
        lang,
        `p(λ) = λ³ − ${formatNumber(cleanNum(t), mode)}λ² + ${formatNumber(cleanNum(c2), mode)}λ − ${formatNumber(cleanNum(d), mode)} = 0\nTek gerçel kök λ ≈ ${formatNumber(cleanNum(x), mode)}; kalan ikinci derece denklemin Δ = ${formatNumber(cleanNum(disc), mode)} < 0 olduğundan diğer ikisi karmaşık eşlenik çifttir.`,
        `p(λ) = λ³ − ${formatNumber(cleanNum(t), mode)}λ² + ${formatNumber(cleanNum(c2), mode)}λ − ${formatNumber(cleanNum(d), mode)} = 0\nThere is a single real root λ ≈ ${formatNumber(cleanNum(x), mode)}; the remaining quadratic has Δ = ${formatNumber(cleanNum(disc), mode)} < 0, so the other two are a complex conjugate pair.`
      ),
    });
  }

  const lamText = lambdas.map((z) => cToString(z, mode));
  const vecText = vectors.map((v) => v.map((z) => cToString(z, mode)));
  steps.push({
    title: T(lang, 'Özdeğerler', 'Eigenvalues'),
    description: lamText.map((s, i) => `λ${i + 1} = ${s}`).join(', '),
  });
  steps.push({
    title: T(lang, 'Özvektörler', 'Eigenvectors'),
    description: vecText.map((v, i) => T(lang, `λ${i + 1} için v${i + 1} = [${v.join(', ')}]`, `For λ${i + 1}, v${i + 1} = [${v.join(', ')}]`)).join('\n'),
  });

  return {
    success: true,
    eigenResult: {
      eigenvalues: lambdas.map((z) => cleanNum(z.re)),
      eigenvaluesIm: lambdas.map((z) => cleanNum(z.im)),
      eigenvectors: vectors.map((v) => v.map((z) => cleanNum(z.re))),
      eigenvectorsIm: vectors.map((v) => v.map((z) => cleanNum(z.im))),
      radicalExpressions: lamText,
      eigenvectorRadicals: vecText,
    },
    steps,
  };
}


