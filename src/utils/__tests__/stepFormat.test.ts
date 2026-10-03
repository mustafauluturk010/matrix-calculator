import { classifyStep, parseDescription, changedCells } from '../stepFormat';
import { SolutionStep } from '@/types';

const step = (title: string, description: string): SolutionStep => ({ title, description });

describe('classifyStep', () => {
  it('son adım sonuçtur, ilk adım hazırlıktır', () => {
    expect(classifyStep(step('a', 'x'), 0, 3)).toBe('setup');
    expect(classifyStep(step('a', 'x'), 2, 3)).toBe('result');
  });
  it('satır işlemlerini tanır', () => {
    expect(classifyStep(step('t', 'R1 ↔ R3\nAçıklama.'), 1, 5)).toBe('swap');
    expect(classifyStep(step('t', 'Bölünür.\nR2 → R2 ÷ 4'), 1, 5)).toBe('normalize');
    expect(classifyStep(step('t', 'Çıkarılır.\nR3 → R3 − (2) · R1'), 1, 5)).toBe('eliminate');
    expect(classifyStep(step('λ1 = 2: Doğrulama (A·v = λ·v)', 'x'), 1, 5)).toBe('verify');
  });
});

describe('parseDescription', () => {
  it('formül satırlarını metinden ayırır', () => {
    const b = parseDescription('R1 satırı bölünür.\nR1 → R1 ÷ 2\n\nSon not.');
    expect(b).toEqual([
      { type: 'text', text: 'R1 satırı bölünür.' },
      { type: 'formula', text: 'R1 → R1 ÷ 2' },
      { type: 'text', text: 'Son not.' },
    ]);
  });
  it('cümle gibi biten satırları formül saymaz', () => {
    expect(parseDescription('Pivot adayları: 1, 2 → en büyüğü seçildi.')[0].type).toBe('text');
  });
});

describe('changedCells', () => {
  it('yalnızca değişen hücreleri işaretler', () => {
    const r = changedCells([[1, 2], [3, 4]], [[1, 2], [0, 4]]);
    expect(r).toEqual([[false, false], [true, false]]);
  });
  it('boyut farklıysa veya her şey değiştiyse null döner', () => {
    expect(changedCells([[1]], [[1, 2]])).toBeNull();
    expect(changedCells([[1, 2]], [[3, 4]])).toBeNull();
  });
  it('etiketler varsa etiketleri karşılaştırır', () => {
    const r = changedCells([[1, 1]], [[1, 1]], [['√2', 'a']], [['√2', 'b']]);
    expect(r).toEqual([[false, true]]);
  });
});
