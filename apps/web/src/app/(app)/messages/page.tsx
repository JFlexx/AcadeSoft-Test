'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { confirmToast } from '@/lib/confirm';
import { EmptyState } from '@/components/empty-state';

type Group = { id: string; name: string; isActive: boolean };
type Student = { id: string; firstName: string; lastName: string };
type TargetType = 'group' | 'student';

type Preview = {
  targetLabel: string;
  recipients: number;
  withoutEmail: string[];
  emailConfigured: boolean;
};

type SentMessage = {
  id: string;
  subject: string;
  targetType: 'GROUP' | 'STUDENT';
  targetLabel: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
};

const SUBJECT_MAX = 150;
const BODY_MAX = 5000;

// useSearchParams needs a Suspense boundary in the App Router.
export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <p className="text-sm text-gray-500">Cargando…</p>
        </div>
      }
    >
      <MessagesContent />
    </Suspense>
  );
}

function MessagesContent() {
  const params = useSearchParams();

  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [history, setHistory] = useState<SentMessage[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  const [targetType, setTargetType] = useState<TargetType>(
    params.get('studentId') ? 'student' : 'group',
  );
  const [targetId, setTargetId] = useState(
    params.get('studentId') ?? params.get('groupId') ?? '',
  );
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function loadHistory() {
    setHistory(await api<SentMessage[]>('/messages'));
  }

  useEffect(() => {
    (async () => {
      try {
        const [g, s, settings] = await Promise.all([
          api<Group[]>('/groups'),
          api<Student[]>('/students'),
          api<{ emailConfigured: boolean }>('/settings'),
          loadHistory(),
        ]);
        setGroups(g.filter((x) => x.isActive));
        setStudents(s);
        setEmailConfigured(settings.emailConfigured);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Refresh the recipient preview whenever the target changes.
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    if (!targetId) return;
    const payload = targetType === 'group' ? { groupId: targetId } : { studentId: targetId };
    let cancelled = false;
    api<Preview>('/messages/preview', { method: 'POST', body: JSON.stringify(payload) })
      .then((p) => !cancelled && setPreview(p))
      .catch((err) => {
        if (!cancelled)
          setPreviewError(err instanceof ApiError ? err.message : 'Error de red');
      });
    return () => {
      cancelled = true;
    };
  }, [targetType, targetId]);

  const canSend =
    emailConfigured &&
    !!preview &&
    preview.recipients > 0 &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !sending;

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!preview || !canSend) return;
    const ok = await confirmToast(
      `¿Enviar a ${preview.recipients} destinatario(s)?`,
      { description: preview.targetLabel, confirmLabel: 'Enviar' },
    );
    if (!ok) return;

    setSending(true);
    try {
      const payload =
        targetType === 'group' ? { groupId: targetId } : { studentId: targetId };
      const res = await api<{ sent: number; failed: number }>('/messages', {
        method: 'POST',
        body: JSON.stringify({ ...payload, subject: subject.trim(), body }),
      });
      if (res.failed > 0) {
        toast.warning(`Enviado a ${res.sent}; ${res.failed} no se pudieron enviar`);
      } else {
        toast.success(`Mensaje enviado a ${res.sent} destinatario(s)`);
      }
      setSubject('');
      setBody('');
      await loadHistory();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al enviar');
    } finally {
      setSending(false);
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
    <div className="p-6 max-w-3xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Mensajes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Envía un email a un grupo o a la familia de un alumno. Las respuestas
          llegan al email de contacto de la academia.
        </p>
      </header>

      {!emailConfigured && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          El envío de email aún no está configurado en el servidor, así que no
          se puede enviar todavía.
        </p>
      )}

      <form onSubmit={handleSend} className="border rounded-lg p-4 bg-white space-y-4">
        <div className="flex gap-4 text-sm">
          {(['group', 'student'] as const).map((t) => (
            <label key={t} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="targetType"
                checked={targetType === t}
                onChange={() => {
                  setTargetType(t);
                  setTargetId('');
                }}
              />
              {t === 'group' ? 'A un grupo' : 'A un alumno'}
            </label>
          ))}
        </div>

        <label className="block">
          <span className="text-xs text-gray-600 block mb-1">
            {targetType === 'group' ? 'Grupo' : 'Alumno'}
          </span>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm bg-white"
          >
            <option value="">Selecciona…</option>
            {targetType === 'group'
              ? groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))
              : students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </option>
                ))}
          </select>
        </label>

        {previewError && <p className="text-sm text-red-600">{previewError}</p>}
        {preview && (
          <div className="text-sm rounded bg-gray-50 border px-3 py-2">
            {preview.recipients > 0 ? (
              <p>
                Se enviará a <strong>{preview.recipients}</strong> destinatario(s).
              </p>
            ) : (
              <p className="text-amber-700">Nadie de este destino tiene email.</p>
            )}
            {preview.withoutEmail.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Sin email (no lo recibirán): {preview.withoutEmail.join(', ')}
              </p>
            )}
          </div>
        )}

        <label className="block">
          <span className="text-xs text-gray-600 block mb-1">Asunto</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value.replace(/[\r\n]/g, ''))}
            maxLength={SUBJECT_MAX}
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs text-gray-600 flex justify-between mb-1">
            <span>Mensaje</span>
            <span className="text-gray-400">
              {body.length}/{BODY_MAX}
            </span>
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={BODY_MAX}
            rows={7}
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </label>

        <button type="submit" disabled={!canSend} className="btn-primary">
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </form>

      <section>
        <h2 className="font-medium mb-3">Enviados</h2>
        {history.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="Aún no has enviado mensajes"
            description="Aquí verás el historial de lo enviado a grupos y familias."
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b text-gray-500">
                <th className="py-2 font-medium">Fecha</th>
                <th className="py-2 font-medium">Asunto</th>
                <th className="py-2 font-medium">Destino</th>
                <th className="py-2 font-medium text-right">Enviados</th>
              </tr>
            </thead>
            <tbody>
              {history.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="py-2 text-gray-600">
                    {new Date(m.createdAt).toLocaleString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-2">{m.subject}</td>
                  <td className="py-2 text-gray-600">{m.targetLabel}</td>
                  <td className="py-2 text-right">
                    {m.sentCount}/{m.recipientCount}
                    {m.failedCount > 0 && (
                      <span className="text-red-600 ml-1">({m.failedCount} fallidos)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
