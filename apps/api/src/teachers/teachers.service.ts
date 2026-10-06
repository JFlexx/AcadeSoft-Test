import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { GrantTeacherAccessDto } from './dto/grant-teacher-access.dto';
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
    const teacher = await this.findOne(tenantId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.teacher.delete({ where: { id } });
      // Their login must not outlive the profile.
      if (teacher.userId) await tx.user.delete({ where: { id: teacher.userId } });
    });
  }

  /** The teacher's login, if they have one. */
  async getAccess(tenantId: string, id: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId },
      select: { user: { select: { email: true, lastLoginAt: true } } },
    });
    if (!teacher) throw new NotFoundException();
    return { access: teacher.user };
  }

  /**
   * Gives the teacher a login (role "teacher") so they can see their classes
   * and take attendance. The admin sets an initial password; the teacher can
   * change it, or reset it by email.
   */
  async grantAccess(tenantId: string, id: string, dto: GrantTeacherAccessDto) {
    const teacher = await this.findOne(tenantId, id);
    if (teacher.userId) throw new ConflictException('Este profesor ya tiene acceso');

    const email = dto.email.trim().toLowerCase();
    const taken = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
      select: { id: true },
    });
    if (taken) throw new ConflictException('Ese email ya lo usa otro usuario de la academia');

    const role = await this.prisma.role.upsert({
      where: { name: 'teacher' },
      update: {},
      create: { name: 'teacher', description: 'Profesor', isSystem: true },
    });
    const passwordHash = await argon2.hash(dto.password);

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          roleId: role.id,
          email,
          passwordHash,
          firstName: teacher.firstName,
          lastName: teacher.lastName,
        },
      });
      await tx.teacher.update({ where: { id }, data: { userId: user.id } });
    });
    return { access: { email, lastLoginAt: null } };
  }

  /** Removes the teacher's login; the profile and their classes stay. */
  async revokeAccess(tenantId: string, id: string): Promise<void> {
    const teacher = await this.findOne(tenantId, id);
    if (!teacher.userId) throw new NotFoundException('Este profesor no tiene acceso');
    await this.prisma.user.delete({ where: { id: teacher.userId } });
  }
}
