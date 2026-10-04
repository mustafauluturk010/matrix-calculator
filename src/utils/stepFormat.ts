import type { MatrixData, SolutionStep } from '@/types';

export type StepKind = 'setup' | 'swap' | 'normalize' | 'eliminate' | 'compute' | 'verify' | 'result';

export interface DescBlock {
  type: 'text' | 'formula';
  text: string;
}

const SWAP_RE = /R\d+\s*(↔|<->)\s*R\d+/;
const NORMALIZE_RE = /R\d+\s*(→|=)\s*R\d+\s*[÷/]/;
const ELIMINATE_RE = /R\d+\s*(→|=)\s*R\d+\s*[−-]/;
const VERIFY_RE = /Doğrulama|Verification/i;

/** Adımın türünü başlık/açıklamadaki satır-işlemi gösteriminden ve sırasından çıkarır. */
export function classifyStep(step: SolutionStep, index: number, total: number): StepKind {
  if (total > 1 && index === total - 1) return 'result';
  const text = step.description;
  if (SWAP_RE.test(text)) return 'swap';
  if (NORMALIZE_RE.test(text)) return 'normalize';
  if (ELIMINATE_RE.test(text)) return 'eliminate';
  if (VERIFY_RE.test(step.title)) return 'verify';
  if (index === 0 && total > 1) return 'setup';
  return 'compute';
}

function isFormulaLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // Cümle gibi biten satırlar (nokta, iki nokta, ünlem...) düz metindir.
  if (/[.:;!?。]$/.test(t)) return false;
  return /(=|→|↔|<->|≈)/.test(t);
}

/** Formül satırları tek başına kutu olur, ardışık düz metin satırları tek paragraf;
 * boş satır paragraf ayırıcıdır. */
export function parseDescription(desc: string): DescBlock[] {
  const blocks: DescBlock[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) {
      blocks.push({ type: 'text', text: buf.join('\n') });
      buf = [];
    }
  };
  for (const raw of desc.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
    } else if (isFormulaLine(line)) {
      flush();
      blocks.push({ type: 'formula', text: line.trim() });
    } else {
      buf.push(line);
    }
  }
  flush();
  return blocks;
}

function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Boyutlar farklıysa ya da her hücre değiştiyse (vurgu anlamsız olur) null döner. */
export function changedCells(
  prev: MatrixData,
  cur: MatrixData,
  prevLabels?: string[][],
  curLabels?: string[][]
): boolean[][] | null {
  if (!prev.length || prev.length !== cur.length || prev[0].length !== cur[0].length) return null;
  let changed = 0;
  let total = 0;
  const out = cur.map((row, i) =>
    row.map((v, j) => {
      total++;
      const pl = prevLabels?.[i]?.[j];
      const cl = curLabels?.[i]?.[j];
      const diff = pl !== undefined && cl !== undefined ? pl !== cl : !sameValue(prev[i][j], v);
      if (diff) changed++;
      return diff;
    })
  );
  if (total > 1 && changed === total) return null;
  return out;
}
