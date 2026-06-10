// Minimal CSV parser for imports. Handles quoted fields, escaped quotes,
// CRLF/LF, a leading UTF-8 BOM, and auto-detects ';' vs ',' as delimiter
// (Spanish Excel uses ';'). Returns rows of raw string cells.

const BOM = String.fromCharCode(0xfeff);

export function parseCsv(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;

  const firstBreak = text.search(/\r?\n/);
  const firstLine = firstBreak === -1 ? text : text.slice(0, firstBreak);
  const delimiter =
    firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully empty rows (e.g. trailing newline).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Normalize a header for matching: lowercase, no accents, trimmed. */
export function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}
