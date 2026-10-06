import { Module } from '@nestjs/common';
import { TeacherAppController } from './teacher-app.controller';
import { TeacherAppService } from './teacher-app.service';
import { AbsenceNoticesModule } from '../absence-notices/absence-notices.module';

@Module({
  imports: [AbsenceNoticesModule],
  controllers: [TeacherAppController],
  providers: [TeacherAppService],
})
export class TeacherAppModule {}
