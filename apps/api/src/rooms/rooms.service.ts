import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, zonedToUtc } from '../class-schedule/zoned-time';
import { RoomDto } from './dto/room.dto';
import { ReportRangeDto } from '../reports/dto/report-range.dto';

const DEFAULT_MINUTES = 60;
const MAX_CONFLICTS = 200;

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.room.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        capacity: true,
        _count: { select: { groups: true } },
      },
    });
  }

  async create(tenantId: string, dto: RoomDto) {
    try {
      return await this.prisma.room.create({
        data: { tenantId, name: dto.name.trim(), capacity: dto.capacity ?? null },
      });
    } catch (err) {
      throw this.duplicate(err);
    }
  }

  async update(tenantId: string, id: string, dto: Partial<RoomDto>) {
    await this.find(tenantId, id);
    try {
      return await this.prisma.room.update({
        where: { id },
        data: { name: dto.name?.trim(), capacity: dto.capacity },
      });
    } catch (err) {
      throw this.duplicate(err);
    }
  }

  /** Groups and classes that used it simply lose their room. */
  async remove(tenantId: string, id: string): Promise<void> {
    await this.find(tenantId, id);
    await this.prisma.room.delete({ where: { id } });
  }

  /**
   * Classes that overlap in time in the same room. A class's room is its
   * own override or, failing that, its group's. Cancelled classes don't
   * count.
   */
  async conflicts(tenantId: string, dto: ReportRangeDto) {
    for (const d of [dto.from, dto.to]) {
      if (addDays(d, 0) !== d) throw new BadRequestException(`Fecha no válida: ${d}`);
    }
    if (dto.from > dto.to)
      throw new BadRequestException('La fecha de inicio es posterior a la de fin');
    const { timezone: tz } = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const sessions = await this.prisma.session.findMany({
      where: {
        tenantId,
        status: { not: 'CANCELLED' },
        scheduledAt: {
          gte: zonedToUtc(dto.from, '00:00', tz),
          lt: zonedToUtc(addDays(dto.to, 1), '00:00', tz),
        },
        OR: [{ roomId: { not: null } }, { group: { roomId: { not: null } } }],
      },
      orderBy: { scheduledAt: 'asc' },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
        room: { select: { id: true, name: true } },
        group: { select: { id: true, name: true, room: { select: { id: true, name: true } } } },
      },
    });

    type Slot = {
      id: string;
      start: Date;
      end: Date;
      group: { id: string; name: string };
      room: { id: string; name: string };
    };
    const byRoom = new Map<string, Slot[]>();
    for (const s of sessions) {
      const room = s.room ?? s.group.room;
      if (!room) continue;
      const end = new Date(
        s.scheduledAt.getTime() + (s.durationMinutes ?? DEFAULT_MINUTES) * 60_000,
      );
      const slot = {
        id: s.id,
        start: s.scheduledAt,
        end,
        group: { id: s.group.id, name: s.group.name },
        room,
      };
      byRoom.set(room.id, [...(byRoom.get(room.id) ?? []), slot]);
    }

    const out: { room: { id: string; name: string }; a: object; b: object }[] = [];
    const view = (x: Slot) => ({ sessionId: x.id, group: x.group, start: x.start, end: x.end });
    for (const slots of byRoom.values()) {
      // Sorted by start: each class can only clash with the ones starting
      // before it ends.
      for (let i = 0; i < slots.length && out.length < MAX_CONFLICTS; i++) {
        for (let j = i + 1; j < slots.length && slots[j].start < slots[i].end; j++) {
          out.push({ room: slots[i].room, a: view(slots[i]), b: view(slots[j]) });
        }
      }
    }
    return out;
  }

  private async find(tenantId: string, id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!room) throw new NotFoundException();
    return room;
  }

  private duplicate(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('Ya existe un aula con ese nombre');
    }
    return err;
  }
}
