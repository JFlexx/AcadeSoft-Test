'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ChevronLeft, GraduationCap, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';
import { EmptyState } from '@/components/empty-state';

type AssessmentRow = { id: string; name: string; date: string; graded: number; average: string | null };
type Detail = {
  id: string;
  name: string;
  date: string;
  group: { id: string; name: string };
  students: {
    id: string;
    firstName: string;
    lastName: string;
    result: { score: string | null; comment: string | null } | null;
  }[];
};
type Draft = Record<string, { score: string; comment: string }>;

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');
const day = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const fmtScore = (s: string | null) => (s == null ? '' : String(Number(s)));

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Assessments of a group and the grade sheet of each one. Used by the
 * admin (basePath "") and by the teacher app (basePath "/teacher"), whose
 * API has the same shape under /teacher.
 */
export function GradesEditor({ groupId, basePath }: { groupId: string; basePath: '' | '/teacher' }) {
  const [rows, setRows] = useState<AssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(todayLocal());
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setRows(await api<AssessmentRow[]>(`${basePath}/groups/${groupId}/assessments`));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, basePath]);

  function openDetail(d: Detail) {
    setDetail(d);
    setDraft(
      Object.fromEntries(
        d.students.map((s) => [
          s.id,
          { score: fmtScore(s.result?.score ?? null), comment: s.result?.comment ?? '' },
        ]),
      ),
    );
  }

  async function open(id: string) {
    try {
      openDetail(await api<Detail>(`${basePath}/assessments/${id}`));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const d = await api<Detail>(`${basePath}/groups/${groupId}/assessments`, {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), date: newDate }),
      });
      setCreating(false);
      setNewName('');
      openDetail(d);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function save() {
    if (!detail) return;
    const items = detail.students.map((s) => {
      const d = draft[s.id];
      return {
        studentId: s.id,
        score: d.score.trim() === '' ? null : Number(d.score.replace(',', '.')),
        comment: d.comment.trim() || null,
      };
    });
    if (items.some((i) => i.score != null && (Number.isNaN(i.score) || i.score < 0 || i.score > 10))) {
      toast.error('Las notas van de 0 a 10');
      return;
    }
    setSaving(true);
    try {
      openDetail(
        await api<Detail>(`${basePath}/assessments/${detail.id}/results`, {
          method: 'PUT',
          body: JSON.stringify({ items }),
        }),
      );
      toast.success('Notas guardadas');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!detail) return;
    const ok = await confirmToast(`¿Borrar «${detail.name}» y sus notas?`, { confirmLabel: 'Borrar' });
    if (!ok) return;
    try {
      await api(`${basePath}/assessments/${detail.id}`, { method: 'DELETE' });
      setDetail(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  if (detail) {
    const dirty = detail.students.some((s) => {
      const d = draft[s.id];
      return d.score !== fmtScore(s.result?.score ?? null) || d.comment !== (s.result?.comment ?? '');
    });
    return (
      <div className="space-y-3 pb-20">
        <button
          onClick={() => setDetail(null)}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" /> Evaluaciones
        </button>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-medium">{detail.name}</h3>
            <p className="text-xs text-gray-500">
              {detail.group.name} · {day(detail.date)}
            </p>
          </div>
          <button onClick={remove} className="p-2 text-gray-400 hover:text-red-600" aria-label="Borrar evaluación">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {detail.students.length === 0 ? (
          <p className="text-sm text-gray-500">El grupo no tiene alumnos activos.</p>
        ) : (
          <ul className="space-y-2">
            {detail.students.map((s) => (
              <li key={s.id} className="rounded-xl border bg-white p-3">
                <div className="flex items-center gap-3">
                  <span className="flex-1 font-medium truncate">
                    {s.firstName} {s.lastName}
                  </span>
                  <input
                    aria-label={`Nota de ${s.firstName}`}
                    inputMode="decimal"
                    value={draft[s.id].score}
                    onChange={(e) => setDraft({ ...draft, [s.id]: { ...draft[s.id], score: e.target.value } })}
                    placeholder="0–10"
                    className="w-20 border rounded-lg px-2 py-2 text-center text-base"
                  />
                </div>
                <input
                  aria-label={`Comentario de ${s.firstName}`}
                  value={draft[s.id].comment}
                  maxLength={500}
                  onChange={(e) => setDraft({ ...draft, [s.id]: { ...draft[s.id], comment: e.target.value } })}
                  placeholder="Comentario (opcional)"
                  className="mt-2 w-full border rounded px-2 py-1.5 text-sm"
                />
              </li>
            ))}
          </ul>
        )}
        {detail.students.length > 0 && (
          <div className="sticky bottom-0 bg-white border-t -mx-1 px-1 py-3 flex items-center gap-3">
            <span className="text-sm text-gray-600 flex-1">
              {dirty ? 'Cambios sin guardar' : 'Todo guardado'}
            </span>
            <button onClick={save} disabled={saving || !dirty} className="btn-primary">
              {saving ? 'Guardando…' : 'Guardar notas'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!creating ? (
        <button onClick={() => setCreating(true)} className="btn-secondary">
          + Nueva evaluación
        </button>
      ) : (
        <form onSubmit={create} className="flex flex-wrap items-end gap-2 border rounded p-3 bg-gray-50">
          <label className="block">
            <span className="text-xs text-gray-600 block mb-1">Nombre *</span>
            <input
              required
              maxLength={120}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="1ª evaluación, Examen Unit 3…"
              className="border rounded px-2 py-1 text-sm w-56 bg-white"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600 block mb-1">Fecha *</span>
            <input
              type="date"
              required
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm bg-white"
            />
          </label>
          <button type="submit" className="btn-primary">
            Crear y poner notas
          </button>
          <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-600 hover:underline px-2">
            Cancelar
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Sin evaluaciones"
          description="Crea una evaluación (un examen, un trimestre…) y pon la nota de cada alumno. Las familias la verán en su portal."
        />
      ) : (
        <ul className="divide-y border rounded-lg bg-white">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => open(r.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-gray-50"
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{r.name}</span>
                  <span className="block text-xs text-gray-500">{day(r.date)}</span>
                </span>
                <span className="text-xs text-gray-500">
                  {r.graded} con nota{r.average && ` · media ${Number(r.average).toLocaleString('es-ES')}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
