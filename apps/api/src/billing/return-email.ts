import { escapeHtml } from '../email/html';

const eur = (v: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);

export type ReturnData = {
  academy: string;
  studentName: string;
  invoiceNumber: string;
  pending: number;
  feeInvoiceNumber: string | null;
  fee: number | null;
  portalUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

export function returnSubject(d: ReturnData): string {
  return `Recibo devuelto — Factura ${d.invoiceNumber}`;
}

export function returnHtml(d: ReturnData): string {
  const contact = [d.contactEmail, d.contactPhone]
    .filter((x): x is string => !!x)
    .map(escapeHtml)
    .join(' · ');
  return `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
  <p>Hola,</p>
  <p>El banco nos ha devuelto el recibo domiciliado de la factura
  <strong>${escapeHtml(d.invoiceNumber)}</strong> de <strong>${escapeHtml(d.studentName)}</strong>,
  así que sigue pendiente un importe de <strong>${eur(d.pending)}</strong>.</p>
  ${
    d.feeInvoiceNumber && d.fee
      ? `<p>La comisión que nos ha cobrado el banco por la devolución (${eur(d.fee)}) va en la
  factura ${escapeHtml(d.feeInvoiceNumber)}.</p>`
      : ''
  }
  ${
    d.portalUrl
      ? `<p>Puedes pagarlo con tarjeta desde el portal de familias:
  <a href="${escapeHtml(d.portalUrl)}">${escapeHtml(d.portalUrl)}</a></p>`
      : ''
  }
  <p>Si crees que es un error o prefieres otra forma de pago, responde a este email.</p>
  <p>Gracias,<br>${escapeHtml(d.academy)}${contact ? `<br><small>${contact}</small>` : ''}</p>
</body></html>`;
}
