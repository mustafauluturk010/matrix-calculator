// Display-only number formatting (decimal, fraction, radical). Calculations stay in floating point.

import { parseSymbolicInput, parseExpressionNumber, parseComplexNumber, symToNumber } from './symbolic';

export type NumberDisplayMode = 'decimal' | 'fraction';

const EPSILON = 1e-9;
const MAX_DENOMINATOR = 1000000;

// Fractional input: converts user-typed text such as "1/2" or "-3/4" into numbers.

/**
 * Cleans free-form input text so it can only be a decimal number, a fraction (p/q),
 * a power (base^exp, e.g. "2^0.5") or an expression with pi. Both "." and "," are accepted
 * as decimal separators. Invalid characters are dropped while typing; whether the result
 * is a meaningful value is checked by parseFractionalInput.
 */
export function sanitizeFractionalInputText(text: string, complex = false): string {
  // "sqrt" (e.g. pasted text) and "√" both count as the root sign. While typing, the letters
  // are filtered out, so in practice the √ button is used.
  const normalized = text.replace(/π/g, 'pi').replace(/sqrt/gi, '√').replace(/[×·]/g, '*');

  // Complex mode: always use expression mode, since single-term simplification would strip "i".
  if (complex) return sanitizeExpressionText(normalized);

  // Expression mode: if the text has +/-, parentheses or "*", single-term simplification
  // would break it ("1-π" -> "1π"). Only invalid characters and inconsistent decimal
  // separators are cleaned here; the parser does the real validation.
  if (isExpressionSyntax(normalized.replace(/[^0-9.,/\-+*()piPI√^]/g, ''))) {
    return sanitizeExpressionText(normalized);
  }

  const stripped = normalized.replace(/[^0-9.,/\-^piPI√]/g, '');
  const sign = stripped.startsWith('-') ? '-' : '';
  const rest = stripped.slice(sign.length);

  const slashIdx = rest.indexOf('/');
  const numPart = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  const denPart = slashIdx === -1 ? '' : rest.slice(slashIdx + 1).replace(/\//g, '');

  const numClean = sanitizeTermPart(numPart);
  const denClean = sanitizeTermPart(denPart);

  return sign + numClean + (slashIdx === -1 ? '' : '/' + denClean);
}

/**
 * Whether the text is an expression rather than a single term ("+", "(", ")", "*", or a "-"
 * other than the leading one; a "-" right after "^" is an exponent sign, as in 2^-3).
 */
export function isExpressionSyntax(text: string): boolean {
  // Plain scientific notation ("1e-7", "1e+21") is not an expression; numberToInputText
  // can produce it for very small or large values.
  if (/^-?\d*\.?\d+e[-+]?\d+$/i.test(text)) return false;
  if (/[+()*×·]/.test(text)) return true;
  for (let i = 1; i < text.length; i++) {
    if (text[i] === '-' && text[i - 1] !== '^') return true;
  }
  return false;
}

/**
 * Cleaning for expression mode. Allowed: digits, ".", ",", "/", "+", "-", "*", "(", ")",
 * "pi", "√" and "^". At most one decimal separator per number, only digits after "√",
 * and consecutive operators collapse to the last one ("1+-2" -> "1-2").
 */
function sanitizeExpressionText(normalized: string): string {
  let out = '';
  let sepUsed = false;
  let inRoot = false;
  const isOp = (c: string) => c === '+' || c === '-' || c === '*' || c === '/';
  for (const ch of normalized) {
    if (/\d/.test(ch)) {
      out += ch;
    } else if (ch === '.' || ch === ',') {
      if (inRoot || sepUsed) continue;
      out += ch;
      sepUsed = true;
    } else if (/[piPI]/.test(ch)) {
      out += ch.toLowerCase();
      sepUsed = false;
      inRoot = false;
    } else if (ch === '√') {
      out += ch;
      sepUsed = false;
      inRoot = true;
    } else if (isOp(ch)) {
      if (out.length > 0 && isOp(out[out.length - 1])) out = out.slice(0, -1);
      out += ch;
      sepUsed = false;
      inRoot = false;
    } else if (ch === '(' || ch === ')' || ch === '*' || ch === '^') {
      out += ch;
      sepUsed = false;
      inRoot = false;
    }
  }
  return out;
}

/** Bir sayısal parçada en fazla tek bir ondalık ayırıcıya ("." veya ",") izin verir. */
function cleanOneSeparator(s: string): string {
  const idx = s.search(/[.,]/);
  if (idx === -1) return s;
  return s.slice(0, idx + 1) + s.slice(idx + 1).replace(/[.,]/g, '');
}

/**
 * Cleans one numerator/denominator part (e.g. "2^0.5", "3pi"). With "^", base and exponent
 * are cleaned separately (only the exponent may carry its own "-"). Otherwise a single
 * decimal separator is allowed.
 */
function sanitizeTermPart(s: string): string {
  // Kök içeren terimler ("2√3", "√2pi"): her sayı bloğunda en fazla bir
  // ondalık ayırıcı; "√"den sonra yalnızca tam sayı (basamaklar).
  if (s.includes('√') && !s.includes('^')) return cleanRoots(s);
  const caretIdx = s.indexOf('^');
  if (caretIdx === -1) {
    return cleanOneSeparator(s.replace(/[-^]/g, ''));
  }
  const basePart = s.slice(0, caretIdx).replace(/[^0-9.,]/g, '');
  const afterCaret = s.slice(caretIdx + 1).replace(/\^/g, ''); // yalnızca ilk "^" kabul edilir
  const expSign = afterCaret.startsWith('-') ? '-' : '';
  const expDigits = afterCaret.slice(expSign.length).replace(/-/g, '');
  return cleanOneSeparator(basePart) + '^' + expSign + cleanOneSeparator(expDigits);
}

function cleanRoots(s: string): string {
  let out = '';
  let sepUsed = false;
  let inRoot = false;
  for (const ch of s) {
    if (ch === '√') {
      out += ch;
      sepUsed = false;
      inRoot = true;
    } else if (/[piPI]/.test(ch)) {
      out += ch;
      sepUsed = false;
      inRoot = false;
    } else if (ch === '.' || ch === ',') {
      if (inRoot || sepUsed) continue;
      out += ch;
      sepUsed = true;
    } else if (/\d/.test(ch)) {
      out += ch;
    }
  }
  return out;
}

/** Virgülü ondalık ayırıcı olarak noktaya çevirir (parseFloat virgülü tanımaz). */
function normalizeDecimalSeparator(s: string): string {
  return s.replace(',', '.');
}

/**
 * Converts a single (possibly unsigned) numerator/denominator term to a number.
 * 1) Power "base^exp" (e.g. "2^0.5", "3^-2"), evaluated with Math.pow. A leading "-"
 *    negates the whole term; the exponent's own "-" only negates the exponent
 *    (-2^0.5 = -(2^0.5), 2^-0.5 = 1/2^0.5).
 * 2) Ending in "pi": the leading coefficient is multiplied by Math.PI ("2pi" -> 2π).
 * 3) Otherwise a plain decimal ("." or ",").
 * Returns NaN if the term is invalid.
 */
function parseFractionalTerm(term: string): number {
  const powMatch = term.match(/^(-)?(\d*[.,]?\d*)\^(-)?(\d*[.,]?\d*)$/);
  if (powMatch) {
    const overallSign = powMatch[1] ? -1 : 1;
    const base = parseFloat(normalizeDecimalSeparator(powMatch[2]));
    const expSign = powMatch[3] ? -1 : 1;
    const exp = parseFloat(normalizeDecimalSeparator(powMatch[4]));
    if (Number.isNaN(base) || Number.isNaN(exp)) return NaN;
    return overallSign * Math.pow(base, expSign * exp);
  }

  const piMatch = term.match(/^(-)?(\d*[.,]?\d*)pi$/i);
  if (piMatch) {
    const sign = piMatch[1] ? -1 : 1;
    const coefStr = piMatch[2];
    const coef = coefStr === '' ? 1 : parseFloat(normalizeDecimalSeparator(coefStr));
    return Number.isNaN(coef) ? NaN : sign * coef * Math.PI;
  }
  return parseFloat(normalizeDecimalSeparator(term));
}

/**
 * Converts text cleaned by sanitizeFractionalInputText to a number. "p/q" is evaluated as
 * a division (a missing or zero q returns 0, since the user is still typing). Both parts
 * may contain "pi". Invalid or empty input returns 0.
 */
/**
 * Numeric value of a cell in complex mode: the real part of the input. The imaginary part
 * is read from the raw text by the complex engine. This is a separate function so that
 * parseFractionalInput can be passed to .map() without the index leaking in as an argument.
 */
export function parseComplexRealPart(text: string): number {
  const z = parseComplexNumber(text);
  return z ? z.re + 0 : 0; // + 0: −0'ı 0 yapar
}

export function parseFractionalInput(text: string): number {
  // Expression (sum/difference/parentheses): the parser evaluates it; invalid or
  // unfinished input (e.g. "1+") gives 0 for now.
  if (isExpressionSyntax(text)) {
    const v = parseExpressionNumber(text);
    return Number.isFinite(v) ? v : 0;
  }
  // Input with a root ("√") goes through the symbolic parser (rational coefficient × π^p × √r).
  if (text.includes('√')) {
    const sym = parseSymbolicInput(text);
    return sym === null ? 0 : symToNumber(sym);
  }
  const slashIdx = text.indexOf('/');
  if (slashIdx === -1) {
    const n = parseFractionalTerm(text);
    return Number.isNaN(n) ? 0 : n;
  }
  const num = parseFractionalTerm(text.slice(0, slashIdx));
  const den = parseFractionalTerm(text.slice(slashIdx + 1));
  if (Number.isNaN(num) || Number.isNaN(den) || den === 0) return 0;
  return num / den;
}

/**
 * Converts a decimal to its simplest p/q fraction using continued fractions, or returns
 * null if the value is not actually equal to that fraction (within floating-point noise).
 *
 * Acceptance depends on the denominator: |x - p/q| <= min(ABS_TOL, REL_C / q²)
 *
 *  - ABS_TOL (2e-11): upper bound for floating-point noise. A real fraction stays well
 *    below it even after the round(v, 13) cleanup in matrixUtils.
 *  - REL_C / q²: guards against false positives for irrational numbers. A convergent's
 *    error is about 1/(q·q_next), so an irrational value only passes if q_next is huge
 *    (i.e. the value is effectively p/q). The threshold tightens as q grows, so allowing
 *    denominators up to 1e6 does not misread numbers like √2, π² or e as fractions.
 */
const ABS_TOL = 2e-11;
const REL_C = 1e-5;

function fractionTolerance(k: number, x: number): number {
  return Math.min(ABS_TOL, REL_C / (k * k)) * Math.max(1, x);
}

function toFraction(value: number): { numerator: number; denominator: number } | null {
  if (!Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  if (x > 1e12) return null;

  let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
  let b = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(b);
    const h = a * h1 + h2;
    const k = a * k1 + k2;
    if (k > MAX_DENOMINATOR) break;
    h2 = h1; h1 = h;
    k2 = k1; k1 = k;
    if (Math.abs(x - h1 / k1) <= fractionTolerance(k1, x)) {
      return { numerator: sign * h1, denominator: k1 };
    }
    const frac = b - a;
    if (frac < 1e-15) break;
    b = 1 / frac;
  }
  return null;
}

/**
 * Exported toFraction, so other modules (e.g. eigenvector simplification in matrixUtils)
 * can check whether a number is a clean p/q fraction. Returns null for irrational values.
 */
export function toRationalApproximation(value: number): { numerator: number; denominator: number } | null {
  return toFraction(value);
}

// Decimal places shown in decimal mode (Settings -> Decimal places). The setting lives in
// displaySettings.ts so symbolic.ts uses the same value; it is re-exported here so callers
// can import it from one place.
export { setDecimalPlaces, getDecimalPlaces } from './displaySettings';
import { getDecimalPlaces as _getDecimalPlaces } from './displaySettings';

function toDecimalString(value: number): string {
  const scale = Math.pow(10, _getDecimalPlaces());
  const rounded = Math.round(value * scale) / scale;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Verilen sayıyı, seçilen görünüm moduna göre okunabilir bir metne çevirir. */
export function formatNumber(value: number, mode: NumberDisplayMode): string {
  if (!Number.isFinite(value)) return String(value);

  // Symbolic forms (√n or rational multiples of π) are tried only in fraction mode and only
  // for non-rational values; tryRadical/tryPi return null for clean p/q fractions.
  // Decimal mode never uses radical or π forms; every number is written with the selected
  // number of decimals.
  if (mode === 'decimal') return toDecimalString(value);

  const radical = tryRadical(value);
  if (radical) return radical;
  const pi = tryPi(value);
  if (pi) return pi;

  // Kesirli gösterim: temiz bir p/q yoksa (irrasyonel) ondalığa düş.
  const fraction = toFraction(value);
  if (!fraction) return toDecimalString(value);
  const { numerator, denominator } = fraction;
  if (denominator === 1) return String(numerator);
  return `${numerator}/${denominator}`;
}

/** 2'den başlayarak `max`'a kadar tam kare çarpanı olmayan (square-free) sayılar. */
function squareFreeCandidates(max: number): number[] {
  const list: number[] = [];
  for (let n = 2; n <= max; n++) {
    let sf = true;
    for (let i = 2; i * i <= n; i++) {
      if (n % (i * i) === 0) {
        sf = false;
        break;
      }
    }
    if (sf) list.push(n);
  }
  return list;
}

const RADICANDS = squareFreeCandidates(200);
// Results are rounded to 13 digits, so a tight tolerance is enough; a loose one gave accidental matches.
const RADICAL_TOL = 1e-9;

/** Radical detection: returns a symbolic string if the value is a√b / c or a√b, otherwise null. */
export function tryRadical(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  // Integers and clean p/q fractions are not radicals (avoids accidental matches
  // such as 6√179/89 for 46/51).
  if (toFraction(value)) return null;

  const sign = value < 0 ? -1 : 1;
  const absVal = Math.abs(value);

  // a√b biçiminde dene (a = 1, 1/2, 1/3, ... veya 2, 3, ...)
  // hedef: value ≈ (p/q) * √r
  for (const r of RADICANDS) {
    const sqrtR = Math.sqrt(r);
    // value = k * √r  =>  k = value / √r
    const k = absVal / sqrtR;
    // k tam sayı mı?
    if (Math.abs(k - Math.round(k)) < RADICAL_TOL) {
      const kInt = Math.round(k);
      const signStr = sign < 0 ? '-' : '';
      if (kInt === 1) return `${signStr}√${r}`;
      return `${signStr}${kInt}√${r}`;
    }
    // k basit kesir mi? (p/q)
    const frac = toFraction(k);
    if (frac && frac.denominator <= 100) {
      const check = (frac.numerator / frac.denominator) * sqrtR;
      if (Math.abs(check - absVal) < RADICAL_TOL) {
        const signStr = sign < 0 ? '-' : '';
        const num = frac.numerator;
        const den = frac.denominator;
        if (num === 1) return `${signStr}√${r}/${den}`;
        return `${signStr}${num}√${r}/${den}`;
      }
    }
  }
  return null;
}

function gcdInt(a: number, b: number): number {
  let x = Math.abs(a), y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

/**
 * π detection: checks whether a value is a rational multiple of π (k·π with a small
 * denominator, e.g. π/2, 3π/4). The tolerance is tight (1e-9 on the ratio), the denominator
 * is limited to 24, and values that are already clean p/q fractions (17.75, 35.5) are never
 * treated as π multiples.
 */
export function tryPi(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) < EPSILON) return null; // 0, π'siz zaten sade gösterilir
  if (toFraction(value)) return null; // tam sayı / temiz kesir: π değil

  const ratio = value / Math.PI;
  const TOL = 1e-9;
  const MAX_DEN = 24;

  for (let den = 1; den <= MAX_DEN; den++) {
    const num = Math.round(ratio * den);
    if (num === 0) continue;
    if (Math.abs(ratio - num / den) < TOL) {
      const g = gcdInt(num, den);
      const simpNum = num / g;
      const simpDen = den / g;
      const sign = simpNum < 0 ? '-' : '';
      const absNum = Math.abs(simpNum);
      const coef = absNum === 1 ? '' : String(absNum);
      const piPart = `${coef}π`;
      return simpDen === 1 ? `${sign}${piPart}` : `${sign}${piPart}/${simpDen}`;
    }
  }
  return null;
}

/**
 * Returns the radical form if one exists, otherwise the normal format. formatNumber now
 * does this detection itself; this is kept for existing call sites and delegates to it.
 */
export function formatNumberWithRadical(value: number, mode: NumberDisplayMode): string {
  return formatNumber(value, mode);
}

/**
 * Converts a number to text that can be written back into a matrix cell (TextInput),
 * the inverse of parseFractionalInput, so "1/3" or "pi/2" does not turn into a long
 * decimal after a resize or reload.
 * Order: integer -> short decimal ("0.5", "2.75") -> p/q fraction ("1/3") ->
 * rational multiple of π ("pi/2", "3pi/4") -> at most 12 significant digits.
 */
export function numberToInputText(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const clean = (n: number) => (Object.is(n, -0) ? 0 : n);

  const frac = toFraction(value);
  if (frac && frac.denominator === 1) return String(clean(frac.numerator));

  // Kısa, sonlanan ondalık (en fazla 6 ondalık basamak) olduğu gibi kalsın.
  const plain = String(clean(value));
  if (!/e/i.test(plain)) {
    const decimals = (plain.split('.')[1] ?? '').length;
    if (decimals <= 6) return plain;
  }

  if (frac && frac.denominator <= 10000) return `${frac.numerator}/${frac.denominator}`;

  const ratio = value / Math.PI;
  for (let den = 1; den <= 24; den++) {
    const num = Math.round(ratio * den);
    if (num === 0) continue;
    if (Math.abs(ratio - num / den) < 1e-9) {
      const g = gcdInt(num, den);
      const n = num / g;
      const d = den / g;
      const coef = Math.abs(n) === 1 ? '' : String(Math.abs(n));
      return `${n < 0 ? '-' : ''}${coef}pi${d === 1 ? '' : '/' + d}`;
    }
  }

  // k·√r and k·π·√r ("3√2/4", "pi√2", "-2pi√3/5") are written back symbolically, not as raw decimals.
  const symbolic = radicalInputText(value);
  if (symbolic) return symbolic;

  return String(clean(parseFloat(value.toPrecision(12))));
}

/** value = (p/q)·√r  veya  (p/q)·π·√r  (r ≥ 2 kare-çarpansız) ise giriş metni, değilse null. */
function radicalInputText(value: number): string | null {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const build = (k: { numerator: number; denominator: number }, pi: boolean, r: number) => {
    const coef = k.numerator === 1 && (pi || r > 1) ? '' : String(k.numerator);
    const body = `${coef}${pi ? 'pi' : ''}√${r}`;
    return `${sign}${body}${k.denominator === 1 ? '' : '/' + k.denominator}`;
  };
  for (const r of RADICANDS) {
    const sqrtR = Math.sqrt(r);
    const k = toFraction(abs / sqrtR);
    if (k && k.denominator <= 1000 && Math.abs(abs - (k.numerator / k.denominator) * sqrtR) < RADICAL_TOL) {
      return build(k, false, r);
    }
  }
  for (const r of RADICANDS) {
    if (r > 30) break;
    const base = Math.PI * Math.sqrt(r);
    const k = toFraction(abs / base);
    if (k && k.denominator <= 100 && Math.abs(abs - (k.numerator / k.denominator) * base) < RADICAL_TOL) {
      return build(k, true, r);
    }
  }
  return null;
}
