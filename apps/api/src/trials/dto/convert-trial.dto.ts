import { IsIn, IsOptional } from 'class-validator';

export class ConvertTrialDto {
  /** ACTIVE (default) enrolls them; WAITLIST if the group filled up meanwhile. */
  @IsOptional()
  @IsIn(['ACTIVE', 'WAITLIST'])
  status?: 'ACTIVE' | 'WAITLIST';
}
