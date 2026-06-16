import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InvoicesService } from './invoices.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.invoicesService.removePayment(tenantId, id);
  }
}
