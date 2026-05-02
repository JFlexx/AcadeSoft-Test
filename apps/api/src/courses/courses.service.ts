import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: { tenantId, ...dto },
    });
  }

  findAll(tenantId: string) {
    return this.prisma.course.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const course = await this.prisma.course.findFirst({
      where: { id, tenantId },
    });
    if (!course) throw new NotFoundException();
    return course;
  }

  async update(tenantId: string, id: string, dto: UpdateCourseDto) {
    await this.findOne(tenantId, id);
    return this.prisma.course.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    try {
      await this.prisma.course.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new ConflictException(
          'Course has dependent groups; delete or reassign them first',
        );
      }
      throw err;
    }
  }
}
