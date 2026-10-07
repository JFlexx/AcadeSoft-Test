import { Module } from '@nestjs/common';
import { AssessmentsController, TeacherAssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { ReportCardsController } from './report-cards.controller';
import { ReportCardsService } from './report-cards.service';

@Module({
  controllers: [AssessmentsController, TeacherAssessmentsController, ReportCardsController],
  providers: [AssessmentsService, ReportCardsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
