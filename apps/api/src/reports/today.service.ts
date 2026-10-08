import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, todayIn, zonedToUtc } from '../class-schedule/zoned-time';

const DAY_MS = 86_400_000;
/** How far back an unmarked class still counts as "pasar lista". */
const ATTENDANCE_LOOKBACK_DAYS = 14;
/** Returned receipts older than this are assumed handled some other way. */
const RETURNS_LOOKBACK_DAYS = 60;
const DEFAULT_DURATION_MIN = 60;
const LIST_LIMIT = 8;

type Person = { firstName: string; lastName: string };
const fullName = (p: Person | null | undefined) => (p ? `${p.firstName} ${p.lastName}` : null);

/**
 * The home screen's "qué hacer hoy": today's classes and the loose ends the
 * office should close — classes nobody marked, trial classes to call back,
 * free spots someone is waiting for, and direct debits the bank returned.
 */
@Injectable()
export class TodayService {
  constructor(private readonly prisma: PrismaService) {}

  async today(tenantId: string, now = new Date()) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const day = todayIn(tenant.timezone, now);
    const dayStart = zonedToUtc(day, '00:00', tenant.timezone);
    const dayEnd = zonedToUtc(addDays(day, 1), '00:00', tenant.timezone);

    const [classes, unmarked, trials, groups, returned] = await Promise.all([
      this.prisma.session.findMany({
        where: { tenantId, scheduledAt: { gte: dayStart, lt: dayEnd } },
        orderBy: { scheduledAt: 'asc' },
        select: {
          id: true,
          scheduledAt: true,
          durationMinutes: true,
          status: true,
          teacher: { select: { firstName: true, lastName: true } },
          room: { select: { name: true } },
          group: {
            select: {
              name: true,
              teacher: { select: { firstName: true, lastName: true } },
              room: { select: { name: true } },
              _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
            },
          },
          _count: { select: { attendances: true } },
        },
      }),
      // Classes already given with students but no attendance at all.
      this.prisma.session.findMany({
        where: {
          tenantId,
          status: { not: 'CANCELLED' },
          scheduledAt: {
            gte: new Date(now.getTime() - ATTENDANCE_LOOKBACK_DAYS * DAY_MS),
            lte: now,
          },
          attendances: { none: {} },
          group: { enrollments: { some: { status: 'ACTIVE' } } },
        },
        orderBy: { scheduledAt: 'desc' },
        select: {
          id: true,
          scheduledAt: true,
          durationMinutes: true,
          teacher: { select: { firstName: true, lastName: true } },
          group: {
            select: { name: true, teacher: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      this.prisma.trialClass.findMany({
        where: { tenantId, status: 'BOOKED', session: { scheduledAt: { lte: now } } },
        orderBy: { session: { scheduledAt: 'desc' } },
        select: {
          id: true,
          studentId: true,
          student: { select: { firstName: true, lastName: true } },
          session: {
            select: {
              scheduledAt: true,
              group: { select: { name: true } },
              attendances: { select: { studentId: true, status: true } },
            },
          },
        },
      }),
      this.prisma.group.findMany({
        where: {
          tenantId,
          isActive: true,
          maxCapacity: { not: null },
          enrollments: { some: { status: 'WAITLIST' } },
        },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          maxCapacity: true,
          enrollments: {
            where: { status: { in: ['ACTIVE', 'WAITLIST'] } },
            select: { status: true, spotOfferedAt: true },
          },
        },
      }),
      this.prisma.sepaRemittanceItem.findMany({
        where: {
          status: 'RETURNED',
          remittance: { tenantId },
          returnedAt: { gte: new Date(now.getTime() - RETURNS_LOOKBACK_DAYS * DAY_MS) },
          invoice: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
        },
        orderBy: { returnedAt: 'desc' },
        select: {
          id: true,
          amount: true,
          returnedAt: true,
          returnReason: true,
          invoice: {
            select: {
              id: true,
              number: true,
              student: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    const ended = (s: { scheduledAt: Date; durationMinutes: number | null }) =>
      s.scheduledAt.getTime() + (s.durationMinutes ?? DEFAULT_DURATION_MIN) * 60_000 <=
      now.getTime();

    const missing = unmarked.filter(ended);
    const spots = groups
      .map((g) => {
        const active = g.enrollments.filter((e) => e.status === 'ACTIVE').length;
        const waiting = g.enrollments.filter((e) => e.status === 'WAITLIST');
        return {
          groupId: g.id,
          groupName: g.name,
          freeSpots: Math.max(0, (g.maxCapacity ?? 0) - active),
          waiting: waiting.length,
          offered: waiting.filter((e) => e.spotOfferedAt).length,
        };
      })
      .filter((g) => g.freeSpots > 0);

    return {
      date: day,
      classes: classes.map((s) => ({
        id: s.id,
        scheduledAt: s.scheduledAt,
        durationMinutes: s.durationMinutes ?? DEFAULT_DURATION_MIN,
        status: s.status,
        groupName: s.group.name,
        teacherName: fullName(s.teacher ?? s.group.teacher),
        roomName: s.room?.name ?? s.group.room?.name ?? null,
        enrolled: s.group._count.enrollments,
        marked: s._count.attendances,
      })),
      attendanceMissing: {
        total: missing.length,
        items: missing.slice(0, LIST_LIMIT).map((s) => ({
          id: s.id,
          scheduledAt: s.scheduledAt,
          groupName: s.group.name,
          teacherName: fullName(s.teacher ?? s.group.teacher),
        })),
      },
      trialsToFollowUp: {
        total: trials.length,
        items: trials.slice(0, LIST_LIMIT).map((t) => {
          const mark = t.session.attendances.find((a) => a.studentId === t.studentId);
          return {
            id: t.id,
            studentName: fullName(t.student),
            groupName: t.session.group.name,
            scheduledAt: t.session.scheduledAt,
            // null: nobody marked whether they came.
            attended: mark ? mark.status === 'PRESENT' || mark.status === 'LATE' : null,
          };
        }),
      },
      spotsWithWaitlist: spots,
      returnedReceipts: {
        total: returned.length,
        items: returned.slice(0, LIST_LIMIT).map((r) => ({
          id: r.id,
          invoiceId: r.invoice.id,
          number: r.invoice.number,
          studentName: fullName(r.invoice.student),
          amount: r.amount.toFixed(2),
          returnedAt: r.returnedAt,
          returnReason: r.returnReason,
        })),
      },
    };
  }
}
