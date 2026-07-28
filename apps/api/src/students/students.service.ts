import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { GrantPortalAccessDto } from './dto/grant-portal-access.dto';

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

  /**
   * Bulk import. Rows are created independently so one bad row doesn't block
   * the rest; failures are reported per row (1-based) for the UI to surface.
   */
  async importMany(tenantId: string, rows: CreateStudentDto[]) {
    const errors: { row: number; message: string }[] = [];
    let created = 0;
    for (let i = 0; i < rows.length; i++) {
      try {
        await this.create(tenantId, rows[i]);
        created++;
      } catch (err) {
        errors.push({
          row: i + 1,
          message: err instanceof Error ? err.message : 'Error desconocido',
        });
      }
    }
    return { total: rows.length, created, failed: errors.length, errors };
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

  /**
   * Grants a family member read-only portal access to a student. Creates a
   * `guardian` user (or reuses an existing guardian login with the same email,
   * so one parent can cover several children) and links it to the student.
   */
  async grantPortalAccess(
    tenantId: string,
    studentId: string,
    dto: GrantPortalAccessDto,
  ) {
    await this.findOne(tenantId, studentId);

    const role = await this.prisma.role.upsert({
      where: { name: 'guardian' },
      update: {},
      create: {
        name: 'guardian',
        description: 'Family/guardian portal',
        isSystem: true,
      },
    });

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
      include: { role: true },
    });

    let userId: string;
    if (existing) {
      if (existing.role.name !== 'guardian') {
        throw new ConflictException(
          'Ese email ya pertenece a un usuario que no es del portal de familias',
        );
      }
      userId = existing.id;
      const alreadyLinked = await this.prisma.guardian.findFirst({
        where: { studentId, userId },
      });
      if (alreadyLinked) {
        throw new ConflictException(
          'Esta familia ya tiene acceso a este alumno',
        );
      }
    } else {
      const user = await this.prisma.user.create({
        data: {
          tenantId,
          roleId: role.id,
          email,
          passwordHash: await argon2.hash(dto.password),
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
        },
      });
      userId = user.id;
    }

    const guardian = await this.prisma.guardian.create({
      data: {
        studentId,
        userId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        relationship: dto.relationship?.trim() || 'Tutor',
        email,
      },
    });

    return { id: guardian.id, userId, email, studentId };
  }

  /** Family logins that can see this student in the portal. */
  async listPortalAccess(tenantId: string, studentId: string) {
    await this.findOne(tenantId, studentId);
    const guardians = await this.prisma.guardian.findMany({
      where: { studentId, userId: { not: null } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        relationship: true,
        user: { select: { email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return guardians.map((g) => ({
      id: g.id,
      name: `${g.firstName} ${g.lastName}`,
      relationship: g.relationship,
      email: g.user?.email ?? null,
    }));
  }

  /**
   * Revokes a family's access to this student. Removes the link; if the login
   * has no remaining children it is deleted too (orphaned account cleanup).
   */
  async revokePortalAccess(
    tenantId: string,
    studentId: string,
    guardianId: string,
  ): Promise<void> {
    await this.findOne(tenantId, studentId);
    const guardian = await this.prisma.guardian.findFirst({
      where: { id: guardianId, studentId },
    });
    if (!guardian) throw new NotFoundException();

    const userId = guardian.userId;
    await this.prisma.$transaction(async (tx) => {
      await tx.guardian.delete({ where: { id: guardian.id } });
      if (userId) {
        const remaining = await tx.guardian.count({ where: { userId } });
        if (remaining === 0) await tx.user.delete({ where: { id: userId } });
      }
    });
  }
}
