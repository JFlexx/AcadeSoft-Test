import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateMonthDto } from './dto/generate-month.dto';

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
        student: { select: { id: true, firstName: true, lastName: true } },
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
      const fee = e.monthlyFeeOverride ?? e.group.monthlyFee;
      const studentName = `${e.student.firstName} ${e.student.lastName}`;
      const groupName = e.group.name;

      if (!fee) {
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

      const invoice = await this.prisma.$transaction(async (tx) => {
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
            studentId: e.studentId,
            enrollmentId: e.id,
            billingPeriod: period,
            number,
            amount: fee,
            description: `${groupName} — ${MONTH_NAMES_ES[dto.month - 1]} ${dto.year}`,
            issueDate,
            dueDate,
          },
        });
      });

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
}

function formatInvoiceNumber(
  prefix: string,
  issueDate: Date,
  counter: number,
): string {
  const year = issueDate.getUTCFullYear();
  return `${prefix}-${year}-${counter.toString().padStart(4, '0')}`;
}
