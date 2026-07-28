import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PublicEnrollDto } from './dto/public-enroll.dto';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  private async tenantBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!tenant) throw new NotFoundException('Academia no encontrada');
    return tenant;
  }

  /** Active groups a prospective family can enroll into, with spots left. */
  async enrollableGroups(slug: string) {
    const tenant = await this.tenantBySlug(slug);
    const groups = await this.prisma.group.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: {
        id: true,
        name: true,
        maxCapacity: true,
        monthlyFee: true,
        course: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const counts = await this.prisma.enrollment.groupBy({
      by: ['groupId'],
      where: { groupId: { in: groups.map((g) => g.id) }, status: 'ACTIVE' },
      _count: true,
    });
    const activeByGroup = new Map(counts.map((c) => [c.groupId, c._count]));

    return {
      academy: tenant.name,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        course: g.course.name,
        monthlyFee: g.monthlyFee,
        spotsAvailable:
          g.maxCapacity == null
            ? null
            : Math.max(0, g.maxCapacity - (activeByGroup.get(g.id) ?? 0)),
      })),
    };
  }

  async enroll(slug: string, dto: PublicEnrollDto) {
    const tenant = await this.tenantBySlug(slug);

    const group = await this.prisma.group.findFirst({
      where: { id: dto.groupId, tenantId: tenant.id, isActive: true },
      select: { id: true, maxCapacity: true },
    });
    if (!group) throw new BadRequestException('Grupo no disponible');

    if (group.maxCapacity != null) {
      const active = await this.prisma.enrollment.count({
        where: { groupId: group.id, status: 'ACTIVE' },
      });
      if (active >= group.maxCapacity) {
        throw new BadRequestException('Este grupo está completo');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          tenantId: tenant.id,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email: dto.email?.trim(),
          phone: dto.phone?.trim(),
        },
      });

      const enrollment = await tx.enrollment.create({
        data: {
          studentId: student.id,
          groupId: group.id,
          status: 'PENDING',
          notes: dto.notes?.trim(),
        },
      });

      if (dto.guardianName?.trim()) {
        const parts = dto.guardianName.trim().split(/\s+/);
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' ') || parts[0];
        await tx.guardian.create({
          data: {
            studentId: student.id,
            firstName,
            lastName,
            relationship: 'Tutor',
            email: dto.guardianEmail?.trim(),
            phone: dto.guardianPhone?.trim(),
          },
        });
      }

      return { ok: true, studentId: student.id, enrollmentId: enrollment.id };
    });
  }
}
