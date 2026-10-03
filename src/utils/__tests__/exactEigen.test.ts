import { runOperation } from '../runOperation';
import { parseFractionalInput } from '../numberFormat';
import { cubicClosedForms, parseQ, polyText } from '../algebraicRoots';

const go = (T: string[][], mode: 'fraction' | 'decimal' = 'fraction', complex = false) => {
  const M = T.map((r) => r.map((t) => (complex ? 0 : parseFractionalInput(t))));
  return runOperation('eigen', M, M, 0, 2, [], 'gauss', 'tr', mode, { A: T, complex });
};

/** Etiket metnini JS ifadesine çevirip sayısal değerini bulur (yalnızca gerçel biçimler). */
const evalLabel = (s: string): number => {
  const js = s
    .replace(/(\d)π/g, '$1*π')
    .replace(/arccos/g, 'ACOS')
    .replace(/∛\(/g, 'Math.cbrt(')
    .replace(/(\d)√/g, '$1*√')
    .replace(/√\(/g, 'Math.sqrt(')
    .replace(/√(\d+)/g, 'Math.sqrt($1)')
    .replace(/·/g, '*')
    .replace(/π/g, 'Math.PI')
    .replace(/cos\(/g, 'Math.cos(')
    .replace(/ACOS/g, 'Math.acos');
  return Function(`return (${js})`)() as number;
};

const noDecimal = (r: any) => {
  const e = r.eigenResult;
  const all = [...e.radicalExpressions, ...e.eigenvectorRadicals.flat(), ...r.steps.map((s: any) => s.title + s.description)];
  return !all.some((x: string) => /\d\.\d/.test(String(x)));
};

describe('KESİRLİ mod: sade ifadesi olmayan özdeğerler de kesin yazılır', () => {
  it('indirgenemez kübik, tek gerçel kök → Cardano; formül gerçek değere eşit', () => {
    const r = go([['0', '1', '0'], ['0', '0', '1'], ['1', '1', '0']]); // λ³ − λ − 1
    const lab = r.eigenResult!.radicalExpressions as string[];
    expect(lab[0]).toBe('∛(1/2 + √69/18) + ∛(1/2 - √69/18)');
    expect(evalLabel(lab[0])).toBeCloseTo(1.3247179572, 9);
    expect(noDecimal(r)).toBe(true);
    expect(r.eigenResult!.eigenvectorRadicals![0]).toEqual(['λ₁² - 1', '1', 'λ₁']);
  });

  it('üç gerçel kök (casus irreducibilis) → trigonometrik form; üç formül de doğru', () => {
    const r = go([['1', '2', '3'], ['4', '5', '6'], ['7', '8', '10']]);
    const lab = r.eigenResult!.radicalExpressions as string[];
    const vals = r.eigenResult!.eigenvalues;
    lab.forEach((l, i) => expect(evalLabel(l)).toBeCloseTo(vals[i], 9));
    expect(noDecimal(r)).toBe(true);
  });

  it('özvektör kofaktör polinomu A·v = λ·v sağlar (sayısal kök üzerinde)', () => {
    const A = [[1, 2, 3], [4, 5, 6], [7, 8, 10]];
    const r = go([['1', '2', '3'], ['4', '5', '6'], ['7', '8', '10']]);
    const lam = r.eigenResult!.eigenvalues[0];
    const v = r.eigenResult!.eigenvectors[0];
    A.forEach((row, i) => expect(row.reduce((s, x, j) => s + x * v[j], 0)).toBeCloseTo(lam * v[i], 6));
  });

  it('4x4 indirgenemez dördüncü derece → "k. kök" gösterimi, ondalık yok', () => {
    const r = go([['0', '1', '0', '0'], ['0', '0', '1', '0'], ['0', '0', '0', '1'], ['1', '1', '0', '0']]);
    const lab = r.eigenResult!.radicalExpressions as string[];
    expect(lab[0]).toBe('λ⁴ - λ - 1 = 0 denkleminin 1. kökü');
    expect(lab).toHaveLength(4);
    expect(noDecimal(r)).toBe(true);
  });

  it('karmaşık girişli 2x2, sade karekökü olmayan diskriminant → (−b ± √Δ)/2', () => {
    const r = go([['1+i', '2'], ['3-i', '4']], 'fraction', true);
    expect(r.eigenResult!.radicalExpressions).toEqual(['(5 + i + √(32 - 14i))/2', '(5 + i - √(32 - 14i))/2']);
    expect(noDecimal(r)).toBe(true);
  });

  it('ONDALIK modda bu durumlar sayısal kalır (sembol yok)', () => {
    const r = go([['0', '1', '0'], ['0', '0', '1'], ['1', '1', '0']], 'decimal');
    const lab = r.eigenResult!.radicalExpressions as (string | null)[] | undefined;
    expect(lab === undefined || lab.every((x) => x === null || !/[√∛]/.test(x))).toBe(true);
  });
});

describe('algebraicRoots yardımcıları', () => {
  it('parseQ', () => {
    expect(parseQ('-3/4')).toEqual({ n: -3n, d: 4n });
    expect(parseQ('1 + i')).toBeNull();
  });
  it('kübik kapalı biçim: λ³ = 2 gerçel kökü ∛2', () => {
    const f = cubicClosedForms({ n: 1n, d: 1n }, { n: 0n, d: 1n }, { n: 0n, d: 1n }, { n: -2n, d: 1n })!;
    expect(f[0].value.re).toBeCloseTo(Math.cbrt(2), 12);
  });
  it('polyText sade yazar', () => {
    const F = { isZero: (x: number) => x === 0, fmt: (x: number) => String(x) } as any;
    expect(polyText(F, [-1, -1, 0, 1], 'λ')).toBe('λ³ - λ - 1');
  });
});
