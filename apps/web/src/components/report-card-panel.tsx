'use client';

import { FormEvent, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiBlob, ApiError } from '@/lib/api';

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Defaults: from the start of the school year (1 September) until today. */
function defaultTerm() {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    from: `${year}-09-01`,
    to: ymd(now),
    title: `Curso ${year}-${String(year + 1).slice(2)}`,
  };
}

function TermFields({
  term,
  setTerm,
}: {
  term: ReturnType<typeof defaultTerm>;
  setTerm: (t: ReturnType<typeof defaultTerm>) => void;
}) {
  return (
    <>
      <label className="block">
        <span className="text-xs text-gray-600 block mb-1">Título</span>
        <input
          required
          maxLength={120}
          value={term.title}
          onChange={(e) => setTerm({ ...term, title: e.target.value })}
          placeholder="1º trimestre 2026-27"
          className="border rounded px-2 py-1 text-sm w-48 bg-white"
        />
      </label>
      <label className="block">
        <span className="text-xs text-gray-600 block mb-1">Desde</span>
        <input
          type="date"
          required
          value={term.from}
          onChange={(e) => setTerm({ ...term, from: e.target.value })}
          className="border rounded px-2 py-1 text-sm bg-white"
        />
      </label>
      <label className="block">
        <span className="text-xs text-gray-600 block mb-1">Hasta</span>
        <input
          type="date"
          required
          value={term.to}
          min={term.from}
          onChange={(e) => setTerm({ ...term, to: e.target.value })}
          className="border rounded px-2 py-1 text-sm bg-white"
        />
      </label>
    </>
  );
}

/** Student page: download the report card PDF for a term. */
export function StudentReportCard({ studentId }: { studentId: string }) {
  const [term, setTerm] = useState(defaultTerm);
  const [busy, setBusy] = useState(false);

  async function download(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const qs = new URLSearchParams(term);
      const { blob, filename } = await apiBlob(`/students/${studentId}/report-card?${qs}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? 'boletin.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={download} className="flex flex-wrap items-end gap-2">
      <TermFields term={term} setTerm={setTerm} />
      <button type="submit" disabled={busy} className="btn-secondary inline-flex items-center gap-1">
        <FileText className="h-4 w-4" /> {busy ? 'Generando…' : 'Descargar PDF'}
      </button>
    </form>
  );
}

type Preview = {
  students: { id: string; name: string; hasEmail: boolean }[];
  emailConfigured: boolean;
};

/** Group page: email each family their child's report card (this group). */
export function GroupReportCards({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const [term, setTerm] = useState(defaultTerm);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Preview>(`/groups/${groupId}/report-cards/preview`)
      .then(setPreview)
      .catch((err) => toast.error(errorMessage(err)));
  }, [groupId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ sent: number; withoutEmail: number; failed: number }>(
        `/groups/${groupId}/report-cards/send`,
        { method: 'POST', body: JSON.stringify(term) },
      );
      toast.success(
        [
          `${res.sent} boletines enviados`,
          res.withoutEmail && `${res.withoutEmail} sin email`,
          res.failed && `${res.failed} con error`,
        ]
          .filter(Boolean)
          .join(' · '),
      );
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const withEmail = preview?.students.filter((s) => s.hasEmail).length ?? 0;
  const without = preview?.students.filter((s) => !s.hasEmail) ?? [];

  return (
    <div className="border rounded p-4 mb-4 bg-gray-50 space-y-3">
      <h3 className="text-sm font-medium">Enviar boletines por email</h3>
      <p className="text-xs text-gray-500">
        Cada familia recibe el boletín de su hijo en PDF, con las notas de este grupo en el
        periodo elegido y su asistencia.
      </p>
      <form onSubmit={send} className="flex flex-wrap items-end gap-2">
        <TermFields term={term} setTerm={setTerm} />
        <button
          type="submit"
          disabled={busy || !preview?.emailConfigured || withEmail === 0}
          className="btn-primary"
        >
          {busy ? 'Enviando…' : `Enviar a ${withEmail} familias`}
        </button>
        <button type="button" onClick={onClose} className="text-sm text-gray-600 hover:underline px-2">
          Cancelar
        </button>
      </form>
      {preview && !preview.emailConfigured && (
        <p className="text-xs text-amber-700">El envío de email aún no está configurado.</p>
      )}
      {without.length > 0 && (
        <p className="text-xs text-gray-500">
          Sin email (descarga su boletín desde su ficha): {without.map((s) => s.name).join(', ')}
        </p>
      )}
    </div>
  );
}
