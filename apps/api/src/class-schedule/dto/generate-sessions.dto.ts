import { IsBoolean, IsOptional, Matches } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Date range (academy-local calendar dates, inclusive) to generate sessions
 * for. Defaults: from = today or the group's start date, to = its end date.
 */
export class GenerateSessionsDto {
  @IsOptional()
  @Matches(YMD, { message: 'from debe ser YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(YMD, { message: 'to debe ser YYYY-MM-DD' })
  to?: string;

  /**
   * Also replace the group's future sessions in the range that are still
   * untouched (scheduled, no attendance) — used after changing the schedule.
   */
  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}
