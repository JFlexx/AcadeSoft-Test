import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AssessmentsService } from './assessments.service';
import { CreateAssessmentDto, SaveResultsDto, UpdateAssessmentDto } from './dto/assessment.dto';

/** Admin: grades of any group of the academy. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
@Controller()
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get('groups/:groupId/assessments')
  list(@CurrentUser('tenantId') tenantId: string, @Param('groupId') groupId: string) {
    return this.assessments.list({ tenantId }, groupId);
  }

  @Post('groups/:groupId/assessments')
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Param('groupId') groupId: string,
    @Body() dto: CreateAssessmentDto,
  ) {
    return this.assessments.create({ tenantId }, groupId, dto);
  }

  @Get('assessments/:id')
  detail(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.assessments.detail({ tenantId }, id);
  }

  @Patch('assessments/:id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentDto,
  ) {
    return this.assessments.update({ tenantId }, id, dto);
  }

  @Delete('assessments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.assessments.remove({ tenantId }, id);
  }

  @Put('assessments/:id/results')
  saveResults(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: SaveResultsDto,
  ) {
    return this.assessments.saveResults({ tenantId }, id, dto);
  }
}

/** Teacher app: grades of the groups they teach. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher')
@Controller('teacher')
export class TeacherAssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  private scope(tenantId: string, userId: string) {
    return this.assessments.teacherScope(tenantId, userId);
  }

  @Get('groups')
  async groups(@CurrentUser('tenantId') tenantId: string, @CurrentUser('userId') userId: string) {
    return this.assessments.teacherGroups(await this.scope(tenantId, userId));
  }

  @Get('groups/:groupId/assessments')
  async list(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.assessments.list(await this.scope(tenantId, userId), groupId);
  }

  @Post('groups/:groupId/assessments')
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('groupId') groupId: string,
    @Body() dto: CreateAssessmentDto,
  ) {
    return this.assessments.create(await this.scope(tenantId, userId), groupId, dto);
  }

  @Get('assessments/:id')
  async detail(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.assessments.detail(await this.scope(tenantId, userId), id);
  }

  @Patch('assessments/:id')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAssessmentDto,
  ) {
    return this.assessments.update(await this.scope(tenantId, userId), id, dto);
  }

  @Delete('assessments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.assessments.remove(await this.scope(tenantId, userId), id);
  }

  @Put('assessments/:id/results')
  async saveResults(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: SaveResultsDto,
  ) {
    return this.assessments.saveResults(await this.scope(tenantId, userId), id, dto);
  }
}
