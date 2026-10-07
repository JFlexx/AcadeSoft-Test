import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { familyEmails } from '../email/family-emails';
import { computeStatus } from '../invoices/invoices.service';
import { createChainedInvoice } from '../invoices/invoice-hash';
import { ReturnReceiptDto } from './dto/return-receipt.dto';
import { returnHtml, returnSubject } from './return-email';

const FEE_DUE_DAYS = 7;

/**
 * History of SEPA remittances and their outcome. A remittance is recorded
 * when its XML is downloaded (BillingService.sepaXml); here the admin marks
 * it as collected — registering a direct-debit payment per receipt — or
 * voids it if it never reached the bank.
 */
@Injectable()
export class RemittancesService {
  private readonly logger = new Logger(RemittancesService.name);
  private readonly webOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    this.webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
  }

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
            invoice: {
              select: {
                id: true,
                number: true,
                amount: true,
                paidAmount: true,
                dueDate: true,
                status: true,
              },
            },
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

  /**
   * The bank returned a receipt (devolución): undoes its direct-debit
   * payment so the invoice is owed again (and can go into a later
   * remittance or be paid by card), optionally invoices the bank fee to the
   * family and emails them.
   */
  async returnReceipt(tenantId: string, itemId: string, dto: ReturnReceiptDto, now = new Date()) {
    const item = await this.prisma.sepaRemittanceItem.findFirst({
      where: { id: itemId, remittance: { tenantId } },
      select: {
        id: true,
        status: true,
        payment: { select: { id: true, amount: true } },
        invoice: {
          select: {
            id: true,
            number: true,
            amount: true,
            paidAmount: true,
            dueDate: true,
            studentId: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException();
    if (item.status === 'RETURNED') throw new BadRequestException('Este recibo ya está devuelto');

    const fee = dto.chargeFee && dto.bankFee ? new Prisma.Decimal(dto.bankFee) : null;
    const { invoice } = item;

    const result = await this.prisma.$transaction(async (tx) => {
      let paid = invoice.paidAmount;
      if (item.payment) {
        paid = paid.sub(item.payment.amount);
        await tx.payment.delete({ where: { id: item.payment.id } });
      }
      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount: paid, status: computeStatus(invoice.amount, paid, invoice.dueDate) },
        select: { status: true, amount: true, paidAmount: true },
      });
      await tx.sepaRemittanceItem.update({
        where: { id: item.id },
        data: {
          status: 'RETURNED',
          paymentId: null,
          returnReason: dto.reason.trim(),
          returnedAt: now,
        },
      });
      const feeInvoice =
        fee && fee.gt(0)
          ? await createChainedInvoice(tx, tenantId, {
              studentId: invoice.studentId,
              amount: fee,
              description: `Comisión por devolución del recibo ${invoice.number}`,
              issueDate: now,
              dueDate: new Date(now.getTime() + FEE_DUE_DAYS * 24 * 60 * 60 * 1000),
            })
          : null;
      return { invoice: updated, feeInvoice };
    });

    const notified = dto.notifyFamily
      ? await this.notifyReturn(tenantId, invoice, result.invoice, result.feeInvoice)
      : false;

    return {
      invoiceStatus: result.invoice.status,
      feeInvoice: result.feeInvoice
        ? {
            id: result.feeInvoice.id,
            number: result.feeInvoice.number,
            amount: result.feeInvoice.amount,
          }
        : null,
      notified,
    };
  }

  /** Best effort: the return is recorded even if the email can't be sent. */
  private async notifyReturn(
    tenantId: string,
    invoice: { number: string; studentId: string },
    updated: { amount: Prisma.Decimal; paidAmount: Prisma.Decimal },
    feeInvoice: { number: string; amount: Prisma.Decimal } | null,
  ): Promise<boolean> {
    try {
      const [tenant, student] = await Promise.all([
        this.prisma.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { name: true, legalName: true, contactEmail: true, contactPhone: true },
        }),
        this.prisma.student.findUniqueOrThrow({
          where: { id: invoice.studentId },
          select: {
            firstName: true,
            lastName: true,
            email: true,
            guardians: { select: { email: true, userId: true } },
          },
        }),
      ]);
      const to = familyEmails(student);
      if (to.length === 0) return false;
      const data = {
        academy: tenant.legalName ?? tenant.name,
        studentName: `${student.firstName} ${student.lastName}`,
        invoiceNumber: invoice.number,
        pending: Number(updated.amount.sub(updated.paidAmount)),
        feeInvoiceNumber: feeInvoice?.number ?? null,
        fee: feeInvoice ? Number(feeInvoice.amount) : null,
        portalUrl: student.guardians.some((g) => g.userId) ? `${this.webOrigin}/login` : null,
        contactEmail: tenant.contactEmail,
        contactPhone: tenant.contactPhone,
      };
      return await this.email.send(to, returnSubject(data), returnHtml(data), {
        fromName: tenant.name,
        replyTo: tenant.contactEmail,
      });
    } catch (err) {
      this.logger.error(`Return notice failed: ${String(err)}`);
      return false;
    }
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
