import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateStudentDto) {
    const { birthDate, mandateDate, ...rest } = dto;
    return this.prisma.student.create({
      data: {
        tenantId,
        ...rest,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        mandateDate: mandateDate ? new Date(mandateDate) : undefined,
      },
    });
  }

  findAll(tenantId: string) {
    return this.prisma.student.findMany({
      where: { tenantId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId },
    });
    if (!student) throw new NotFoundException();
    return student;
  }

  async update(tenantId: string, id: string, dto: UpdateStudentDto) {
    await this.findOne(tenantId, id);
    const { birthDate, mandateDate, ...rest } = dto;
    return this.prisma.student.update({
      where: { id },
      data: {
        ...rest,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        mandateDate: mandateDate ? new Date(mandateDate) : undefined,
      },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    await this.prisma.student.delete({ where: { id } });
  }
}
