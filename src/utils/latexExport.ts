import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { OperationResult } from '@/types';
import { matrixToLatex } from './matrixUtils';
import { NumberDisplayMode } from './numberFormat';

// The text can contain Turkish characters and symbols like λ, √, ², so the document is meant to
// be compiled with XeLaTeX or LuaLaTeX (via fontspec); classic pdfLaTeX is not recommended.

// XeLaTeX'in varsayılan fontu (Latin Modern) Türkçe harfleri, √, →, Δ gibi sembolleri içerir ama
// Yunan harfleri (λ π ...), üst/alt indis karakterleri (⁻¹ ₁ ᵀ ...) ve bazı matematik işaretleri
// (ℝ ↔ ≤ ≠ ✓ ...) için glif YOKTUR: derleme hatasız biter ama bu karakterler PDF'te sessizce
// kaybolur. Bu yüzden bu karakterler gerçek LaTeX matematik komutlarına çevrilir; böylece
// çıktı kullanıcının cihazındaki fonta bağlı kalmadan her yerde doğru görünür.

const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁻': '-', 'ᵀ': '\\mathsf{T}', 'ᴴ': '\\mathsf{H}',
};
const SUBSCRIPTS: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k',
};
const MATH_SYMBOLS: Record<string, string> = {
  'α': '\\alpha', 'ε': '\\varepsilon', 'θ': '\\theta', 'λ': '\\lambda', 'μ': '\\mu', 'π': '\\pi', 'ρ': '\\rho',
  'ℝ': '\\mathbb{R}', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow', '∈': '\\in',
  '≈': '\\approx', '≠': '\\neq', '≡': '\\equiv', '≤': '\\leq', '≥': '\\geq', '⊕': '\\oplus',
  '✓': '\\checkmark', '∛': '{}^{3}\\!\\surd',
};

/**
 * Metindeki font-bağımlı Unicode karakterleri LaTeX matematiğine çevirir.
 * mathMode=false: metin içindir; ardışık parçalar tek bir $...$ içinde birleştirilir (λ₁ -> $\lambda_{1}$).
 * mathMode=true: zaten matematik modunda olan metindir (matris içi); $ eklenmez.
 */
export function unicodeToLatex(input: string, mathMode = false): string {
  const chars = Array.from(input);
  let out = '';
  let mathBuf = '';
  const flush = () => {
    if (mathBuf) {
      out += mathMode ? mathBuf : `$${mathBuf}$`;
      mathBuf = '';
    }
  };
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (SUPERSCRIPTS[ch] !== undefined || SUBSCRIPTS[ch] !== undefined) {
      const table = SUPERSCRIPTS[ch] !== undefined ? SUPERSCRIPTS : SUBSCRIPTS;
      let body = '';
      while (i < chars.length && table[chars[i]] !== undefined) {
        body += table[chars[i]];
        i++;
      }
      mathBuf += `${table === SUPERSCRIPTS ? '^' : '_'}{${body}}`;
      continue;
    }
    if (MATH_SYMBOLS[ch] !== undefined) {
      mathBuf += MATH_SYMBOLS[ch] + (mathMode ? ' ' : '');
      i++;
      continue;
    }
    flush();
    out += ch;
    i++;
  }
  flush();
  return out;
}

function escapeLatex(text: string): string {
  const escaped = text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([{}#%&_$])/g, '\\$1')
    .replace(/\^/g, '\\^{}')
    .replace(/~/g, '\\~{}')
    .replace(/\n/g, ' \\\\\n');
  // Önce özel karakterler kaçırılır, SONRA Unicode -> LaTeX çevrilir (eklenen \ { } $ tekrar kaçırılmasın).
  return unicodeToLatex(escaped);
}

export function buildStepsLatexDocument(
  result: OperationResult,
  operationLabel: string,
  mode: NumberDisplayMode = 'decimal'
): string {
  const lines: string[] = [];
  lines.push('% XeLaTeX veya LuaLaTeX ile derleyin (Türkçe karakterler ve matematik sembolleri için)');
  lines.push('\\documentclass[11pt]{article}');
  lines.push('\\usepackage{fontspec}');
  lines.push('\\usepackage{amsmath}');
  lines.push('\\usepackage{amssymb}');
  lines.push('\\usepackage[margin=2.2cm]{geometry}');
  lines.push('\\usepackage{enumitem}');
  lines.push('\\title{' + escapeLatex(operationLabel) + '}');
  lines.push('\\date{}');
  lines.push('\\begin{document}');
  lines.push('\\maketitle');

  if (!result.success) {
    lines.push('\\textbf{Hata:} ' + escapeLatex(result.errorMessage ?? ''));
    lines.push('\\end{document}');
    return lines.join('\n');
  }

  lines.push('\\section*{Adım Adım Çözüm}');
  if (result.steps.length === 0) {
    lines.push('Bu işlem için adım adım çözüm mevcut değil.');
  } else {
    lines.push('\\begin{enumerate}[leftmargin=*]');
    result.steps.forEach((step) => {
      lines.push(`\\item \\textbf{${escapeLatex(step.title)}}\\\\`);
      lines.push(escapeLatex(step.description));
      if (step.matrixSnapshot) {
        lines.push('\\[');
        lines.push(unicodeToLatex(matrixToLatex(step.matrixSnapshot, mode, step.matrixSnapshotLabels), true));
        lines.push('\\]');
      }
    });
    lines.push('\\end{enumerate}');
  }

  lines.push('\\end{document}');
  return lines.join('\n');
}

export type SaveLatexResult = 'saved' | 'cancelled' | 'shared';

/** downloadPdf() ile aynı davranış: Android'de SAF ile klasör seçilir, diğer platformlarda
 * sistem paylaşım sayfası açılır. */
export async function saveStepsLatex(document: string, fileNamePrefix: string): Promise<SaveLatexResult> {
  const fileName = `${fileNamePrefix}-${Date.now()}.tex`;

  if (Platform.OS === 'android') {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) {
      return 'cancelled';
    }
    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      'text/x-tex'
    );
    await FileSystem.writeAsStringAsync(destUri, document, { encoding: FileSystem.EncodingType.UTF8 });
    return 'saved';
  }

  const dest = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(dest, document, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, { UTI: 'public.plain-text', mimeType: 'text/x-tex' });
  }
  return 'shared';
}
