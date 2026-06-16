import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get(@CurrentUser('tenantId') tenantId: string) {
    return this.settingsService.get(tenantId);
  }

  @Patch()
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.settingsService.update(tenantId, dto);
  }
}
