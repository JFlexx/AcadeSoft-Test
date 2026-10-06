'use client';

import { useEffect, useState } from 'react';
import { CalendarRange, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';

type Slot = { weekday: number; startTime: string; durationMinutes: number };
type Preview = {
  from: string;
  to: string;
  create: number;
  replace: number;
  alreadyScheduled: number;
  skippedHolidays: number;
};

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DURATIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180];

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDay(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function sameSlots(a: Slot[], b: Slot[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Weekly schedule of a group and the generator that fills the calendar from
 * it. `onGenerated` lets the page reload its session list.
 */
export function GroupSchedule({
  groupId,
  groupStart,
  groupEnd,
  onGenerated,
}: {
  groupId: string;
  groupStart: string | null;
  groupEnd: string | null;
  onGenerated: () => void;
}) {
  const [saved, setSaved] = useState<Slot[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const initialFrom = groupStart && groupStart.slice(0, 10) > todayLocal() ? groupStart.slice(0, 10) : todayLocal();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(groupEnd ? groupEnd.slice(0, 10) : '');
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api<{ slots: (Slot & { id: string })[] }>(`/groups/${groupId}/schedule`)
      .then((res) => {
        const list = res.slots.map(({ weekday, startTime, durationMinutes }) => ({
          weekday,
          startTime,
          durationMinutes,
        }));
        setSaved(list);
        setSlots(list);
      })
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [groupId]);

  const dirty = !sameSlots(slots, saved);

  // Preview follows the saved schedule and the chosen range.
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (loading || saved.length === 0 || !from || !to) return;
    let cancelled = false;
    api<Preview>(`/groups/${groupId}/schedule/preview`, {
      method: 'POST',
      body: JSON.stringify({ from, to, replace }),
    })
      .then((p) => !cancelled && setPreview(p))
      .catch((err) => !cancelled && setPreviewError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [groupId, saved, from, to, replace, loading]);

  function update(i: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  function addSlot() {
    const last = slots[slots.length - 1];
    setSlots([
      ...slots,
      last
        ? { ...last, weekday: (last.weekday % 7) + 1 }
        : { weekday: 1, startTime: '17:00', durationMinutes: 60 },
    ]);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await api<{ slots: (Slot & { id: string })[] }>(`/groups/${groupId}/schedule`, {
        method: 'PUT',
        body: JSON.stringify({ slots }),
      });
      const list = res.slots.map(({ weekday, startTime, durationMinutes }) => ({
        weekday,
        startTime,
        durationMinutes,
      }));
      setSaved(list);
      setSlots(list);
      toast.success('Horario guardado');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const res = await api<{ created: number; replaced: number }>(
        `/groups/${groupId}/schedule/generate`,
        { method: 'POST', body: JSON.stringify({ from, to, replace }) },
      );
      toast.success(
        res.created === 0 && res.replaced === 0
          ? 'El calendario ya estaba al día'
          : `${res.created} clases creadas${res.replaced ? `, ${res.replaced} sustituidas` : ''}`,
      );
      setReplace(false);
      onGenerated();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Cargando horario…</p>;

  const nothingToDo = preview && preview.create === 0 && preview.replace === 0;

  return (
    <div className="space-y-5">
      <div>
        {slots.length === 0 ? (
          <p className="text-sm text-gray-500 mb-3">
            Sin horario. Añade los días y horas de clase y el calendario del curso se generará
            solo.
          </p>
        ) : (
          <ul className="space-y-2 mb-3">
            {slots.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Día"
                  value={s.weekday}
                  onChange={(e) => update(i, { weekday: Number(e.target.value) })}
                  className="border rounded px-2 py-1 text-sm bg-white"
                >
                  {WEEKDAYS.map((d, j) => (
                    <option key={d} value={j + 1}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Hora de inicio"
                  type="time"
                  required
                  value={s.startTime}
                  onChange={(e) => update(i, { startTime: e.target.value })}
                  className="border rounded px-2 py-1 text-sm"
                />
                <select
                  aria-label="Duración"
                  value={s.durationMinutes}
                  onChange={(e) => update(i, { durationMinutes: Number(e.target.value) })}
                  className="border rounded px-2 py-1 text-sm bg-white"
                >
                  {(DURATIONS.includes(s.durationMinutes)
                    ? DURATIONS
                    : [...DURATIONS, s.durationMinutes].sort((a, b) => a - b)
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSlots(slots.filter((_, j) => j !== i))}
                  className="p-1 text-gray-400 hover:text-red-600"
                  aria-label="Quitar franja"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={addSlot} className="btn-secondary inline-flex items-center gap-1">
            <Plus className="h-4 w-4" /> Añadir franja
          </button>
          {dirty && (
            <button type="button" onClick={save} disabled={saving} className="btn-primary">
              {saving ? 'Guardando…' : 'Guardar horario'}
            </button>
          )}
        </div>
      </div>

      {saved.length > 0 && (
        <div className="border rounded p-4 bg-gray-50 space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <CalendarRange className="h-4 w-4" /> Generar clases en el calendario
          </h3>
          {dirty && (
            <p className="text-xs text-amber-700">
              Guarda el horario para generar las clases con los cambios.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">Desde</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600 block mb-1">Hasta</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Sustituir las clases futuras que no encajen con el horario
              <span className="block text-xs text-gray-500">
                Útil si has cambiado el horario. Nunca se tocan clases con asistencia, ya
                impartidas o canceladas.
              </span>
            </span>
          </label>

          {!to && <p className="text-sm text-gray-500">Elige hasta qué fecha generar.</p>}
          {previewError && <p className="text-sm text-red-600">{previewError}</p>}
          {preview && (
            <p className="text-sm text-gray-700">
              Del {formatDay(preview.from)} al {formatDay(preview.to)}:{' '}
              <strong>{preview.create} clases nuevas</strong>
              {preview.replace > 0 && <>, {preview.replace} sustituidas</>}
              {preview.alreadyScheduled > 0 && <>, {preview.alreadyScheduled} ya estaban</>}
              {preview.skippedHolidays > 0 && (
                <>, {preview.skippedHolidays} en días sin clase (no se crean)</>
              )}
              .
            </p>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={generating || dirty || !preview || !!nothingToDo}
            className="btn-primary"
          >
            {generating
              ? 'Generando…'
              : nothingToDo
                ? 'Calendario al día'
                : preview && preview.create > 0
                  ? `Generar ${preview.create} clases`
                  : preview
                    ? 'Aplicar cambios'
                    : 'Generar clases'}
          </button>
        </div>
      )}
    </div>
  );
}
