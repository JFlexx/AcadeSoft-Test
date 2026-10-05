import { IsOptional, IsString } from 'class-validator';

/** Exactly one of groupId / studentId (enforced in the service). */
export class MessageTargetDto {
  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;
}
