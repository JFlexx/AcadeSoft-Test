import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
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
import { RemittancesService } from './remittances.service';
import { ReturnReceiptDto } from './dto/return-receipt.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly groupCharge: GroupChargeService,
    private readonly remittances: RemittancesService,
  ) {}

  @Get('remittances')
  listRemittances(@CurrentUser('tenantId') tenantId: string) {
    return this.remittances.list(tenantId);
  }

  @Get('remittances/:id')
  remittance(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.remittances.detail(tenantId, id);
  }

  /** Downloads the recorded XML again (does not create a new remittance). */
  @Get('remittances/:id/xml')
  @Header('Content-Type', 'application/xml')
  async remittanceXml(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { xml, filename } = await this.remittances.xml(tenantId, id);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  }

  @Post('remittances/:id/collect')
  @HttpCode(HttpStatus.OK)
  collect(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.remittances.collect(tenantId, id);
  }

  /** The bank returned one receipt of a remittance (devolución). */
  @Post('remittance-items/:id/return')
  @HttpCode(HttpStatus.OK)
  returnReceipt(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: ReturnReceiptDto,
  ) {
    return this.remittances.returnReceipt(tenantId, id, dto);
  }

  @Delete('remittances/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  voidRemittance(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.remittances.void(tenantId, id);
  }

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
