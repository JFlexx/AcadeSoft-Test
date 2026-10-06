import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeStatus } from '../invoices/invoices.service';

/**
 * History of SEPA remittances and their outcome. A remittance is recorded
 * when its XML is downloaded (BillingService.sepaXml); here the admin marks
 * it as collected — registering a direct-debit payment per receipt — or
 * voids it if it never reached the bank.
 */
@Injectable()
export class RemittancesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const rows = await this.prisma.sepaRemittance.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        messageId: true,
        period: true,
        collectionDate: true,
        total: true,
        itemCount: true,
        status: true,
        collectedAt: true,
        createdAt: true,
        items: { select: { status: true } },
      },
    });
    return rows.map(({ items, ...r }) => ({
      ...r,
      returned: items.filter((i) => i.status === 'RETURNED').length,
    }));
  }

  async detail(tenantId: string, id: string) {
    const r = await this.prisma.sepaRemittance.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        messageId: true,
        period: true,
        collectionDate: true,
        total: true,
        itemCount: true,
        status: true,
        collectedAt: true,
        createdAt: true,
        items: {
          orderBy: { invoice: { number: 'asc' } },
          select: {
            id: true,
            amount: true,
            status: true,
            returnReason: true,
            returnedAt: true,
            invoice: {
              select: {
                id: true,
                number: true,
                status: true,
                student: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
    if (!r) throw new NotFoundException();
    return r;
  }

  async xml(tenantId: string, id: string) {
    const r = await this.prisma.sepaRemittance.findFirst({
      where: { id, tenantId },
      select: { xml: true, period: true },
    });
    if (!r) throw new NotFoundException();
    return { xml: r.xml, filename: `remesa-sepa-${r.period}.xml` };
  }

  /**
   * The bank paid the remittance: registers a DIRECT_DEBIT payment for each
   * receipt still pending (never more than what the invoice still owes) and
   * marks it collected. Idempotent: collected or returned receipts are left.
   */
  async collect(tenantId: string, id: string) {
    const r = await this.prisma.sepaRemittance.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        messageId: true,
        collectionDate: true,
        items: {
          where: { status: 'SENT' },
          select: {
            id: true,
            amount: true,
            invoice: { select: { id: true, number: true, amount: true, paidAmount: true, dueDate: true, status: true } },
          },
        },
      },
    });
    if (!r) throw new NotFoundException();

    let registered = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const item of r.items) {
        const inv = item.invoice;
        const pending = inv.amount.sub(inv.paidAmount);
        const amount = item.amount.gt(pending) ? pending : item.amount;
        let paymentId: string | null = null;
        if (inv.status !== 'CANCELLED' && amount.gt(0)) {
          const payment = await tx.payment.create({
            data: {
              tenantId,
              invoiceId: inv.id,
              amount,
              method: 'DIRECT_DEBIT',
              paidAt: r.collectionDate,
              reference: `${r.messageId} / ${inv.number}`,
              notes: 'Remesa SEPA cobrada',
            },
          });
          const paid = inv.paidAmount.add(amount);
          await tx.invoice.update({
            where: { id: inv.id },
            data: { paidAmount: paid, status: computeStatus(inv.amount, paid, inv.dueDate) },
          });
          paymentId = payment.id;
          registered++;
        }
        await tx.sepaRemittanceItem.update({
          where: { id: item.id },
          data: { status: 'COLLECTED', paymentId },
        });
      }
      await tx.sepaRemittance.update({
        where: { id: r.id },
        data: { status: 'COLLECTED', collectedAt: new Date() },
      });
    });
    return { registered };
  }

  /** Voids a remittance that never reached the bank, freeing its invoices. */
  async void(tenantId: string, id: string) {
    const r = await this.prisma.sepaRemittance.findFirst({
      where: { id, tenantId },
      select: { status: true, items: { where: { status: { not: 'SENT' } }, select: { id: true } } },
    });
    if (!r) throw new NotFoundException();
    if (r.status !== 'SENT' || r.items.length > 0) {
      throw new BadRequestException('Solo se puede anular una remesa que aún no se ha cobrado');
    }
    await this.prisma.sepaRemittance.delete({ where: { id } });
  }
}
