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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { GdprService } from './gdpr.service';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ImportStudentsDto } from './dto/import-students.dto';
import { GrantPortalAccessDto } from './dto/grant-portal-access.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'staff')
@Controller('students')
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly gdpr: GdprService,
  ) {}

  @Post()
  create(@CurrentUser('tenantId') tenantId: string, @Body() dto: CreateStudentDto) {
    return this.studentsService.create(tenantId, dto);
  }

  @Post('import')
  import(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ImportStudentsDto,
  ) {
    return this.studentsService.importMany(tenantId, dto.students);
  }

  @Get(':id/portal-access')
  listPortalAccess(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.studentsService.listPortalAccess(tenantId, id);
  }

  @Post(':id/portal-access')
  grantPortalAccess(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: GrantPortalAccessDto,
  ) {
    return this.studentsService.grantPortalAccess(tenantId, id, dto);
  }

  @Delete(':id/portal-access/:guardianId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokePortalAccess(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
  ) {
    return this.studentsService.revokePortalAccess(tenantId, id, guardianId);
  }

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.studentsService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.studentsService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.studentsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.studentsService.remove(tenantId, id);
  }

  /** RGPD access/portability: everything about the student, as a JSON file. */
  @Roles('admin')
  @Get(':id/export')
  async export(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const data = await this.gdpr.export(tenantId, id, userId);
    const slug = `${data.student.firstName}-${data.student.lastName}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .toLowerCase();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="datos-${slug}.json"`);
    res.send(JSON.stringify(data, null, 2));
  }

  /** RGPD erasure (keeps only what tax law requires). */
  @Roles('admin')
  @Post(':id/erase')
  @HttpCode(HttpStatus.OK)
  erase(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.gdpr.erase(tenantId, id, userId);
  }
}
