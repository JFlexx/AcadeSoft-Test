import { EnrollmentStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateEnrollmentDto {
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @IsOptional()
  @IsDateString()
  droppedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
