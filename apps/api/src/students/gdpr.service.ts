import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Data-subject rights (RGPD) for a student and their family, handled by the
 * academy (the controller) through us (the processor):
 * - access / portability: everything we hold about them, as JSON;
 * - erasure: everything goes, except what tax law obliges the academy to
 *   keep (art. 17.3.b): the invoices and the name/address they were issued
 *   to. Both are recorded in the audit log, without personal data.
 */
@Injectable()
export class GdprService {
  constructor(private readonly prisma: PrismaService) {}

  async export(tenantId: string, studentId: string, userId: string) {
    const s = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      include: {
        tenant: { select: { name: true, legalName: true, taxId: true, contactEmail: true } },
        guardians: {
          select: {
            firstName: true,
            lastName: true,
            relationship: true,
            email: true,
            phone: true,
            userId: true,
          },
        },
        enrollments: {
          select: {
            status: true,
            enrolledAt: true,
            droppedAt: true,
            notes: true,
            monthlyFeeOverride: true,
            group: { select: { name: true, course: { select: { name: true } } } },
          },
        },
        attendances: {
          orderBy: { markedAt: 'asc' },
          select: {
            status: true,
            notes: true,
            session: { select: { scheduledAt: true, group: { select: { name: true } } } },
          },
        },
        assessmentResults: {
          select: {
            score: true,
            comment: true,
            assessment: { select: { name: true, date: true, group: { select: { name: true } } } },
          },
        },
        trialClasses: {
          select: {
            status: true,
            createdAt: true,
            session: { select: { scheduledAt: true, group: { select: { name: true } } } },
          },
        },
        invoices: {
          orderBy: { number: 'asc' },
          select: {
            number: true,
            issueDate: true,
            dueDate: true,
            description: true,
            amount: true,
            paidAmount: true,
            status: true,
            payments: { select: { paidAt: true, amount: true, method: true } },
          },
        },
      },
    });
    if (!s) throw new NotFoundException();

    await this.audit(tenantId, userId, 'gdpr.export', studentId, {});

    const { tenant, guardians, ...student } = s;
    return {
      exportedAt: new Date().toISOString(),
      controller: {
        name: tenant.legalName ?? tenant.name,
        taxId: tenant.taxId,
        contactEmail: tenant.contactEmail,
      },
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        phone: student.phone,
        birthDate: student.birthDate,
        gender: student.gender,
        address: student.address,
        notes: student.notes,
        iban: student.iban,
        mandateReference: student.mandateReference,
        mandateDate: student.mandateDate,
        discountPercent: student.discountPercent,
        createdAt: student.createdAt,
        erasedAt: student.erasedAt,
      },
      family: guardians.map(({ userId, ...g }) => ({ ...g, portalAccess: !!userId })),
      enrollments: student.enrollments.map(({ group, ...e }) => ({
        ...e,
        group: group.name,
        course: group.course.name,
      })),
      attendance: student.attendances.map((a) => ({
        date: a.session.scheduledAt,
        group: a.session.group.name,
        status: a.status,
        notes: a.notes,
      })),
      grades: student.assessmentResults.map((r) => ({
        assessment: r.assessment.name,
        date: r.assessment.date,
        group: r.assessment.group.name,
        score: r.score,
        comment: r.comment,
      })),
      trialClasses: student.trialClasses.map((t) => ({
        date: t.session.scheduledAt,
        group: t.session.group.name,
        status: t.status,
      })),
      invoices: student.invoices,
    };
  }

  /**
   * Erases the student's personal data. Without invoices the student is
   * deleted outright; with invoices, only the name and address they were
   * issued to remain (kept for the legal period), everything else is gone.
   */
  async erase(tenantId: string, studentId: string, userId: string) {
    const s = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: {
        id: true,
        guardians: { select: { id: true, userId: true } },
        _count: { select: { invoices: true } },
      },
    });
    if (!s) throw new NotFoundException();

    const guardianUsers = [
      ...new Set(s.guardians.map((g) => g.userId).filter((u): u is string => !!u)),
    ];
    const keptInvoices = s._count.invoices;

    await this.prisma.$transaction(async (tx) => {
      if (keptInvoices === 0) {
        await tx.student.delete({ where: { id: studentId } });
      } else {
        await tx.guardian.deleteMany({ where: { studentId } });
        await tx.attendance.deleteMany({ where: { studentId } });
        await tx.assessmentResult.deleteMany({ where: { studentId } });
        await tx.trialClass.deleteMany({ where: { studentId } });
        await tx.enrollment.deleteMany({ where: { studentId } }); // invoices keep their data
        await tx.student.update({
          where: { id: studentId },
          data: {
            email: null,
            phone: null,
            birthDate: null,
            gender: null,
            photoUrl: null,
            notes: null,
            iban: null,
            mandateReference: null,
            mandateDate: null,
            discountPercent: null,
            isActive: false,
            erasedAt: new Date(),
          },
        });
      }
      // Family logins left without any child go too.
      for (const uid of guardianUsers) {
        const remaining = await tx.guardian.count({ where: { userId: uid } });
        if (remaining === 0) await tx.user.delete({ where: { id: uid } });
      }
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'gdpr.erase',
          entityType: 'student',
          entityId: studentId,
          newData: { keptInvoices, deleted: keptInvoices === 0 } as Prisma.InputJsonValue,
        },
      });
    });

    return { deleted: keptInvoices === 0, keptInvoices };
  }

  private audit(
    tenantId: string,
    userId: string,
    action: string,
    studentId: string,
    data: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action,
        entityType: 'student',
        entityId: studentId,
        newData: data as Prisma.InputJsonValue,
      },
    });
  }
}
