import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The students a guardian user can see in the read-only family portal,
   * with their groups, invoices and recent attendance. Scoped to the
   * guardian's links AND their tenant (defense in depth).
   */
  async myStudents(userId: string, tenantId: string) {
    const links = await this.prisma.guardian.findMany({
      where: { userId },
      select: { studentId: true },
    });
    const studentIds = links.map((l) => l.studentId);
    if (studentIds.length === 0) return [];

    return this.prisma.student.findMany({
      where: { id: { in: studentIds }, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        enrollments: {
          where: { status: 'ACTIVE' },
          select: {
            group: {
              select: { name: true, course: { select: { name: true } } },
            },
          },
        },
        invoices: {
          select: {
            id: true,
            number: true,
            amount: true,
            paidAmount: true,
            status: true,
            issueDate: true,
            type: true,
          },
          orderBy: { issueDate: 'desc' },
        },
        attendances: {
          select: {
            status: true,
            session: { select: { scheduledAt: true } },
          },
          orderBy: { markedAt: 'desc' },
          take: 20,
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }
}
