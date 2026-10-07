import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HolidaysService } from './holidays.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { NationalHolidaysDto } from './dto/national-holidays.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get()
  list(@CurrentUser('tenantId') tenantId: string) {
    return this.holidays.list(tenantId);
  }

  @Post()
  create(@CurrentUser('tenantId') tenantId: string, @Body() dto: CreateHolidayDto) {
    return this.holidays.create(tenantId, dto);
  }

  @Post('national')
  importNational(@CurrentUser('tenantId') tenantId: string, @Body() dto: NationalHolidaysDto) {
    return this.holidays.importNational(tenantId, dto.schoolYear);
  }

  /** Returns how many cancelled classes went back on the calendar. */
  @Delete(':id')
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.holidays.remove(tenantId, id);
  }
}
