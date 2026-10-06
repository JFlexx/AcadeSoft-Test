import { IsDateString, IsOptional } from 'class-validator';

/** Instants (ISO). Defaults: from the start of today, for 7 days. */
export class FindTeacherSessionsDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
