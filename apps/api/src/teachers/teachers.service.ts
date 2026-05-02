import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateTeacherDto) {
    return this.prisma.teacher.create({
      data: { tenantId, ...dto },
    });
  }

  findAll(tenantId: string) {
    return this.prisma.teacher.findMany({
      where: { tenantId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId },
    });
    if (!teacher) throw new NotFoundException();
    return teacher;
  }

  async update(tenantId: string, id: string, dto: UpdateTeacherDto) {
    await this.findOne(tenantId, id);
    return this.prisma.teacher.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    await this.prisma.teacher.delete({ where: { id } });
  }
}
