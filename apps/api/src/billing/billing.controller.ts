import { Body, Controller, Header, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { BillingService } from './billing.service';
import { GenerateMonthDto } from './dto/generate-month.dto';
import { SepaRemittanceDto } from './dto/sepa-remittance.dto';
import { ChargeGroupDto } from './dto/charge-group.dto';
import { GroupChargeService } from './group-charge.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly groupCharge: GroupChargeService,
  ) {}

  /** One-off concept for a whole group; dryRun previews it. */
  @Post('charge-group')
  chargeGroup(@CurrentUser('tenantId') tenantId: string, @Body() dto: ChargeGroupDto) {
    return this.groupCharge.charge(tenantId, dto);
  }

  @Post('generate-month')
  generateMonth(@CurrentUser('tenantId') tenantId: string, @Body() dto: GenerateMonthDto) {
    return this.billingService.generateMonth(tenantId, dto);
  }

  @Post('sepa-remittance/preview')
  sepaPreview(@CurrentUser('tenantId') tenantId: string, @Body() dto: SepaRemittanceDto) {
    return this.billingService.sepaPreview(tenantId, dto);
  }

  @Post('sepa-remittance')
  @Header('Content-Type', 'application/xml')
  async sepaRemittance(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: SepaRemittanceDto,
    @Res() res: Response,
  ) {
    const { xml, filename } = await this.billingService.sepaXml(tenantId, dto);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  }
}
