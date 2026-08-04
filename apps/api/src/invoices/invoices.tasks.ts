import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoicesService } from './invoices.service';

@Injectable()
export class InvoicesTasks {
  private readonly logger = new Logger(InvoicesTasks.name);

  constructor(private readonly invoices: InvoicesService) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async flagOverdue(): Promise<void> {
    const count = await this.invoices.markOverdueInvoices();
    if (count > 0) this.logger.log(`Marcadas ${count} factura(s) como vencidas`);
  }
}
