import { Module } from '@nestjs/common';
import { TeacherAppController } from './teacher-app.controller';
import { TeacherAppService } from './teacher-app.service';

@Module({
  controllers: [TeacherAppController],
  providers: [TeacherAppService],
})
export class TeacherAppModule {}
