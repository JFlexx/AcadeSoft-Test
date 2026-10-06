import { Prisma } from '@prisma/client';
import { createChainedInvoice } from '../invoices/invoice-hash';

/**
 * Invoices of the one-off enrollment fee use this billing period, so the
 * existing unique (enrollmentId, billingPeriod) guarantees it is charged at
 * most once per enrollment — even if the student is activated twice.
 */
export const ENROLLMENT_FEE_PERIOD = 'MATRICULA';
const DUE_IN_DAYS = 7;

/**
 * Charges the group's enrollment fee (matrícula) for an enrollment, if the
 * group has one and it hasn't been charged yet. Returns the new invoice, or
 * null when there is nothing to charge.
 */
export async function chargeEnrollmentFee(
  tx: Prisma.TransactionClient,
  tenantId: string,
  enrollmentId: string,
  now = new Date(),
) {
  const enrollment = await tx.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    select: {
      studentId: true,
      group: { select: { name: true, enrollmentFee: true } },
      invoices: { where: { billingPeriod: ENROLLMENT_FEE_PERIOD }, select: { id: true } },
    },
  });
  const fee = enrollment.group.enrollmentFee;
  if (!fee || fee.lte(0) || enrollment.invoices.length > 0) return null;

  return createChainedInvoice(tx, tenantId, {
    studentId: enrollment.studentId,
    enrollmentId,
    billingPeriod: ENROLLMENT_FEE_PERIOD,
    amount: fee,
    description: `Matrícula — ${enrollment.group.name}`,
    issueDate: now,
    dueDate: new Date(now.getTime() + DUE_IN_DAYS * 24 * 60 * 60 * 1000),
  });
}

/** What callers return so the UI can say "matrícula facturada: F-2026-0042". */
export function feeSummary(invoice: { id: string; number: string; amount: Prisma.Decimal } | null) {
  return invoice ? { id: invoice.id, number: invoice.number, amount: invoice.amount } : null;
}
