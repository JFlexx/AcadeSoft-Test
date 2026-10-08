import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { TodayService } from './today.service';
import { ReportRangeDto } from './dto/report-range.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly todayService: TodayService,
  ) {}

  /** The home screen: today's classes and the loose ends to close. */
  @Get('today')
  today(@CurrentUser('tenantId') tenantId: string) {
    return this.todayService.today(tenantId);
  }

  @Get('overview')
  overview(@CurrentUser('tenantId') tenantId: string, @Query() dto: ReportRangeDto) {
    return this.reports.overview(tenantId, dto);
  }

  /** Libro de facturas emitidas (rows; the web exports them to CSV). */
  @Get('invoice-book')
  invoiceBook(@CurrentUser('tenantId') tenantId: string, @Query() dto: ReportRangeDto) {
    return this.reports.invoiceBook(tenantId, dto);
  }

  @Get('payments')
  payments(@CurrentUser('tenantId') tenantId: string, @Query() dto: ReportRangeDto) {
    return this.reports.paymentsBook(tenantId, dto);
  }
}
