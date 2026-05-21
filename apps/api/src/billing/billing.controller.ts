import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { GenerateMonthDto } from './dto/generate-month.dto';

@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('generate-month')
  generateMonth(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: GenerateMonthDto,
  ) {
    return this.billingService.generateMonth(tenantId, dto);
  }
}
