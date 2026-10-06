import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingTasks } from './billing.tasks';
import { GroupChargeService } from './group-charge.service';
import { RemittancesService } from './remittances.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingTasks, GroupChargeService, RemittancesService],
})
export class BillingModule {}
