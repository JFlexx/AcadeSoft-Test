'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiBlob, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : 'Error de red');

/**
 * Student page (admin): the family's RGPD rights — download all their data
 * (access/portability) or erase it (keeping only what the invoices need).
 */
export function GdprPanel({
  studentId,
  name,
  onErased,
}: {
  studentId: string;
  name: string;
  onErased: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function download() {
    try {
      const { blob, filename } = await apiBlob(`/students/${studentId}/export`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? 'datos.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function erase() {
    const ok = await confirmToast(`¿Suprimir los datos personales de ${name}?`, {
      description:
        'No se puede deshacer. Se borran contacto, familia y su acceso al portal, inscripciones, asistencia, notas y domiciliación. Si tiene facturas, se conservan con su nombre y dirección, como exige la ley.',
      confirmLabel: 'Suprimir',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api<{ deleted: boolean; keptInvoices: number }>(
        `/students/${studentId}/erase`,
        { method: 'POST' },
      );
      if (res.deleted) {
        toast.success('Datos suprimidos: el alumno se ha eliminado');
        router.push('/students');
      } else {
        toast.success(`Datos suprimidos. Se conservan sus ${res.keptInvoices} facturas`);
        onErased();
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-white mb-8">
      <h2 className="font-medium text-sm text-gray-700 mb-2 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" /> Protección de datos (RGPD)
      </h2>
      <p className="text-sm text-gray-500 mb-3">
        Si la familia ejerce sus derechos: descarga todo lo que la academia guarda de este alumno
        (acceso y portabilidad) o suprime sus datos personales (derecho al olvido).
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={download} className="btn-secondary inline-flex items-center gap-1">
          <Download className="h-4 w-4" /> Descargar sus datos
        </button>
        <button
          onClick={erase}
          disabled={busy}
          className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {busy ? 'Suprimiendo…' : 'Suprimir datos personales'}
        </button>
      </div>
    </div>
  );
}
