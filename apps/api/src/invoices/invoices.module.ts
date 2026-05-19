import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PaymentsController } from './payments.controller';

@Module({
  controllers: [InvoicesController, PaymentsController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
