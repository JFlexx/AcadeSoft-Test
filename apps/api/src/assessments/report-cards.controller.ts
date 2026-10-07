import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { ReportCardsService } from './report-cards.service';
import { ReportCardDto } from './dto/report-card.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller()
export class ReportCardsController {
  constructor(private readonly reportCards: ReportCardsService) {}

  /** PDF report card of one student for a term (all their groups). */
  @Get('students/:id/report-card')
  async studentPdf(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Query() dto: ReportCardDto,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.reportCards.pdf(tenantId, id, dto);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('groups/:groupId/report-cards/preview')
  preview(@CurrentUser('tenantId') tenantId: string, @Param('groupId') groupId: string) {
    return this.reportCards.preview(tenantId, groupId);
  }

  /** Emails every active student's report card (this group's grades). */
  @Post('groups/:groupId/report-cards/send')
  @HttpCode(HttpStatus.OK)
  send(
    @CurrentUser('tenantId') tenantId: string,
    @Param('groupId') groupId: string,
    @Body() dto: ReportCardDto,
  ) {
    return this.reportCards.sendGroup(tenantId, groupId, dto);
  }
}
