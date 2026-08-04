import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingTasks } from './billing.tasks';

@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingTasks],
})
export class BillingModule {}
