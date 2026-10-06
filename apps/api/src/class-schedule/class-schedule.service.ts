import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateSessionsDto } from './dto/generate-sessions.dto';
import { PutScheduleDto } from './dto/put-schedule.dto';
import { addDays, isoWeekday, todayIn, ymdOf, zonedToUtc } from './zoned-time';

/** A school year plus margin; keeps one request from creating thousands of rows. */
const MAX_RANGE_DAYS = 400;

type Tx = Prisma.TransactionClient;

type Plan = {
  from: string;
  to: string;
  timezone: string;
  toCreate: { scheduledAt: Date; durationMinutes: number }[];
  toReplace: string[];
  alreadyScheduled: number;
  skippedHolidays: number;
};

@Injectable()
export class ClassScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantId: string, groupId: string) {
    const group = await this.findGroup(this.prisma, tenantId, groupId);
    const slots = await this.prisma.scheduleSlot.findMany({
      where: { groupId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
      select: { id: true, weekday: true, startTime: true, durationMinutes: true },
    });
    return { timezone: group.tenant.timezone, slots };
  }

  async put(tenantId: string, groupId: string, dto: PutScheduleDto) {
    await this.findGroup(this.prisma, tenantId, groupId);
    const keys = dto.slots.map((s) => `${s.weekday}-${s.startTime}`);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Hay dos franjas el mismo día a la misma hora');
    }
    await this.prisma.$transaction([
      this.prisma.scheduleSlot.deleteMany({ where: { groupId } }),
      this.prisma.scheduleSlot.createMany({
        data: dto.slots.map((s) => ({ tenantId, groupId, ...s })),
      }),
    ]);
    return this.get(tenantId, groupId);
  }

  /** What `generate` would do, without writing anything. */
  async preview(tenantId: string, groupId: string, dto: GenerateSessionsDto, now = new Date()) {
    const plan = await this.plan(this.prisma, tenantId, groupId, dto, now);
    return {
      from: plan.from,
      to: plan.to,
      timezone: plan.timezone,
      create: plan.toCreate.length,
      replace: plan.toReplace.length,
      alreadyScheduled: plan.alreadyScheduled,
      skippedHolidays: plan.skippedHolidays,
      firstDates: plan.toCreate.slice(0, 5).map((o) => o.scheduledAt.toISOString()),
    };
  }

  /**
   * Creates the group's sessions for the range from its weekly schedule.
   * Idempotent: occurrences that already have a session are skipped, so it
   * can be re-run (e.g. to extend the range) without duplicating classes.
   */
  async generate(tenantId: string, groupId: string, dto: GenerateSessionsDto, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      // Serialise generations of the same group so a double click can't
      // create every class twice.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${groupId}))`;
      const plan = await this.plan(tx, tenantId, groupId, dto, now);
      const group = await this.findGroup(tx, tenantId, groupId);

      if (plan.toReplace.length > 0) {
        await tx.session.deleteMany({ where: { id: { in: plan.toReplace } } });
      }
      await tx.session.createMany({
        data: plan.toCreate.map((o) => ({
          tenantId,
          groupId,
          teacherId: group.teacherId,
          scheduledAt: o.scheduledAt,
          durationMinutes: o.durationMinutes,
        })),
      });
      return {
        from: plan.from,
        to: plan.to,
        created: plan.toCreate.length,
        replaced: plan.toReplace.length,
        alreadyScheduled: plan.alreadyScheduled,
        skippedHolidays: plan.skippedHolidays,
      };
    });
  }

  private async plan(
    db: Tx | PrismaService,
    tenantId: string,
    groupId: string,
    dto: GenerateSessionsDto,
    now: Date,
  ): Promise<Plan> {
    const group = await this.findGroup(db, tenantId, groupId);
    const tz = group.tenant.timezone;
    const slots = await db.scheduleSlot.findMany({ where: { groupId } });
    if (slots.length === 0) {
      throw new BadRequestException('El grupo no tiene horario semanal');
    }

    const today = todayIn(tz, now);
    const start = group.startDate ? todayIn(tz, group.startDate) : null;
    const from = dto.from ?? (start && start > today ? start : today);
    const to = dto.to ?? (group.endDate ? todayIn(tz, group.endDate) : null);
    if (!to) {
      throw new BadRequestException(
        'Indica hasta qué fecha generar: el grupo no tiene fecha de fin',
      );
    }
    for (const d of [from, to]) {
      if (addDays(d, 0) !== d) throw new BadRequestException(`Fecha no válida: ${d}`);
    }
    if (from > to) throw new BadRequestException('La fecha de inicio es posterior a la de fin');
    let days = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (++days > MAX_RANGE_DAYS) {
        throw new BadRequestException(`El rango no puede superar ${MAX_RANGE_DAYS} días`);
      }
    }

    // Days without classes (festivos, vacaciones) that overlap the range.
    const holidays = await db.holiday.findMany({
      where: { tenantId, startDate: { lte: new Date(to) }, endDate: { gte: new Date(from) } },
      select: { startDate: true, endDate: true },
    });
    const isHoliday = (d: string) =>
      holidays.some((h) => ymdOf(h.startDate) <= d && d <= ymdOf(h.endDate));

    const occurrences: Plan['toCreate'] = [];
    let skippedHolidays = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const weekday = isoWeekday(d);
      for (const slot of slots) {
        if (slot.weekday !== weekday) continue;
        if (isHoliday(d)) {
          skippedHolidays++;
          continue;
        }
        occurrences.push({
          scheduledAt: zonedToUtc(d, slot.startTime, tz),
          durationMinutes: slot.durationMinutes,
        });
      }
    }
    occurrences.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    const existing = await db.session.findMany({
      where: {
        groupId,
        scheduledAt: {
          gte: zonedToUtc(from, '00:00', tz),
          lt: zonedToUtc(addDays(to, 1), '00:00', tz),
        },
      },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        status: true,
        _count: { select: { attendances: true } },
      },
    });

    // Only untouched future classes may be replaced: anything with
    // attendance, already held/cancelled, or in the past is history. A class
    // that already matches the schedule (same time and length) is left alone.
    const wanted = new Map(occurrences.map((o) => [o.scheduledAt.getTime(), o.durationMinutes]));
    const replaceable = dto.replace
      ? existing.filter(
          (s) =>
            s.status === 'SCHEDULED' &&
            s._count.attendances === 0 &&
            s.scheduledAt >= now &&
            wanted.get(s.scheduledAt.getTime()) !== (s.durationMinutes ?? 60),
        )
      : [];
    const replaceIds = new Set(replaceable.map((s) => s.id));
    const kept = new Set(
      existing.filter((s) => !replaceIds.has(s.id)).map((s) => s.scheduledAt.getTime()),
    );
    const toCreate = occurrences.filter((o) => !kept.has(o.scheduledAt.getTime()));

    return {
      from,
      to,
      timezone: tz,
      toCreate,
      toReplace: [...replaceIds],
      alreadyScheduled: occurrences.length - toCreate.length,
      skippedHolidays,
    };
  }

  private async findGroup(db: Tx | PrismaService, tenantId: string, groupId: string) {
    const group = await db.group.findFirst({
      where: { id: groupId, tenantId },
      select: {
        teacherId: true,
        startDate: true,
        endDate: true,
        tenant: { select: { timezone: true } },
      },
    });
    if (!group) throw new NotFoundException();
    return group;
  }
}
