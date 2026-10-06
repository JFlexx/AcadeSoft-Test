import { EnrollmentStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEnrollmentDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  groupId!: string;

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** When the enrollment becomes active, also invoice the group's matrícula (default true). */
  @IsOptional()
  @IsBoolean()
  chargeEnrollmentFee?: boolean;
}
