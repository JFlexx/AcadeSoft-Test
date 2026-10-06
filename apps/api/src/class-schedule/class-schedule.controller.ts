import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ClassScheduleService } from './class-schedule.service';
import { PutScheduleDto } from './dto/put-schedule.dto';
import { GenerateSessionsDto } from './dto/generate-sessions.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('groups/:groupId/schedule')
export class ClassScheduleController {
  constructor(private readonly schedule: ClassScheduleService) {}

  @Get()
  get(@CurrentUser('tenantId') tenantId: string, @Param('groupId') groupId: string) {
    return this.schedule.get(tenantId, groupId);
  }

  @Put()
  put(
    @CurrentUser('tenantId') tenantId: string,
    @Param('groupId') groupId: string,
    @Body() dto: PutScheduleDto,
  ) {
    return this.schedule.put(tenantId, groupId, dto);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @CurrentUser('tenantId') tenantId: string,
    @Param('groupId') groupId: string,
    @Body() dto: GenerateSessionsDto,
  ) {
    return this.schedule.preview(tenantId, groupId, dto);
  }

  @Post('generate')
  generate(
    @CurrentUser('tenantId') tenantId: string,
    @Param('groupId') groupId: string,
    @Body() dto: GenerateSessionsDto,
  ) {
    return this.schedule.generate(tenantId, groupId, dto);
  }
}
