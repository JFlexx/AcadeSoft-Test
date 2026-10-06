import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AbsenceNoticesModule } from '../absence-notices/absence-notices.module';

@Module({
  imports: [AbsenceNoticesModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
