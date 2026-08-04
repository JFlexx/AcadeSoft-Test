import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  private async studentIdsFor(userId: string): Promise<string[]> {
    const links = await this.prisma.guardian.findMany({
      where: { userId },
      select: { studentId: true },
    });
    return links.map((l) => l.studentId);
  }

  /** Card-pay one of the guardian's children's invoices via Stripe Checkout. */
  async createInvoiceCheckout(
    userId: string,
    tenantId: string,
    invoiceId: string,
  ) {
    const studentIds = await this.studentIdsFor(userId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, studentId: { in: studentIds } },
      select: { id: true },
    });
    if (!invoice) throw new NotFoundException();
    return this.stripeService.createInvoiceCheckout(tenantId, invoiceId);
  }

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
