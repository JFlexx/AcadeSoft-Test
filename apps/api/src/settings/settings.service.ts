import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const SETTINGS_SELECT = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  legalName: true,
  taxId: true,
  address: true,
  contactEmail: true,
  contactPhone: true,
  iban: true,
  sepaCreditorId: true,
  invoicePrefix: true,
  autoBillingEnabled: true,
  autoBillingDay: true,
  remindersEnabled: true,
  absenceNoticesEnabled: true,
  trialClassesEnabled: true,
} as const;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async get(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: SETTINGS_SELECT,
    });
    if (!tenant) throw new NotFoundException();
    return { ...tenant, emailConfigured: this.email.enabled };
  }

  async update(tenantId: string, dto: UpdateSettingsDto) {
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        name: dto.name,
        legalName: dto.legalName,
        taxId: dto.taxId,
        address: dto.address,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        iban: dto.iban,
        sepaCreditorId: dto.sepaCreditorId,
        invoicePrefix: dto.invoicePrefix,
        autoBillingEnabled: dto.autoBillingEnabled,
        autoBillingDay: dto.autoBillingDay,
        remindersEnabled: dto.remindersEnabled,
        absenceNoticesEnabled: dto.absenceNoticesEnabled,
        trialClassesEnabled: dto.trialClassesEnabled,
      },
      select: SETTINGS_SELECT,
    });
    return { ...tenant, emailConfigured: this.email.enabled };
  }
}
