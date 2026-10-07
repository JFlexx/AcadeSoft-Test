'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';

type Room = { id: string; name: string; capacity: number | null; _count: { groups: number } };

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');

/** Ajustes: the academy's classrooms. */
export function RoomsPanel() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');

  async function load() {
    try {
      setRooms(await api<Room[]>('/rooms'));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/rooms', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), ...(capacity ? { capacity: Number(capacity) } : {}) }),
      });
      setName('');
      setCapacity('');
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove(r: Room) {
    const ok = await confirmToast(`¿Borrar «${r.name}»?`, {
      description: r._count.groups > 0 ? `${r._count.groups} grupos se quedarán sin aula asignada.` : undefined,
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await api(`/rooms/${r.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-medium">Aulas</h2>
        <p className="text-sm text-gray-600 mt-1">
          Asigna a cada grupo su aula habitual. El calendario avisa si dos clases coinciden en la
          misma aula.
        </p>
      </div>
      {rooms.length > 0 && (
        <ul className="divide-y border rounded bg-white">
          {rooms.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{r.name}</span>
                <span className="text-gray-500">
                  {r.capacity ? ` · ${r.capacity} plazas` : ''} · {r._count.groups}{' '}
                  {r._count.groups === 1 ? 'grupo' : 'grupos'}
                </span>
              </span>
              <button
                onClick={() => remove(r)}
                className="p-1 text-gray-400 hover:text-red-600"
                aria-label={`Borrar ${r.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs text-gray-600 block mb-1">Nombre *</span>
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Aula 1"
            className="border rounded px-2 py-1 text-sm w-44"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600 block mb-1">Plazas</span>
          <input
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-20"
          />
        </label>
        <button type="submit" className="btn-secondary">
          Añadir aula
        </button>
      </form>
    </div>
  );
}
