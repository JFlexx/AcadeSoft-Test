import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BulkUpsertAttendanceDto } from '../attendance/dto/bulk-upsert-attendance.dto';
import { TeacherAppService } from './teacher-app.service';
import { FindTeacherSessionsDto } from './dto/find-teacher-sessions.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher')
@Controller('teacher')
export class TeacherAppController {
  constructor(private readonly teacherApp: TeacherAppService) {}

  @Get('me')
  me(@CurrentUser('tenantId') tenantId: string, @CurrentUser('userId') userId: string) {
    return this.teacherApp.me(tenantId, userId);
  }

  @Get('sessions')
  sessions(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Query() query: FindTeacherSessionsDto,
  ) {
    return this.teacherApp.sessions(tenantId, userId, query);
  }

  @Get('sessions/:id')
  session(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.teacherApp.session(tenantId, userId, id);
  }

  @Put('sessions/:id/attendance')
  saveAttendance(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: BulkUpsertAttendanceDto,
  ) {
    return this.teacherApp.saveAttendance(tenantId, userId, id, dto);
  }
}
