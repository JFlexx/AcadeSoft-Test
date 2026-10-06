import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createChainedInvoice } from '../invoices/invoice-hash';
import { ChargeGroupDto } from './dto/charge-group.dto';

/**
 * Charges a one-off concept (books, materials, a trip…) to every active
 * student of a group: one chained invoice each. Sibling discounts apply to
 * monthly fees only, so the amount is the same for everyone.
 *
 * Re-submitting the same concept on the same day (a double click, a retry)
 * skips students who already have that invoice instead of charging twice.
 */
@Injectable()
export class GroupChargeService {
  constructor(private readonly prisma: PrismaService) {}

  async charge(tenantId: string, dto: ChargeGroupDto, now = new Date()) {
    const group = await this.prisma.group.findFirst({
      where: { id: dto.groupId, tenantId },
      select: { id: true, name: true },
    });
    if (!group) throw new NotFoundException('Grupo no encontrado');
    const description = dto.description.trim();
    if (!description) throw new BadRequestException('El concepto es obligatorio');
    const amount = new Prisma.Decimal(dto.amount);
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const enrollments = await this.prisma.enrollment.findMany({
      where: { groupId: group.id, status: 'ACTIVE' },
      select: { id: true, student: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    });
    if (enrollments.length === 0) {
      throw new BadRequestException('El grupo no tiene alumnos activos');
    }

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const already = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        studentId: { in: enrollments.map((e) => e.student.id) },
        description,
        amount,
        createdAt: { gte: dayStart },
        status: { not: 'CANCELLED' },
      },
      select: { studentId: true },
    });
    const charged = new Set(already.map((i) => i.studentId));

    const items: {
      studentName: string;
      status: 'CREATED' | 'WOULD_CREATE' | 'SKIPPED';
      number?: string;
    }[] = [];
    for (const e of enrollments) {
      const studentName = `${e.student.firstName} ${e.student.lastName}`;
      if (charged.has(e.student.id)) {
        items.push({ studentName, status: 'SKIPPED' });
        continue;
      }
      if (dto.dryRun) {
        items.push({ studentName, status: 'WOULD_CREATE' });
        continue;
      }
      const invoice = await this.prisma.$transaction((tx) =>
        createChainedInvoice(tx, tenantId, {
          studentId: e.student.id,
          enrollmentId: e.id,
          amount,
          description,
          issueDate: now,
          dueDate,
        }),
      );
      items.push({ studentName, status: 'CREATED', number: invoice.number });
    }

    const toCharge = items.filter((i) => i.status !== 'SKIPPED').length;
    return {
      groupName: group.name,
      dryRun: !!dto.dryRun,
      summary: {
        created: items.filter((i) => i.status === 'CREATED').length,
        wouldCreate: items.filter((i) => i.status === 'WOULD_CREATE').length,
        skipped: items.filter((i) => i.status === 'SKIPPED').length,
        total: amount.mul(toCharge).toFixed(2),
      },
      items,
    };
  }
}
