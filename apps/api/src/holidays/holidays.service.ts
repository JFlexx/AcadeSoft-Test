import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, todayIn, ymdOf, zonedToUtc } from '../class-schedule/zoned-time';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { spainNationalHolidays } from './spain-national';

const MAX_SPAN_DAYS = 366;

type Tx = Prisma.TransactionClient;

@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const rows = await this.prisma.holiday.findMany({
      where: { tenantId },
      orderBy: { startDate: 'asc' },
      include: { _count: { select: { cancelledSessions: true } } },
    });
    return rows.map(({ _count, ...h }) => ({
      ...this.view(h),
      cancelledSessions: _count.cancelledSessions,
    }));
  }

  /**
   * Adds a day or period without classes and cancels the classes that fall
   * in it — only those still untouched (scheduled, no attendance).
   */
  async create(tenantId: string, dto: CreateHolidayDto) {
    const name = dto.name.trim();
    const start = dto.startDate;
    const end = dto.endDate ?? dto.startDate;
    if (!name) throw new BadRequestException('El nombre es obligatorio');
    for (const d of [start, end]) {
      if (addDays(d, 0) !== d) throw new BadRequestException(`Fecha no válida: ${d}`);
    }
    if (end < start) throw new BadRequestException('La fecha de fin es anterior a la de inicio');
    if (addDays(start, MAX_SPAN_DAYS) < end) {
      throw new BadRequestException(`Un periodo no puede superar ${MAX_SPAN_DAYS} días`);
    }

    return this.prisma.$transaction((tx) => this.createIn(tx, tenantId, name, start, end));
  }

  /**
   * Removes a holiday and puts its cancelled classes back on the calendar,
   * unless another holiday still covers them (then they stay cancelled,
   * attributed to that one).
   */
  async remove(tenantId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const holiday = await tx.holiday.findFirst({ where: { id, tenantId } });
      if (!holiday) throw new NotFoundException();
      const tz = await this.timezone(tx, tenantId);

      const cancelled = await tx.session.findMany({
        where: { cancelledByHolidayId: id },
        select: { id: true, scheduledAt: true },
      });
      const others = await tx.holiday.findMany({
        where: { tenantId, id: { not: id } },
        select: { id: true, startDate: true, endDate: true },
      });

      const restore: string[] = [];
      const reassign = new Map<string, string[]>();
      for (const s of cancelled) {
        const day = todayIn(tz, s.scheduledAt);
        const cover = others.find((h) => ymdOf(h.startDate) <= day && day <= ymdOf(h.endDate));
        if (cover) reassign.set(cover.id, [...(reassign.get(cover.id) ?? []), s.id]);
        else restore.push(s.id);
      }

      if (restore.length > 0) {
        await tx.session.updateMany({
          where: { id: { in: restore } },
          data: { status: 'SCHEDULED', cancelledByHolidayId: null },
        });
      }
      for (const [holidayId, ids] of reassign) {
        await tx.session.updateMany({
          where: { id: { in: ids } },
          data: { cancelledByHolidayId: holidayId },
        });
      }
      await tx.holiday.delete({ where: { id } });
      return { restoredSessions: restore.length };
    });
  }

  /** Adds the Spanish national holidays of a school year, skipping existing ones. */
  async importNational(tenantId: string, schoolYear: number) {
    return this.prisma.$transaction(async (tx) => {
      const list = spainNationalHolidays(schoolYear);
      const existing = await tx.holiday.findMany({
        where: {
          tenantId,
          startDate: { in: list.map((h) => new Date(h.date)) },
        },
        select: { startDate: true, endDate: true },
      });
      const taken = new Set(
        existing
          .filter((h) => ymdOf(h.startDate) === ymdOf(h.endDate))
          .map((h) => ymdOf(h.startDate)),
      );

      let created = 0;
      let cancelledSessions = 0;
      for (const h of list) {
        if (taken.has(h.date)) continue;
        const row = await this.createIn(tx, tenantId, h.name, h.date, h.date);
        created++;
        cancelledSessions += row.cancelledSessions;
      }
      return { created, skipped: list.length - created, cancelledSessions };
    });
  }

  private async createIn(tx: Tx, tenantId: string, name: string, start: string, end: string) {
    const tz = await this.timezone(tx, tenantId);
    const holiday = await tx.holiday.create({
      data: { tenantId, name, startDate: new Date(start), endDate: new Date(end) },
    });
    const { count } = await tx.session.updateMany({
      where: {
        tenantId,
        status: 'SCHEDULED',
        attendances: { none: {} },
        scheduledAt: {
          gte: zonedToUtc(start, '00:00', tz),
          lt: zonedToUtc(addDays(end, 1), '00:00', tz),
        },
      },
      data: { status: 'CANCELLED', cancelledByHolidayId: holiday.id },
    });
    return { ...this.view(holiday), cancelledSessions: count };
  }

  private async timezone(tx: Tx, tenantId: string) {
    const t = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return t.timezone;
  }

  private view(h: { id: string; name: string; startDate: Date; endDate: Date }) {
    return { id: h.id, name: h.name, startDate: ymdOf(h.startDate), endDate: ymdOf(h.endDate) };
  }
}
