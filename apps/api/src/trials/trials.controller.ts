import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TrialsService } from './trials.service';
import { ConvertTrialDto } from './dto/convert-trial.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('trials')
export class TrialsController {
  constructor(private readonly trials: TrialsService) {}

  @Get()
  list(@CurrentUser('tenantId') tenantId: string) {
    return this.trials.list(tenantId);
  }

  @Post(':id/convert')
  @HttpCode(HttpStatus.OK)
  convert(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: ConvertTrialDto,
  ) {
    return this.trials.convert(tenantId, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.trials.cancel(tenantId, id);
  }
}
