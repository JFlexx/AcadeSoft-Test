import { Module } from '@nestjs/common';
import { AbsenceNoticesService } from './absence-notices.service';

@Module({
  providers: [AbsenceNoticesService],
  exports: [AbsenceNoticesService],
})
export class AbsenceNoticesModule {}
