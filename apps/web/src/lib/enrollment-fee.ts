import { toast } from 'sonner';
import { confirmToast } from './confirm';

const eur = (v: string | number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(v));

/**
 * Before activating an enrollment in a group with matrícula: ask whether to
 * invoice it. Invoices are fiscal documents, so dismissing means "don't".
 * Groups without matrícula don't ask.
 */
export async function askChargeEnrollmentFee(fee: string | null | undefined): Promise<boolean> {
  if (!fee || Number(fee) <= 0) return false;
  return confirmToast(`¿Facturar también la matrícula (${eur(fee)})?`, {
    description: 'Se emite una factura aparte, una sola vez por inscripción.',
    confirmLabel: 'Sí, facturar',
    cancelLabel: 'No facturar',
  });
}

type FeeInvoice = { number: string; amount: string } | null | undefined;

/** Tells the admin which invoice the matrícula went to, if any. */
export function announceEnrollmentFee(invoice: FeeInvoice) {
  if (invoice) toast.success(`Matrícula facturada: ${invoice.number} (${eur(invoice.amount)})`);
}
