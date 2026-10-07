import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { GdprService } from './gdpr.service';

@Module({
  controllers: [StudentsController],
  providers: [StudentsService, GdprService],
  exports: [StudentsService],
})
export class StudentsModule {}
