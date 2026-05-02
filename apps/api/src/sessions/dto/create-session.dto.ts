import { SessionStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  groupId!: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
