import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { TodayService } from './today.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, TodayService],
})
export class ReportsModule {}
