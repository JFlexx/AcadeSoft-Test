import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createChainedInvoice } from '../invoices/invoice-hash';
import { GenerateMonthDto } from './dto/generate-month.dto';
import { SepaRemittanceDto } from './dto/sepa-remittance.dto';
import {
  buildSepaXml,
  generateMessageId,
  SepaTransaction,
} from './sepa';

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

type GenerationStatus = 'CREATED' | 'SKIPPED' | 'NO_FEE' | 'WOULD_CREATE';

type GenerationItem = {
  enrollmentId: string;
  studentName: string;
  groupName: string;
  amount: string | null;
  status: GenerationStatus;
  invoiceId: string | null;
};

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async generateMonth(tenantId: string, dto: GenerateMonthDto) {
    const period = `${dto.year}-${dto.month.toString().padStart(2, '0')}`;
    const issueDate = new Date(Date.UTC(dto.year, dto.month - 1, 1, 12, 0, 0));
    const dueDate = new Date(Date.UTC(dto.year, dto.month, 0, 12, 0, 0));

    const enrollments = await this.prisma.enrollment.findMany({
      where: { status: 'ACTIVE', student: { tenantId } },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            discountPercent: true,
          },
        },
        group: { select: { id: true, name: true, monthlyFee: true } },
      },
      orderBy: [
        { student: { lastName: 'asc' } },
        { student: { firstName: 'asc' } },
      ],
    });

    const enrollmentIds = enrollments.map((e) => e.id);
    const existing = enrollmentIds.length
      ? await this.prisma.invoice.findMany({
          where: {
            enrollmentId: { in: enrollmentIds },
            billingPeriod: period,
          },
          select: { id: true, enrollmentId: true },
        })
      : [];
    const existingByEnrollment = new Map(
      existing
        .filter((e): e is { id: string; enrollmentId: string } => !!e.enrollmentId)
        .map((e) => [e.enrollmentId, e.id]),
    );

    const results: GenerationItem[] = [];

    for (const e of enrollments) {
      const baseFee = e.monthlyFeeOverride ?? e.group.monthlyFee;
      const studentName = `${e.student.firstName} ${e.student.lastName}`;
      const groupName = e.group.name;

      if (!baseFee) {
        results.push({
          enrollmentId: e.id,
          studentName,
          groupName,
          amount: null,
          status: 'NO_FEE',
          invoiceId: null,
        });
        continue;
      }

      // Apply the student's family/sibling discount (percentage off the
      // group/override fee), rounded to cents.
      const pct = e.student.discountPercent;
      const hasDiscount = pct != null && pct.gt(0);
      const fee = hasDiscount
        ? baseFee
            .mul(new Prisma.Decimal(1).minus(pct.div(100)))
            .toDecimalPlaces(2)
        : baseFee;
      const discountNote = hasDiscount
        ? `Descuento ${pct.toString()}% sobre cuota base ${baseFee.toFixed(2)} €`
        : null;

      const existingId = existingByEnrollment.get(e.id);
      if (existingId) {
        results.push({
          enrollmentId: e.id,
          studentName,
          groupName,
          amount: fee.toString(),
          status: 'SKIPPED',
          invoiceId: existingId,
        });
        continue;
      }

      if (dto.dryRun) {
        results.push({
          enrollmentId: e.id,
          studentName,
          groupName,
          amount: fee.toString(),
          status: 'WOULD_CREATE',
          invoiceId: null,
        });
        continue;
      }

      const invoice = await this.prisma.$transaction(async (tx) =>
        createChainedInvoice(tx, tenantId, {
          studentId: e.studentId,
          enrollmentId: e.id,
          billingPeriod: period,
          amount: fee,
          description: `${groupName} — ${MONTH_NAMES_ES[dto.month - 1]} ${dto.year}`,
          notes: discountNote,
          issueDate,
          dueDate,
        }),
      );

      results.push({
        enrollmentId: e.id,
        studentName,
        groupName,
        amount: fee.toString(),
        status: 'CREATED',
        invoiceId: invoice.id,
      });
    }

    const summary = {
      created: results.filter((r) => r.status === 'CREATED').length,
      skipped: results.filter((r) => r.status === 'SKIPPED').length,
      noFee: results.filter((r) => r.status === 'NO_FEE').length,
      wouldCreate: results.filter((r) => r.status === 'WOULD_CREATE').length,
      total: results.length,
    };

    return { period, dryRun: !!dto.dryRun, summary, results };
  }

  // ─── SEPA direct debit remittance ───────────────────────────────────────────

  private async collectSepaItems(tenantId: string, dto: SepaRemittanceDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        legalName: true,
        iban: true,
        sepaCreditorId: true,
      },
    });
    if (!tenant?.iban || !tenant.sepaCreditorId) {
      throw new BadRequestException(
        'Configura el IBAN y el identificador de acreedor SEPA en Ajustes antes de generar remesas',
      );
    }

    const periodStart = new Date(Date.UTC(dto.year, dto.month - 1, 1));
    const periodEnd = new Date(Date.UTC(dto.year, dto.month, 1));

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING', 'PARTIAL'] },
        issueDate: { gte: periodStart, lt: periodEnd },
      },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            iban: true,
            mandateReference: true,
            mandateDate: true,
          },
        },
      },
      orderBy: { number: 'asc' },
    });

    const included: {
      invoiceId: string;
      number: string;
      studentName: string;
      amount: string;
      tx: SepaTransaction;
    }[] = [];
    const skipped: {
      invoiceId: string;
      number: string;
      studentName: string;
      reason: string;
    }[] = [];

    for (const inv of invoices) {
      const studentName = `${inv.student.firstName} ${inv.student.lastName}`;
      const pending = inv.amount.sub(inv.paidAmount);
      if (pending.lte(0)) {
        skipped.push({
          invoiceId: inv.id,
          number: inv.number,
          studentName,
          reason: 'Sin importe pendiente',
        });
        continue;
      }
      if (
        !inv.student.iban ||
        !inv.student.mandateReference ||
        !inv.student.mandateDate
      ) {
        skipped.push({
          invoiceId: inv.id,
          number: inv.number,
          studentName,
          reason: 'Alumno sin IBAN o mandato de domiciliación',
        });
        continue;
      }

      const amount = pending.toFixed(2);
      included.push({
        invoiceId: inv.id,
        number: inv.number,
        studentName,
        amount,
        tx: {
          endToEndId: inv.number,
          amount,
          mandateId: inv.student.mandateReference,
          mandateDate: inv.student.mandateDate.toISOString().slice(0, 10),
          debtorName: studentName,
          debtorIban: inv.student.iban,
          remittanceInfo: inv.description
            ? `${inv.number} ${inv.description}`.slice(0, 140)
            : inv.number,
        },
      });
    }

    const creditor = {
      name: tenant.legalName ?? tenant.name,
      iban: tenant.iban,
      creditorId: tenant.sepaCreditorId,
    };

    return { creditor, included, skipped };
  }

  async sepaPreview(tenantId: string, dto: SepaRemittanceDto) {
    const { included, skipped } = await this.collectSepaItems(tenantId, dto);
    const period = `${dto.year}-${dto.month.toString().padStart(2, '0')}`;
    const totalAmount = included
      .reduce((sum, i) => sum + Number(i.amount), 0)
      .toFixed(2);
    return {
      period,
      totalAmount,
      count: included.length,
      included: included.map((i) => ({
        invoiceId: i.invoiceId,
        number: i.number,
        studentName: i.studentName,
        amount: i.amount,
      })),
      skipped,
    };
  }

  async sepaXml(
    tenantId: string,
    dto: SepaRemittanceDto,
  ): Promise<{ xml: string; filename: string }> {
    const { creditor, included } = await this.collectSepaItems(tenantId, dto);
    if (included.length === 0) {
      throw new BadRequestException(
        'No hay facturas domiciliables en este periodo (revisa IBAN/mandato de los alumnos)',
      );
    }

    const collectionDate =
      dto.collectionDate?.slice(0, 10) ??
      new Date().toISOString().slice(0, 10);
    const period = `${dto.year}-${dto.month.toString().padStart(2, '0')}`;

    const xml = buildSepaXml({
      messageId: generateMessageId(),
      creationDateTime: new Date(),
      collectionDate,
      creditor,
      transactions: included.map((i) => i.tx),
    });

    return { xml, filename: `remesa-sepa-${period}.xml` };
  }
}
