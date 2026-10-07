import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RoomsService } from './rooms.service';
import { RoomDto, UpdateRoomDto } from './dto/room.dto';
import { ReportRangeDto } from '../reports/dto/report-range.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  list(@CurrentUser('tenantId') tenantId: string) {
    return this.rooms.list(tenantId);
  }

  /** Classes that overlap in the same room in a date range. */
  @Get('conflicts')
  conflicts(@CurrentUser('tenantId') tenantId: string, @Query() dto: ReportRangeDto) {
    return this.rooms.conflicts(tenantId, dto);
  }

  @Post()
  create(@CurrentUser('tenantId') tenantId: string, @Body() dto: RoomDto) {
    return this.rooms.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.rooms.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.rooms.remove(tenantId, id);
  }
}
