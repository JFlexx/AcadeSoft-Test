import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { buildInvoicePdf } from './invoice-pdf';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateInvoiceDto) {
    await this.ensureStudentInTenant(tenantId, dto.studentId);

    const issueDate = dto.issueDate ? new Date(dto.issueDate) : new Date();
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { invoiceCounter: { increment: 1 } },
        select: { invoicePrefix: true, invoiceCounter: true },
      });
      const number = formatInvoiceNumber(
        tenant.invoicePrefix,
        issueDate,
        tenant.invoiceCounter,
      );

      return tx.invoice.create({
        data: {
          tenantId,
          studentId: dto.studentId,
          number,
          amount: new Prisma.Decimal(dto.amount),
          description: dto.description,
          notes: dto.notes,
          issueDate,
          dueDate,
        },
      });
    });
  }

  findAll(tenantId: string, filters: ListInvoicesDto) {
    const where: Prisma.InvoiceWhereInput = { tenantId };
    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.status) where.status = filters.status;
    if (filters.from || filters.to) {
      where.issueDate = {};
      if (filters.from) where.issueDate.gte = new Date(filters.from);
      if (filters.to) where.issueDate.lte = new Date(filters.to);
    }
    return this.prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        payments: { orderBy: { paidAt: 'desc' } },
        student: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!invoice) throw new NotFoundException();
    return invoice;
  }

  async update(tenantId: string, id: string, dto: UpdateInvoiceDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!invoice) throw new NotFoundException();
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('Cannot update a cancelled invoice');
    }

    return this.prisma.invoice.update({
      where: { id },
      data: {
        description: dto.description,
        notes: dto.notes,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
      },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        _count: { select: { payments: true } },
      },
    });
    if (!invoice) throw new NotFoundException();
    if (invoice._count.payments > 0) {
      throw new BadRequestException('Cannot delete an invoice with payments');
    }
    if (invoice.status !== 'DRAFT' && invoice.status !== 'PENDING') {
      throw new BadRequestException(
        'Only DRAFT or PENDING invoices without payments can be deleted',
      );
    }
    await this.prisma.invoice.delete({ where: { id } });
  }

  async addPayment(tenantId: string, invoiceId: string, dto: CreatePaymentDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) throw new NotFoundException();
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('Cannot register payments on a cancelled invoice');
    }

    const incoming = new Prisma.Decimal(dto.amount);
    const newPaidAmount = invoice.paidAmount.add(incoming);
    if (newPaidAmount.gt(invoice.amount)) {
      throw new BadRequestException(
        `Payment exceeds pending amount (pending: ${invoice.amount.sub(invoice.paidAmount).toString()})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId,
          invoiceId,
          amount: incoming,
          method: dto.method,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
          reference: dto.reference,
          notes: dto.notes,
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          status: computeStatus(invoice.amount, newPaidAmount),
        },
      });

      return payment;
    });
  }

  async listPayments(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { id: true },
    });
    if (!invoice) throw new NotFoundException();
    return this.prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { paidAt: 'desc' },
    });
  }

  async generatePdf(
    tenantId: string,
    invoiceId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        payments: { orderBy: { paidAt: 'asc' } },
        student: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            address: true,
          },
        },
        tenant: {
          select: {
            name: true,
            legalName: true,
            taxId: true,
            address: true,
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException();

    const buffer = await buildInvoicePdf(
      {
        number: invoice.number,
        description: invoice.description,
        notes: invoice.notes,
        amount: invoice.amount,
        paidAmount: invoice.paidAmount,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        status: invoice.status,
        billingPeriod: invoice.billingPeriod,
        student: invoice.student,
        payments: invoice.payments.map((p) => ({
          amount: p.amount,
          method: p.method,
          paidAt: p.paidAt,
          reference: p.reference,
        })),
      },
      {
        name: invoice.tenant.name,
        legalName: invoice.tenant.legalName,
        taxId: invoice.tenant.taxId,
        address: invoice.tenant.address,
      },
    );

    return {
      buffer,
      filename: `factura-${invoice.number}.pdf`,
    };
  }

  async removePayment(tenantId: string, paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
      include: { invoice: true },
    });
    if (!payment) throw new NotFoundException();

    const newPaidAmount = payment.invoice.paidAmount.sub(payment.amount);

    await this.prisma.$transaction([
      this.prisma.payment.delete({ where: { id: paymentId } }),
      this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          paidAmount: newPaidAmount,
          status: computeStatus(payment.invoice.amount, newPaidAmount),
        },
      }),
    ]);
  }

  private async ensureStudentInTenant(
    tenantId: string,
    studentId: string,
  ): Promise<void> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true },
    });
    if (!student) throw new BadRequestException('Student not found in tenant');
  }
}

function formatInvoiceNumber(
  prefix: string,
  issueDate: Date,
  counter: number,
): string {
  const year = issueDate.getUTCFullYear();
  return `${prefix}-${year}-${counter.toString().padStart(4, '0')}`;
}

function computeStatus(
  amount: Prisma.Decimal,
  paidAmount: Prisma.Decimal,
): InvoiceStatus {
  if (paidAmount.gte(amount)) return 'PAID';
  if (paidAmount.gt(0)) return 'PARTIAL';
  return 'PENDING';
}
