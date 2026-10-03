// Converts label text to textbook-style display. Result labels are plain text ("3π/4", "√2/2",
// "(9 + √61) / 2", "-π√2/4 + 1/2"); this module parses them into a small tree (MathNode[]) that
// MathText.tsx and mathLabelToHtml (PDF) render with real stacked fractions and radicals with
// an overline.
// Display only: calculation, copying (plain text) and LaTeX output are unaffected.
//
// Rules (math precedence):
//   1. Top-level " + " / " - " (with spaces) separate terms; anything inside parentheses is not split.
//   2. A term with exactly one "/" outside parentheses becomes a fraction; outer parentheses
//      around numerator/denominator are dropped: "(9 + √61) / 2".
//   3. "√n" and "√(...)" become radicals.
//   4. Unrecognized forms (e.g. a term with two "/") stay plain text.

export type MathNode =
  | { type: 'text'; value: string }
  | { type: 'sqrt'; radicand: MathNode[] }
  | { type: 'frac'; num: MathNode[]; den: MathNode[] };

/** Etiket düz bir metinden ibaret mi (yığılmış kesir / kök içermiyor mu)? */
export function isPlainLabel(label: string): boolean {
  return !label.includes('/') && !label.includes('√');
}

/** s[start] '(' ise, eşleşen ')' indeksini döndürür; yoksa -1. */
function matchingParen(s: string, start: number): number {
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

/** Bütün ifadeyi tek bir çift parantez sarmalıyorsa dışını atar: "(a + b)" → "a + b". */
function stripOuterParens(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t[0] === '(' && matchingParen(t, 0) === t.length - 1) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/** Parantez derinliği 0 iken " + " / " - " ile toplam terimlerine böler. */
function splitTerms(s: string): { terms: string[]; ops: string[] } {
  const terms: string[] = [];
  const ops: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && (ch === '+' || ch === '-') && i > 0 && s[i - 1] === ' ' && s[i + 1] === ' ') {
      terms.push(s.slice(start, i - 1));
      ops.push(ch);
      start = i + 2;
      i++;
    }
  }
  terms.push(s.slice(start));
  return { terms, ops };
}

/** Parantez derinliği 0 olan "/" indekslerini döndürür. */
function topLevelSlashes(s: string): number[] {
  const idx: number[] = [];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '/' && depth === 0) idx.push(i);
  }
  return idx;
}

/** "/" içermeyen bir parçayı metin + kök düğümlerine çevirir. */
function parseInline(s: string): MathNode[] {
  const out: MathNode[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ type: 'text', value: buf });
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '√') {
      // √(...) veya √123
      if (s[i + 1] === '(') {
        const close = matchingParen(s, i + 1);
        if (close !== -1) {
          flush();
          out.push({ type: 'sqrt', radicand: parseMathLabel(s.slice(i + 2, close)) });
          i = close + 1;
          continue;
        }
      }
      const m = /^\d+(?:[.,]\d+)?/.exec(s.slice(i + 1));
      if (m) {
        flush();
        out.push({ type: 'sqrt', radicand: [{ type: 'text', value: m[0] }] });
        i += 1 + m[0].length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

function parseTerm(term: string): MathNode[] {
  const t = term.trim();
  const slashes = topLevelSlashes(t);
  if (slashes.length !== 1) return parseInline(t); // kesir yok ya da belirsiz → düz

  let numStr = t.slice(0, slashes[0]).trim();
  const denStr = t.slice(slashes[0] + 1).trim();
  if (numStr === '' || denStr === '') return parseInline(t);

  // Baştaki işaret kesrin DIŞINDA kalır: "-3π/4" → "-" ve 3π/4
  let sign = '';
  if (numStr.startsWith('-') && !numStr.startsWith('- ')) {
    sign = '-';
    numStr = numStr.slice(1).trim();
    if (numStr === '') return parseInline(t);
  }

  const out: MathNode[] = [];
  if (sign) out.push({ type: 'text', value: sign });
  out.push({
    type: 'frac',
    num: parseMathLabel(stripOuterParens(numStr)),
    den: parseMathLabel(stripOuterParens(denStr)),
  });
  return out;
}

/**
 * Etiketi ağaca çevirir. Düz sayılar tek bir 'text' düğümü olur.
 * Toplam terimleri arasındaki işaretler " + " / " − " metni olarak korunur.
 */
export function parseMathLabel(label: string): MathNode[] {
  const s = label.trim();
  if (s === '') return [];
  if (isPlainLabel(s)) return [{ type: 'text', value: s }];

  const { terms, ops } = splitTerms(s);
  const out: MathNode[] = [];
  terms.forEach((term, i) => {
    if (i > 0) out.push({ type: 'text', value: ` ${ops[i - 1] === '-' ? '−' : '+'} ` });
    out.push(...parseTerm(term));
  });
  return out;
}

// ------------------------------------------------------------
// PDF / HTML çıktısı
// ------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function nodesToHtml(nodes: MathNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') return escapeHtml(n.value);
      if (n.type === 'sqrt') {
        return `<span style="white-space:nowrap;">√<span style="border-top:1px solid #000;padding:1px 1px 0 1px;">${nodesToHtml(n.radicand)}</span></span>`;
      }
      return (
        `<span style="display:inline-block;vertical-align:middle;text-align:center;margin:0 2px;">` +
        `<span style="display:block;padding:0 3px 1px 3px;border-bottom:1px solid #000;">${nodesToHtml(n.num)}</span>` +
        `<span style="display:block;padding:1px 3px 0 3px;">${nodesToHtml(n.den)}</span>` +
        `</span>`
      );
    })
    .join('');
}

/** Etiketi PDF (HTML) için yığılmış kesirli biçime çevirir. Düz etiketler yalnızca kaçışlanır. */
export function mathLabelToHtml(label: string): string {
  if (isPlainLabel(label)) return escapeHtml(label);
  return nodesToHtml(parseMathLabel(label));
}
