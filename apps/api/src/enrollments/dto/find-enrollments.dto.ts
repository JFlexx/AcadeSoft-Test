import { EnrollmentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class FindEnrollmentsDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
}
