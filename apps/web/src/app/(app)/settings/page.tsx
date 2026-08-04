'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';

type Settings = {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  iban: string | null;
  sepaCreditorId: string | null;
  invoicePrefix: string;
  autoBillingEnabled: boolean;
  autoBillingDay: number;
};

type FormState = {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  iban: string;
  sepaCreditorId: string;
  invoicePrefix: string;
};

const EMPTY: FormState = {
  name: '',
  legalName: '',
  taxId: '',
  address: '',
  contactEmail: '',
  contactPhone: '',
  iban: '',
  sepaCreditorId: '',
  invoicePrefix: '',
};

function toForm(s: Settings): FormState {
  return {
    name: s.name ?? '',
    legalName: s.legalName ?? '',
    taxId: s.taxId ?? '',
    address: s.address ?? '',
    contactEmail: s.contactEmail ?? '',
    contactPhone: s.contactPhone ?? '',
    iban: s.iban ?? '',
    sepaCreditorId: s.sepaCreditorId ?? '',
    invoicePrefix: s.invoicePrefix ?? '',
  };
}

export default function SettingsPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [slug, setSlug] = useState('');
  const [autoBilling, setAutoBilling] = useState(false);
  const [autoBillingDay, setAutoBillingDay] = useState(1);

  function applyAuto(data: Settings) {
    setAutoBilling(data.autoBillingEnabled);
    setAutoBillingDay(data.autoBillingDay);
  }

  async function refresh() {
    setLoading(true);
    try {
      const data = await api<Settings>('/settings');
      setForm(toForm(data));
      setSlug(data.slug);
      applyAuto(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSavedAt(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, string> = {};
      // Send trimmed values; empty strings are sent to clear optional fields.
      (Object.keys(form) as (keyof FormState)[]).forEach((k) => {
        payload[k] = form[k].trim();
      });
      // name and invoicePrefix should not be blanked accidentally
      if (!payload.name) delete payload.name;
      if (!payload.invoicePrefix) delete payload.invoicePrefix;

      const updated = await api<Settings>('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          ...payload,
          autoBillingEnabled: autoBilling,
          autoBillingDay,
        }),
      });
      setForm(toForm(updated));
      applyAuto(updated);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de red');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Ajustes de la academia</h1>
        <p className="text-sm text-gray-600 mt-1">
          Estos datos aparecen en las facturas y se usan para domiciliaciones
          SEPA.
        </p>
      </header>

      {slug && (
        <div className="border rounded-lg p-4 bg-brand-50/50 mb-6">
          <p className="text-sm font-medium text-gray-800">
            Enlace de inscripción online
          </p>
          <p className="text-xs text-gray-500 mt-1 mb-2">
            Compártelo para que las familias se inscriban solas. Las solicitudes
            llegan como inscripciones pendientes de revisar.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border rounded px-2 py-1.5 truncate">
              {`${typeof window !== 'undefined' ? window.location.origin : ''}/enroll/${slug}`}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/enroll/${slug}`,
                );
                toast.success('Enlace copiado');
              }}
              className="btn-secondary shrink-0"
            >
              <Copy className="h-4 w-4" />
              Copiar
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="border rounded-lg p-4 bg-white space-y-3">
          <h2 className="font-medium text-sm text-gray-700">Identidad</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Nombre comercial"
              value={form.name}
              onChange={(v) => set('name', v)}
            />
            <Field
              label="Razón social"
              value={form.legalName}
              onChange={(v) => set('legalName', v)}
            />
            <Field
              label="CIF / NIF"
              value={form.taxId}
              onChange={(v) => set('taxId', v)}
            />
            <Field
              label="Prefijo de factura"
              value={form.invoicePrefix}
              onChange={(v) => set('invoicePrefix', v)}
              placeholder="F"
            />
            <Field
              label="Dirección"
              value={form.address}
              onChange={(v) => set('address', v)}
              full
            />
          </div>
        </section>

        <section className="border rounded-lg p-4 bg-white space-y-3">
          <h2 className="font-medium text-sm text-gray-700">Contacto</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Email de contacto"
              type="email"
              value={form.contactEmail}
              onChange={(v) => set('contactEmail', v)}
            />
            <Field
              label="Teléfono"
              value={form.contactPhone}
              onChange={(v) => set('contactPhone', v)}
            />
          </div>
        </section>

        <section className="border rounded-lg p-4 bg-white space-y-3">
          <h2 className="font-medium text-sm text-gray-700">
            Datos bancarios (SEPA)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="IBAN"
              value={form.iban}
              onChange={(v) => set('iban', v)}
              placeholder="ES…"
            />
            <Field
              label="Identificador de acreedor SEPA"
              value={form.sepaCreditorId}
              onChange={(v) => set('sepaCreditorId', v)}
              placeholder="ES…ZZZ…"
            />
          </div>
          <p className="text-xs text-gray-500">
            El identificador de acreedor lo proporciona tu banco. Necesario para
            generar remesas de domiciliación.
          </p>
        </section>

        <section className="border-t pt-5 space-y-3">
          <h2 className="font-medium">Facturación automática</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoBilling}
              onChange={(e) => {
                setAutoBilling(e.target.checked);
                setSavedAt(null);
              }}
            />
            Generar las mensualidades automáticamente cada mes
          </label>
          {autoBilling && (
            <label className="block text-sm">
              <span className="text-xs text-gray-600 block mb-1">
                Día del mes (1–28)
              </span>
              <select
                value={autoBillingDay}
                onChange={(e) => {
                  setAutoBillingDay(Number(e.target.value));
                  setSavedAt(null);
                }}
                className="border rounded px-2 py-1 text-sm bg-white"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-xs text-gray-500">
            Cada mes, el día elegido, se crean las facturas de las inscripciones
            activas con cuota (igual que el botón «Generar mensualidades», sin
            duplicar las que ya existan). Desactivado por defecto.
          </p>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {savedAt && !saving && (
            <span className="text-xs text-green-700">
              Guardado {savedAt.toLocaleTimeString('es-ES')}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  full = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? 'col-span-2' : ''}`}>
      <span className="text-xs text-gray-600 block mb-1">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded px-2 py-1 text-sm"
      />
    </label>
  );
}
