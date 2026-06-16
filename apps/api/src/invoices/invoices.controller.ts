import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateRectificationDto } from './dto/create-rectification.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoicesService } from './invoices.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  create(@CurrentUser('tenantId') tenantId: string, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(tenantId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() filters: ListInvoicesDto,
  ) {
    return this.invoicesService.findAll(tenantId, filters);
  }

  @Get(':id')
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.invoicesService.remove(tenantId, id);
  }

  @Post(':id/rectifications')
  rectify(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateRectificationDto,
  ) {
    return this.invoicesService.createRectification(tenantId, id, dto);
  }

  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async pdf(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.invoicesService.generatePdf(
      tenantId,
      id,
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  }

  @Post(':id/payments')
  addPayment(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.invoicesService.addPayment(tenantId, id, dto);
  }

  @Get(':id/payments')
  listPayments(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.invoicesService.listPayments(tenantId, id);
  }
}
