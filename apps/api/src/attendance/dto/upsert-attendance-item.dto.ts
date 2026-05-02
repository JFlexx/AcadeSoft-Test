import { AttendanceStatus } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertAttendanceItemDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
