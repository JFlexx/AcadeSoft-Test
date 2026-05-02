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
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { BulkUpsertAttendanceDto } from './dto/bulk-upsert-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('sessions/:sessionId/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post()
  bulkUpsert(
    @CurrentUser('tenantId') tenantId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: BulkUpsertAttendanceDto,
  ) {
    return this.attendanceService.bulkUpsert(tenantId, sessionId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.attendanceService.findAll(tenantId, sessionId);
  }

  @Patch(':studentId')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('sessionId') sessionId: string,
    @Param('studentId') studentId: string,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.attendanceService.update(tenantId, sessionId, studentId, dto);
  }

  @Delete(':studentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('sessionId') sessionId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.attendanceService.remove(tenantId, sessionId, studentId);
  }
}
