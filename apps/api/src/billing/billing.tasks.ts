import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingService } from './billing.service';

@Injectable()
export class BillingTasks {
  private readonly logger = new Logger(BillingTasks.name);

  constructor(private readonly billing: BillingService) {}

  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async runScheduledBilling(): Promise<void> {
    const res = await this.billing.runScheduledBilling();
    if (res.tenants > 0) {
      this.logger.log(
        `Facturación automática ${res.period}: ${res.created} factura(s) en ${res.tenants} academia(s)`,
      );
    }
  }
}
