import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class ConvertTrialDto {
  /** ACTIVE (default) enrolls them; WAITLIST if the group filled up meanwhile. */
  @IsOptional()
  @IsIn(['ACTIVE', 'WAITLIST'])
  status?: 'ACTIVE' | 'WAITLIST';

  /** When the enrollment becomes active, also invoice the group's matrícula (default true). */
  @IsOptional()
  @IsBoolean()
  chargeEnrollmentFee?: boolean;
}
