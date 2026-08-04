import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoicesTasks } from './invoices.tasks';
import { PaymentsController } from './payments.controller';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [StripeModule],
  controllers: [InvoicesController, PaymentsController],
  providers: [InvoicesService, InvoicesTasks],
  exports: [InvoicesService],
})
export class InvoicesModule {}
