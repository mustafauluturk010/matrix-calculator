import { Platform } from 'react-native';
import { parseDescription } from './stepFormat';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
// expo-file-system moved to a new API in SDK 54; the old APIs used here (StorageAccessFramework,
// readAsStringAsync, writeAsStringAsync, EncodingType) live under '/legacy', as in latexExport.ts.
import * as FileSystem from 'expo-file-system/legacy';
import { OperationResult, MatrixData } from '@/types';
import { formatNumber, formatNumberWithRadical, NumberDisplayMode } from './numberFormat';
import { mathLabelToHtml } from './mathLabel';

function matrixToText(m: MatrixData, mode: NumberDisplayMode, labels?: string[][]): string {
  return m.map((row, i) => row.map((v, j) => labels?.[i]?.[j] ?? formatNumber(v, mode)).join('\t')).join('\n');
}

export function buildPlainTextSummary(result: OperationResult, operationLabel: string, mode: NumberDisplayMode = 'decimal'): string {
  const fmt = (v: number) => formatNumber(v, mode);
  const fmtR = (v: number) => formatNumberWithRadical(v, mode);
  const lines: string[] = [operationLabel, ''];
  if (!result.success) {
    lines.push(`${result.errorMessage}`);
    return lines.join('\n');
  }
  if (result.matrixResult) lines.push(matrixToText(result.matrixResult, mode, result.matrixResultLabels));
  if (result.scalarResult !== undefined) lines.push(result.scalarResultLabel ?? fmt(result.scalarResult));
  if (result.vectorResult) lines.push(`x = [${result.vectorResult.map((v, i) => result.vectorResultLabels?.[i] ?? fmt(v)).join(', ')}]`);
  if (result.eigenResult) {
    const eigenResult = result.eigenResult;
    lines.push(`λ = [${eigenResult.eigenvalues.map((v, i) => eigenResult.radicalExpressions?.[i] ?? fmtR(v)).join(', ')}]`);
    eigenResult.eigenvectors.forEach((v, i) =>
      lines.push(`v${i + 1} = [${(eigenResult.eigenvectorRadicals?.[i] ?? v.map(fmtR)).join(', ')}]`)
    );
  }
  if (result.luResult) {
    if (result.luResult.P) lines.push('P:', matrixToText(result.luResult.P, mode));
    lines.push('L:', matrixToText(result.luResult.L, mode, result.luResultLabels?.L), 'U:', matrixToText(result.luResult.U, mode, result.luResultLabels?.U));
  }
  return lines.join('\n');
}

export function buildHtmlReport(result: OperationResult, operationLabel: string, mode: NumberDisplayMode = 'decimal'): string {
  const fmt = (v: number) => formatNumber(v, mode);
  const fmtR = (v: number) => formatNumberWithRadical(v, mode);
  const h = mathLabelToHtml;
  const matrixHtml = (m: MatrixData, labels?: string[][]) =>
    `<table style="border-collapse:collapse;margin:8px 0;">${m
      .map(
        (row, i) =>
          `<tr>${row
            .map((v, j) => `<td style="border:1px solid #ccc;padding:6px 12px;text-align:center;vertical-align:middle;">${h(labels?.[i]?.[j] ?? fmt(v))}</td>`)
            .join('')}</tr>`
      )
      .join('')}</table>`;

  let body = `<h2>${operationLabel}</h2>`;
  if (!result.success) {
    body += `<p style="color:#c0392b;">${result.errorMessage}</p>`;
  } else {
    if (result.matrixResult) body += matrixHtml(result.matrixResult, result.matrixResultLabels);
    if (result.scalarResult !== undefined) body += `<p><b>${h(result.scalarResultLabel ?? fmt(result.scalarResult))}</b></p>`;
    if (result.vectorResult) body += `<p><b>x = [${result.vectorResult.map((v, i) => h(result.vectorResultLabels?.[i] ?? fmt(v))).join(', ')}]</b></p>`;
    if (result.eigenResult) {
      const eigenResult = result.eigenResult;
      body += `<p><b>λ = [${eigenResult.eigenvalues.map((v, i) => h(eigenResult.radicalExpressions?.[i] ?? fmtR(v))).join(', ')}]</b></p>`;
      eigenResult.eigenvectors.forEach(
        (v, i) => (body += `<p>v${i + 1} = [${(eigenResult.eigenvectorRadicals?.[i] ?? v.map(fmtR)).map(h).join(', ')}]</p>`)
      );
    }
    if (result.luResult) {
      body += `${result.luResult.P ? `<h3>P</h3>${matrixHtml(result.luResult.P)}` : ''}<h3>L</h3>${matrixHtml(result.luResult.L, result.luResultLabels?.L)}<h3>U</h3>${matrixHtml(result.luResult.U, result.luResultLabels?.U)}`;
    }
    if (result.steps?.length) {
      // Açıklamayı paragraf + formül kutularına ayır (satır sonları HTML'de kaybolmasın).
      const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const descHtml = (d: string) =>
        parseDescription(d)
          .map((b) =>
            b.type === 'formula'
              ? `<div style="font-family:Menlo,Consolas,'Courier New',monospace;background:#f3f4fb;border-left:3px solid #4F5DFF;padding:6px 10px;margin:6px 0;">${esc(b.text)}</div>`
              : `<p style="margin:4px 0;">${esc(b.text).replace(/\n/g, '<br/>')}</p>`
          )
          .join('');
      body += '<h3>Steps</h3><ol>';
      result.steps.forEach((s) => {
        body += `<li style="margin-bottom:14px;"><b>${esc(s.title)}</b>${descHtml(s.description)}${s.matrixSnapshot ? matrixHtml(s.matrixSnapshot, s.matrixSnapshotLabels) : ''}</li>`;
      });
      body += '</ol>';
    }
  }
  // Declare UTF-8 explicitly: without it the HTML-to-PDF renderer can misread multibyte
  // characters (√, λ, ², Turkish letters). The font stack falls back to generic system fonts
  // that cover math symbols on most platforms.
  return `<!DOCTYPE html><html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="font-family:-apple-system,Roboto,'Segoe UI',Helvetica,Arial,'Noto Sans',sans-serif;padding:20px;">${body}</body></html>`;
}

/** Hem iOS hem Android'de expo-print'in yerleşik önizleme diyaloğunu kullanır (kaydetmez/paylaşmaz). */
export async function openPdf(html: string): Promise<void> {
  await Print.printAsync({ html });
}

export async function sharePdf(html: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
}

export type DownloadPdfResult = 'saved' | 'cancelled' | 'shared';

/**
 * Saves the PDF directly to the device without opening the share sheet. On Android the user
 * picks a folder via the Storage Access Framework. iOS has no public Downloads folder, so it
 * falls back to the share sheet, which includes "Save to Files".
 */
export async function downloadPdf(html: string, fileNamePrefix: string): Promise<DownloadPdfResult> {
  const { uri } = await Print.printToFileAsync({ html });
  const fileName = `${fileNamePrefix}-${Date.now()}.pdf`;

  if (Platform.OS === 'android') {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) {
      return 'cancelled';
    }
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      'application/pdf'
    );
    await FileSystem.writeAsStringAsync(destUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return 'saved';
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
  return 'shared';
}
