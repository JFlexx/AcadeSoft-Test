import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { FindSessionsDto } from './dto/find-sessions.dto';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateSessionDto) {
    await this.ensureGroupInTenant(tenantId, dto.groupId);
    if (dto.teacherId) await this.ensureTeacherInTenant(tenantId, dto.teacherId);

    const data: Prisma.SessionUncheckedCreateInput = {
      tenantId,
      groupId: dto.groupId,
      teacherId: dto.teacherId,
      scheduledAt: new Date(dto.scheduledAt),
      status: dto.status,
      notes: dto.notes,
    };
    return this.prisma.session.create({ data });
  }

  findAll(tenantId: string, query: FindSessionsDto) {
    const where: Prisma.SessionWhereInput = {
      tenantId,
      ...(query.groupId && { groupId: query.groupId }),
      ...(query.status && { status: query.status }),
    };
    if (query.from || query.to) {
      where.scheduledAt = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }
    return this.prisma.session.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const session = await this.prisma.session.findFirst({
      where: { id, tenantId },
    });
    if (!session) throw new NotFoundException();
    return session;
  }

  async update(tenantId: string, id: string, dto: UpdateSessionDto) {
    await this.findOne(tenantId, id);
    if (dto.teacherId) await this.ensureTeacherInTenant(tenantId, dto.teacherId);

    const data: Prisma.SessionUncheckedUpdateInput = {
      teacherId: dto.teacherId,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
      endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
      status: dto.status,
      notes: dto.notes,
    };
    return this.prisma.session.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    await this.prisma.session.delete({ where: { id } });
  }

  private async ensureGroupInTenant(tenantId: string, groupId: string): Promise<void> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId },
      select: { id: true },
    });
    if (!group) throw new BadRequestException('Group not found in tenant');
  }

  private async ensureTeacherInTenant(tenantId: string, teacherId: string): Promise<void> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: teacherId, tenantId },
      select: { id: true },
    });
    if (!teacher) throw new BadRequestException('Teacher not found in tenant');
  }
}
