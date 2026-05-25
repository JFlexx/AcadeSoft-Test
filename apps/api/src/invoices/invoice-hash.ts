// Verifactu-style hash chain for invoices.
//
// Each new invoice carries a SHA-256 hash that depends on its own key fields
// AND the hash of the previously issued invoice for the same tenant. This
// produces a tamper-evident chain that AEAT can later verify (when we wire
// the actual /VeriFactu/* AEAT endpoints, queued for a follow-up PR).
//
// Hash inputs (joined with `|`, then SHA-256 hex uppercase):
//   emitterTaxId | invoiceNumber | issueDate (YYYY-MM-DD) | amount (2 dec)
//   | previousHash
//
// MVP simplifications (documented as future work):
// - Real Verifactu uses NIFEmisor + TipoFactura + CuotaTotal + ImporteTotal
//   + FechaHoraHusoGenRegistro. Our payload is a faithful subset of the
//   spirit. When we add IVA + tipo factura we'll extend this and rev the
//   hash version (currently "v1" implicit).
// - The chain is per-tenant, not per-emitter-NIF as AEAT wants. If a tenant
//   ever needs multiple fiscal identities, we'd need separate chains.

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';

export type ChainedInvoiceInput = {
  studentId: string;
  enrollmentId?: string | null;
  billingPeriod?: string | null;
  amount: Prisma.Decimal;
  description?: string | null;
  notes?: string | null;
  issueDate: Date;
  dueDate?: Date | null;
};

type TxClient = Prisma.TransactionClient;

export function computeInvoiceHash(params: {
  emitterTaxId: string;
  invoiceNumber: string;
  issueDate: Date;
  amount: Prisma.Decimal;
  previousHash: string;
}): string {
  const payload = [
    params.emitterTaxId,
    params.invoiceNumber,
    params.issueDate.toISOString().slice(0, 10),
    params.amount.toFixed(2),
    params.previousHash,
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').toUpperCase();
}

/**
 * Atomically: increments the tenant counter, reads previous chain hash,
 * computes the new hash, writes lastInvoiceHash, and creates the invoice
 * with hash/previousHash/hashedAt populated.
 *
 * Must be called from within a Prisma $transaction.
 */
export async function createChainedInvoice(
  tx: TxClient,
  tenantId: string,
  input: ChainedInvoiceInput,
) {
  // Single row lock on tenants via UPDATE: serializes concurrent invoice
  // creates within the same tenant so the chain stays linear.
  const tenant = await tx.tenant.update({
    where: { id: tenantId },
    data: { invoiceCounter: { increment: 1 } },
    select: {
      id: true,
      taxId: true,
      invoicePrefix: true,
      invoiceCounter: true,
      lastInvoiceHash: true,
    },
  });

  const year = input.issueDate.getUTCFullYear();
  const number = `${tenant.invoicePrefix}-${year}-${tenant.invoiceCounter
    .toString()
    .padStart(4, '0')}`;

  const previousHash = tenant.lastInvoiceHash ?? '';
  const emitterTaxId = tenant.taxId ?? tenant.id;
  const hash = computeInvoiceHash({
    emitterTaxId,
    invoiceNumber: number,
    issueDate: input.issueDate,
    amount: input.amount,
    previousHash,
  });

  await tx.tenant.update({
    where: { id: tenantId },
    data: { lastInvoiceHash: hash },
  });

  return tx.invoice.create({
    data: {
      tenantId,
      studentId: input.studentId,
      enrollmentId: input.enrollmentId ?? undefined,
      billingPeriod: input.billingPeriod ?? undefined,
      number,
      amount: input.amount,
      description: input.description ?? undefined,
      notes: input.notes ?? undefined,
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? undefined,
      hash,
      previousHash: tenant.lastInvoiceHash, // null for the first invoice ever
      hashedAt: new Date(),
    },
  });
}
