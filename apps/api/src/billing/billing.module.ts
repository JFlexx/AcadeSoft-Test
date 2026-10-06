import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingTasks } from './billing.tasks';
import { GroupChargeService } from './group-charge.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingTasks, GroupChargeService],
})
export class BillingModule {}
