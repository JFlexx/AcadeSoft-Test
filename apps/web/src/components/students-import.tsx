'use client';

import { useState } from 'react';
import { Upload, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { parseCsv, normalizeHeader } from '@/lib/csv-parse';
import { downloadCsv } from '@/lib/csv';

type ImportRow = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  iban?: string;
  mandateReference?: string;
  discountPercent?: number;
};

type ImportResult = {
  total: number;
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
};

// Maps a normalized CSV header to a student field.
const HEADER_TO_FIELD: Record<string, keyof ImportRow> = {
  nombre: 'firstName',
  apellidos: 'lastName',
  apellido: 'lastName',
  email: 'email',
  correo: 'email',
  'correo electronico': 'email',
  telefono: 'phone',
  movil: 'phone',
  tel: 'phone',
  iban: 'iban',
  mandato: 'mandateReference',
  'ref mandato': 'mandateReference',
  'ref. mandato': 'mandateReference',
  'referencia mandato': 'mandateReference',
  'referencia de mandato': 'mandateReference',
  descuento: 'discountPercent',
  'descuento %': 'discountPercent',
  'descuento (%)': 'discountPercent',
};

export function StudentImportPanel({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [recognized, setRecognized] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  function reset() {
    setFileName('');
    setRows([]);
    setSkipped(0);
    setRecognized([]);
  }

  async function handleFile(file: File) {
    const text = await file.text();
    const table = parseCsv(text);
    if (table.length < 2) {
      toast.error('El archivo no tiene filas de datos.');
      return;
    }

    const headers = table[0].map(normalizeHeader);
    const fieldByCol = headers.map((h) => HEADER_TO_FIELD[h] ?? null);
    const recognizedFields = Array.from(
      new Set(fieldByCol.filter((f): f is keyof ImportRow => f !== null)),
    );

    if (
      !recognizedFields.includes('firstName') ||
      !recognizedFields.includes('lastName')
    ) {
      toast.error(
        'No encuentro las columnas "Nombre" y "Apellidos". Descarga la plantilla para ver el formato.',
      );
      return;
    }

    const parsed: ImportRow[] = [];
    let invalid = 0;
    for (let r = 1; r < table.length; r++) {
      const cells = table[r];
      const obj: Partial<ImportRow> = {};
      fieldByCol.forEach((field, col) => {
        if (!field) return;
        const value = (cells[col] ?? '').trim();
        if (!value) return;
        if (field === 'discountPercent') {
          const n = Number(value.replace(',', '.'));
          if (!Number.isNaN(n)) obj.discountPercent = n;
        } else {
          obj[field] = value;
        }
      });
      if (obj.firstName && obj.lastName) {
        parsed.push(obj as ImportRow);
      } else {
        invalid++;
      }
    }

    setFileName(file.name);
    setRows(parsed);
    setSkipped(invalid);
    setRecognized(recognizedFields);
  }

  async function runImport() {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const res = await api<ImportResult>('/students/import', {
        method: 'POST',
        body: JSON.stringify({ students: rows }),
      });
      if (res.created > 0) {
        toast.success(
          `${res.created} alumno(s) importado(s)` +
            (res.failed > 0 ? ` · ${res.failed} con error` : ''),
        );
      } else {
        toast.error('No se importó ningún alumno.');
      }
      onImported();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al importar');
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    downloadCsv(
      'plantilla-alumnos.csv',
      ['Nombre', 'Apellidos', 'Email', 'Teléfono', 'IBAN', 'Ref. mandato', 'Descuento %'],
      [['Ana', 'García', 'ana@example.com', '600111222', '', '', '']],
    );
  }

  return (
    <div className="border rounded p-4 mb-6 space-y-3 bg-gray-50">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Importar alumnos desde CSV</h2>
        <button onClick={downloadTemplate} className="text-sm text-brand-700 hover:underline inline-flex items-center gap-1">
          <FileDown className="h-4 w-4" /> Descargar plantilla
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Sube un archivo CSV (puedes exportarlo desde tu sistema actual o Excel).
        Reconoce las columnas: Nombre, Apellidos, Email, Teléfono, IBAN, Ref.
        mandato y Descuento %. Las columnas obligatorias son Nombre y Apellidos.
      </p>

      <label className="block">
        <span className="sr-only">Archivo CSV</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-white file:text-sm hover:file:bg-brand-700"
        />
      </label>

      {rows.length > 0 && (
        <>
          <div className="text-sm text-gray-700">
            <span className="font-medium">{fileName}</span> — {rows.length}{' '}
            alumno(s) listos para importar
            {skipped > 0 && (
              <span className="text-amber-700">
                {' '}
                · {skipped} fila(s) sin nombre/apellidos se omitirán
              </span>
            )}
            .
            <span className="text-gray-500">
              {' '}
              Columnas reconocidas: {recognized.join(', ')}.
            </span>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b text-gray-500">
                <th className="py-1.5 font-medium">Nombre</th>
                <th className="py-1.5 font-medium">Apellidos</th>
                <th className="py-1.5 font-medium">Email</th>
                <th className="py-1.5 font-medium text-right">Descuento</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="py-1.5">{r.firstName}</td>
                  <td className="py-1.5">{r.lastName}</td>
                  <td className="py-1.5 text-gray-600">{r.email ?? '—'}</td>
                  <td className="py-1.5 text-right text-gray-600">
                    {r.discountPercent != null ? `${r.discountPercent}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 5 && (
            <p className="text-xs text-gray-400">
              …y {rows.length - 5} más.
            </p>
          )}
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={runImport}
          disabled={rows.length === 0 || importing}
          className="btn-primary"
        >
          <Upload className="h-4 w-4" />
          {importing ? 'Importando…' : `Importar ${rows.length || ''} alumno(s)`}
        </button>
        <button
          onClick={() => {
            reset();
            onClose();
          }}
          className="btn-secondary"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
