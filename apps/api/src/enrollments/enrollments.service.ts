import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { familyEmails } from '../email/family-emails';
import { spotOfferHtml, spotOfferSubject } from './spot-offer-email';
import { chargeEnrollmentFee, ENROLLMENT_FEE_PERIOD, feeSummary } from './enrollment-fee';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto';
import { FindEnrollmentsDto } from './dto/find-enrollments.dto';

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async create(tenantId: string, dto: CreateEnrollmentDto) {
    await this.ensureStudentInTenant(tenantId, dto.studentId);
    await this.ensureGroupInTenant(tenantId, dto.groupId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const enrollment = await tx.enrollment.create({
          data: {
            studentId: dto.studentId,
            groupId: dto.groupId,
            status: dto.status,
            notes: dto.notes,
          },
        });
        const fee =
          enrollment.status === 'ACTIVE' && dto.chargeEnrollmentFee !== false
            ? await chargeEnrollmentFee(tx, tenantId, enrollment.id)
            : null;
        return { ...enrollment, enrollmentFeeInvoice: feeSummary(fee) };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Student already enrolled in this group');
      }
      throw err;
    }
  }

  async findAll(tenantId: string, query: FindEnrollmentsDto) {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        student: { tenantId },
        ...(query.studentId && { studentId: query.studentId }),
        ...(query.groupId && { groupId: query.groupId }),
        ...(query.status && { status: query.status }),
      },
      orderBy: { enrolledAt: 'desc' },
      include: {
        invoices: { where: { billingPeriod: ENROLLMENT_FEE_PERIOD }, select: { id: true } },
      },
    });
    // Lets the UI know whether activating would invoice the matrícula.
    return rows.map(({ invoices, ...e }) => ({ ...e, enrollmentFeeInvoiced: invoices.length > 0 }));
  }

  async findOne(tenantId: string, id: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id, student: { tenantId } },
    });
    if (!enrollment) throw new NotFoundException();
    return enrollment;
  }

  async update(tenantId: string, id: string, dto: UpdateEnrollmentDto) {
    const current = await this.findOne(tenantId, id);
    // Leaving the waiting list: the enrollment date becomes the day they got
    // the spot (while waiting, enrolledAt is their place in the queue).
    const leavesWaitlist =
      current.status === 'WAITLIST' && dto.status !== undefined && dto.status !== 'WAITLIST';
    const becomesActive = dto.status === 'ACTIVE' && current.status !== 'ACTIVE';
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.enrollment.update({
        where: { id },
        data: {
          ...(leavesWaitlist && { enrolledAt: new Date() }),
          status: dto.status,
          droppedAt: dto.droppedAt ? new Date(dto.droppedAt) : undefined,
          notes: dto.notes,
          monthlyFeeOverride:
            dto.monthlyFeeOverride === undefined
              ? undefined
              : dto.monthlyFeeOverride === null
                ? null
                : new Prisma.Decimal(dto.monthlyFeeOverride),
        },
      });
      const fee =
        becomesActive && dto.chargeEnrollmentFee !== false
          ? await chargeEnrollmentFee(tx, tenantId, id)
          : null;
      return { ...updated, enrollmentFeeInvoice: feeSummary(fee) };
    });
  }

  /** Invoices the matrícula later, e.g. if it was skipped when activating. */
  async chargeFee(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    const invoice = await this.prisma.$transaction((tx) => chargeEnrollmentFee(tx, tenantId, id));
    if (invoice) return { enrollmentFeeInvoice: feeSummary(invoice) };

    const e = await this.prisma.enrollment.findUniqueOrThrow({
      where: { id },
      select: {
        group: { select: { enrollmentFee: true } },
        invoices: { where: { billingPeriod: ENROLLMENT_FEE_PERIOD }, select: { id: true } },
      },
    });
    if (e.invoices.length > 0) throw new ConflictException('La matrícula ya está facturada');
    throw new BadRequestException('Este grupo no tiene matrícula');
  }

  /**
   * Waiting list: emails the family that a spot is free so they can claim
   * it. The admin then moves the enrollment to ACTIVE (or gives the spot to
   * the next one). Can be repeated; the latest offer date is kept.
   */
  async offerSpot(tenantId: string, id: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id, student: { tenantId } },
      select: {
        status: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            guardians: { select: { email: true } },
            tenant: {
              select: { name: true, legalName: true, contactEmail: true, contactPhone: true },
            },
          },
        },
        group: { select: { name: true, course: { select: { name: true } } } },
      },
    });
    if (!enrollment) throw new NotFoundException();
    if (enrollment.status !== 'WAITLIST') {
      throw new BadRequestException('Solo se puede ofrecer plaza a quien está en lista de espera');
    }
    if (!this.email.enabled) {
      throw new BadRequestException('El envío de email no está configurado');
    }
    const to = familyEmails(enrollment.student);
    if (to.length === 0) {
      throw new BadRequestException(
        'Ni el alumno ni su familia tienen email: avísales por teléfono',
      );
    }

    const { student, group } = enrollment;
    const data = {
      academy: student.tenant.legalName ?? student.tenant.name,
      studentName: `${student.firstName} ${student.lastName}`,
      groupName: group.name,
      courseName: group.course.name,
      contactEmail: student.tenant.contactEmail,
      contactPhone: student.tenant.contactPhone,
    };
    const ok = await this.email.send(to, spotOfferSubject(data), spotOfferHtml(data), {
      fromName: student.tenant.name,
      replyTo: student.tenant.contactEmail,
    });
    if (!ok) throw new BadRequestException('No se pudo enviar el email. Inténtalo de nuevo.');

    return this.prisma.enrollment.update({
      where: { id },
      data: { spotOfferedAt: new Date() },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    await this.prisma.enrollment.delete({ where: { id } });
  }

  private async ensureStudentInTenant(tenantId: string, studentId: string): Promise<void> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true },
    });
    if (!student) throw new BadRequestException('Student not found in tenant');
  }

  private async ensureGroupInTenant(tenantId: string, groupId: string): Promise<void> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, tenantId },
      select: { id: true },
    });
    if (!group) throw new BadRequestException('Group not found in tenant');
  }
}
