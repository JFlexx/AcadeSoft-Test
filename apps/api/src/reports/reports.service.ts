import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, todayIn, zonedToUtc } from '../class-schedule/zoned-time';
import { ReportRangeDto } from './dto/report-range.dto';

const D = (v: Prisma.Decimal.Value = 0) => new Prisma.Decimal(v);
const money = (d: Prisma.Decimal) => d.toFixed(2);
const MAX_RANGE_DAYS = 800;

/**
 * Reports for the academy: income, receivables, students and attendance
 * over a period, plus the rows of the invoice book and the payments for
 * the accountant (gestoría). Aggregated in memory: one academy's volume
 * (thousands of rows a year) doesn't need anything heavier.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string, dto: ReportRangeDto, now = new Date()) {
    const { tz, start, end } = await this.range(tenantId, dto);
    const month = (d: Date) => todayIn(tz, d).slice(0, 7);

    // ─── Income: invoiced (by issue date) and collected (by payment date)
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, status: { not: 'CANCELLED' }, issueDate: { gte: start, lt: end } },
      select: {
        amount: true,
        issueDate: true,
        enrollment: {
          select: {
            group: { select: { id: true, name: true, course: { select: { name: true } } } },
          },
        },
      },
    });
    const payments = await this.prisma.payment.findMany({
      where: { tenantId, paidAt: { gte: start, lt: end } },
      select: {
        amount: true,
        paidAt: true,
        invoice: { select: { enrollment: { select: { group: { select: { id: true } } } } } },
      },
    });

    const months: string[] = [];
    for (let m = dto.from.slice(0, 7); m <= dto.to.slice(0, 7); ) {
      months.push(m);
      const [y, mm] = m.split('-').map(Number);
      m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
    }
    const byMonth = new Map(months.map((m) => [m, { invoiced: D(), collected: D() }]));
    for (const i of invoices) {
      const b = byMonth.get(month(i.issueDate));
      if (b) b.invoiced = b.invoiced.add(i.amount);
    }
    for (const p of payments) {
      const b = byMonth.get(month(p.paidAt));
      if (b) b.collected = b.collected.add(p.amount);
    }

    const groups = new Map<
      string,
      { name: string; course: string; invoiced: Prisma.Decimal; collected: Prisma.Decimal }
    >();
    const other = { invoiced: D(), collected: D() };
    for (const i of invoices) {
      const g = i.enrollment?.group;
      if (!g) {
        other.invoiced = other.invoiced.add(i.amount);
        continue;
      }
      const row = groups.get(g.id) ?? {
        name: g.name,
        course: g.course.name,
        invoiced: D(),
        collected: D(),
      };
      row.invoiced = row.invoiced.add(i.amount);
      groups.set(g.id, row);
    }
    for (const p of payments) {
      const gid = p.invoice.enrollment?.group.id;
      const row = gid ? groups.get(gid) : undefined;
      if (row) row.collected = row.collected.add(p.amount);
      else other.collected = other.collected.add(p.amount);
    }

    const invoiced = invoices.reduce((s, i) => s.add(i.amount), D());
    const collected = payments.reduce((s, p) => s.add(p.amount), D());

    // ─── Receivables: everything still owed today (not limited to the period)
    const owed = await this.prisma.invoice.findMany({
      where: { tenantId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      select: {
        amount: true,
        paidAmount: true,
        dueDate: true,
        studentId: true,
        student: { select: { firstName: true, lastName: true } },
      },
    });
    const aging = { notDue: D(), d0_30: D(), d31_60: D(), d60plus: D() };
    const debtors = new Map<
      string,
      { name: string; pending: Prisma.Decimal; oldestDue: Date | null }
    >();
    let overdue = D();
    for (const inv of owed) {
      const pending = inv.amount.sub(inv.paidAmount);
      if (pending.lte(0)) continue;
      const days = inv.dueDate
        ? Math.floor((now.getTime() - inv.dueDate.getTime()) / 86_400_000)
        : -1;
      if (days < 0) aging.notDue = aging.notDue.add(pending);
      else {
        overdue = overdue.add(pending);
        if (days <= 30) aging.d0_30 = aging.d0_30.add(pending);
        else if (days <= 60) aging.d31_60 = aging.d31_60.add(pending);
        else aging.d60plus = aging.d60plus.add(pending);
      }
      const d = debtors.get(inv.studentId) ?? {
        name: `${inv.student.firstName} ${inv.student.lastName}`,
        pending: D(),
        oldestDue: null,
      };
      d.pending = d.pending.add(pending);
      if (inv.dueDate && days >= 0 && (!d.oldestDue || inv.dueDate < d.oldestDue))
        d.oldestDue = inv.dueDate;
      debtors.set(inv.studentId, d);
    }
    const pendingTotal = [aging.notDue, aging.d0_30, aging.d31_60, aging.d60plus].reduce(
      (s, x) => s.add(x),
      D(),
    );

    // ─── Students: active now, joined and left during the period
    const [active, joined, left] = await Promise.all([
      this.prisma.student.count({
        where: { tenantId, enrollments: { some: { status: 'ACTIVE' } } },
      }),
      this.prisma.enrollment.findMany({
        where: {
          student: { tenantId },
          status: { in: ['ACTIVE', 'COMPLETED', 'DROPPED'] },
          enrolledAt: { gte: start, lt: end },
        },
        select: { studentId: true, enrolledAt: true },
      }),
      this.prisma.enrollment.findMany({
        where: { student: { tenantId }, status: 'DROPPED', droppedAt: { gte: start, lt: end } },
        select: { studentId: true, droppedAt: true },
      }),
    ]);
    const studentMonths = new Map(months.map((m) => [m, { joined: 0, left: 0 }]));
    for (const e of joined) {
      const b = studentMonths.get(month(e.enrolledAt));
      if (b) b.joined++;
    }
    for (const e of left) {
      const b = studentMonths.get(month(e.droppedAt!));
      if (b) b.left++;
    }

    // ─── Attendance per group in the period (attended over marked)
    const marks = await this.prisma.attendance.findMany({
      where: { session: { tenantId, scheduledAt: { gte: start, lt: end } } },
      select: {
        status: true,
        session: { select: { group: { select: { id: true, name: true } } } },
      },
    });
    const att = new Map<string, { name: string; attended: number; marked: number }>();
    for (const m of marks) {
      const g = m.session.group;
      const row = att.get(g.id) ?? { name: g.name, attended: 0, marked: 0 };
      row.marked++;
      if (m.status === 'PRESENT' || m.status === 'LATE') row.attended++;
      att.set(g.id, row);
    }

    return {
      period: { from: dto.from, to: dto.to },
      income: {
        invoiced: money(invoiced),
        collected: money(collected),
        byMonth: months.map((m) => ({
          month: m,
          invoiced: money(byMonth.get(m)!.invoiced),
          collected: money(byMonth.get(m)!.collected),
        })),
        byGroup: [...groups.values()]
          .sort((a, b) => b.invoiced.cmp(a.invoiced))
          .map((g) => ({ ...g, invoiced: money(g.invoiced), collected: money(g.collected) })),
        other: { invoiced: money(other.invoiced), collected: money(other.collected) },
      },
      receivables: {
        pending: money(pendingTotal),
        overdue: money(overdue),
        aging: {
          notDue: money(aging.notDue),
          d0_30: money(aging.d0_30),
          d31_60: money(aging.d31_60),
          d60plus: money(aging.d60plus),
        },
        topDebtors: [...debtors.entries()]
          .sort(([, a], [, b]) => b.pending.cmp(a.pending))
          .slice(0, 10)
          .map(([studentId, d]) => ({
            studentId,
            name: d.name,
            pending: money(d.pending),
            oldestDue: d.oldestDue ? todayIn(tz, d.oldestDue) : null,
          })),
      },
      students: {
        active,
        joined: new Set(joined.map((e) => e.studentId)).size,
        left: new Set(left.map((e) => e.studentId)).size,
        byMonth: months.map((m) => ({ month: m, ...studentMonths.get(m)! })),
      },
      attendance: [...att.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((g) => ({ ...g, rate: g.marked ? Math.round((g.attended / g.marked) * 100) : null })),
    };
  }

  /** Libro de facturas emitidas: every invoice issued in the period. */
  async invoiceBook(tenantId: string, dto: ReportRangeDto) {
    const { tz, start, end } = await this.range(tenantId, dto);
    const rows = await this.prisma.invoice.findMany({
      where: { tenantId, issueDate: { gte: start, lt: end } },
      orderBy: { number: 'asc' },
      select: {
        number: true,
        issueDate: true,
        dueDate: true,
        type: true,
        description: true,
        amount: true,
        paidAmount: true,
        status: true,
        rectifies: { select: { number: true } },
        student: { select: { firstName: true, lastName: true, address: true } },
      },
    });
    return rows.map((r) => ({
      number: r.number,
      issueDate: todayIn(tz, r.issueDate),
      dueDate: r.dueDate ? todayIn(tz, r.dueDate) : null,
      type: r.type,
      rectifies: r.rectifies?.number ?? null,
      customer: `${r.student.firstName} ${r.student.lastName}`,
      address: r.student.address,
      description: r.description,
      amount: money(r.amount),
      paid: money(r.paidAmount),
      status: r.status,
    }));
  }

  /** Every payment received in the period, with its invoice. */
  async paymentsBook(tenantId: string, dto: ReportRangeDto) {
    const { tz, start, end } = await this.range(tenantId, dto);
    const rows = await this.prisma.payment.findMany({
      where: { tenantId, paidAt: { gte: start, lt: end } },
      orderBy: { paidAt: 'asc' },
      select: {
        paidAt: true,
        amount: true,
        method: true,
        reference: true,
        invoice: {
          select: { number: true, student: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    return rows.map((r) => ({
      date: todayIn(tz, r.paidAt),
      invoice: r.invoice.number,
      customer: `${r.invoice.student.firstName} ${r.invoice.student.lastName}`,
      method: r.method,
      amount: money(r.amount),
      reference: r.reference,
    }));
  }

  private async range(tenantId: string, dto: ReportRangeDto) {
    for (const d of [dto.from, dto.to]) {
      if (addDays(d, 0) !== d) throw new BadRequestException(`Fecha no válida: ${d}`);
    }
    if (dto.from > dto.to)
      throw new BadRequestException('La fecha de inicio es posterior a la de fin');
    if (addDays(dto.from, MAX_RANGE_DAYS) < dto.to) {
      throw new BadRequestException('El periodo es demasiado largo');
    }
    const { timezone: tz } = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return {
      tz,
      start: zonedToUtc(dto.from, '00:00', tz),
      end: zonedToUtc(addDays(dto.to, 1), '00:00', tz),
    };
  }
}
