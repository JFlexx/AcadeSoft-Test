// Minimal client-side CSV export, tuned for Spanish Excel:
// - ';' delimiter (es-ES Excel default)
// - UTF-8 BOM so accents render correctly
// - CRLF line endings
//
// Cells are passed already formatted by the caller (numbers as "12,34",
// dates as "31/12/2026", etc.).

function escapeCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const content = [headers, ...rows]
    .map((cols) => cols.map((c) => escapeCell(String(c))).join(';'))
    .join('\r\n');

  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + content], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Format a numeric/string amount as es-ES decimal (comma) for Excel. */
export function csvAmount(value: string | number): string {
  return Number(value).toFixed(2).replace('.', ',');
}
