// HTML for the overdue-invoice reminder sent to families.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function eur(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

export type ReminderData = {
  academy: string;
  studentName: string;
  invoiceNumber: string;
  pending: number;
  dueDate: Date | null;
  contactEmail: string | null;
  contactPhone: string | null;
  portalUrl: string | null;
};

export function reminderSubject(d: ReminderData): string {
  return `Recordatorio de pago — Factura ${d.invoiceNumber}`;
}

export function reminderHtml(d: ReminderData): string {
  const due = d.dueDate
    ? ` que venció el ${d.dueDate.toLocaleDateString('es-ES')}`
    : '';
  const contact = [d.contactEmail, d.contactPhone]
    .filter((x): x is string => !!x)
    .map(escapeHtml)
    .join(' · ');

  return `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
  <p>Hola,</p>
  <p>Te recordamos que la factura <strong>${escapeHtml(d.invoiceNumber)}</strong>
  de <strong>${escapeHtml(d.studentName)}</strong>${due} tiene un importe
  pendiente de <strong>${eur(d.pending)}</strong>.</p>
  ${
    d.portalUrl
      ? `<p>Puedes consultarla y pagarla con tarjeta desde el portal de familias:
  <a href="${escapeHtml(d.portalUrl)}">${escapeHtml(d.portalUrl)}</a></p>`
      : ''
  }
  <p>Si ya la has pagado, ignora este mensaje.</p>
  <p>Gracias,<br>${escapeHtml(d.academy)}${contact ? `<br><small>${contact}</small>` : ''}</p>
</body></html>`;
}
