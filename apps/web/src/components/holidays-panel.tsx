'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';

type Holiday = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  cancelledSessions: number;
};

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');

function formatDay(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** School year in course right now: from July on, the one starting this September. */
function currentSchoolYear(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/** Festivos y vacaciones: classes on these days are cancelled and not generated. */
export function HolidaysPanel() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' });
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const schoolYear = currentSchoolYear();

  async function load() {
    try {
      setHolidays(await api<Holiday[]>('/holidays'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await api<Holiday>('/holidays', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          startDate: form.startDate,
          ...(form.endDate ? { endDate: form.endDate } : {}),
        }),
      });
      toast.success(
        created.cancelledSessions > 0
          ? `Añadido. ${created.cancelledSessions} clases canceladas`
          : 'Día sin clase añadido',
      );
      setForm({ name: '', startDate: '', endDate: '' });
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    try {
      const res = await api<{ created: number; cancelledSessions: number }>('/holidays/national', {
        method: 'POST',
        body: JSON.stringify({ schoolYear }),
      });
      toast.success(
        res.created === 0
          ? 'Los festivos nacionales ya estaban añadidos'
          : `${res.created} festivos añadidos${res.cancelledSessions ? `, ${res.cancelledSessions} clases canceladas` : ''}`,
      );
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(h: Holiday) {
    const ok = await confirmToast(`¿Quitar «${h.name}»?`, {
      confirmLabel: 'Quitar',
      description:
        h.cancelledSessions > 0
          ? `Sus ${h.cancelledSessions} clases canceladas volverán al calendario.`
          : undefined,
    });
    if (!ok) return;
    try {
      const res = await api<{ restoredSessions: number }>(`/holidays/${h.id}`, {
        method: 'DELETE',
      });
      toast.success(
        res.restoredSessions > 0
          ? `Quitado. ${res.restoredSessions} clases vuelven al calendario`
          : 'Quitado',
      );
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const past = holidays.filter((h) => h.endDate < today);
  const visible = showPast ? holidays : holidays.filter((h) => h.endDate >= today);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-medium">Días sin clase</h2>
        <p className="text-sm text-gray-600 mt-1">
          Festivos y vacaciones. Las clases de estos días se cancelan solas y no se generan al
          crear el calendario de un grupo.
        </p>
      </div>

      <button type="button" onClick={handleImport} disabled={importing} className="btn-secondary">
        {importing
          ? 'Añadiendo…'
          : `Añadir festivos nacionales ${schoolYear}-${String(schoolYear + 1).slice(2)}`}
      </button>

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs text-gray-600 block mb-1">Nombre *</span>
          <input
            required
            maxLength={100}
            value={form.name}
            placeholder="Vacaciones de Navidad"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border rounded px-2 py-1 text-sm w-56"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600 block mb-1">Desde *</span>
          <input
            type="date"
            required
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            className="border rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600 block mb-1">Hasta (si es un periodo)</span>
          <input
            type="date"
            value={form.endDate}
            min={form.startDate || undefined}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            className="border rounded px-2 py-1 text-sm"
          />
        </label>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Añadiendo…' : 'Añadir'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500">No hay días sin clase próximos.</p>
      ) : (
        <ul className="divide-y border rounded bg-white">
          {visible.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{h.name}</span>
                <span className="text-gray-500">
                  {' · '}
                  {h.startDate === h.endDate
                    ? formatDay(h.startDate)
                    : `${formatDay(h.startDate)} → ${formatDay(h.endDate)}`}
                </span>
                {h.cancelledSessions > 0 && (
                  <span className="text-xs text-gray-500"> · {h.cancelledSessions} clases canceladas</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(h)}
                className="p-1 text-gray-400 hover:text-red-600"
                aria-label={`Quitar ${h.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPast((v) => !v)}
          className="text-sm text-gray-600 hover:underline"
        >
          {showPast ? 'Ocultar los pasados' : `Mostrar también los pasados (${past.length})`}
        </button>
      )}
    </div>
  );
}
