import { IsInt, Max, Min } from 'class-validator';

export class NationalHolidaysDto {
  /** School year that starts in September of this year (2026 → 2026-27). */
  @IsInt()
  @Min(2020)
  @Max(2100)
  schoolYear!: number;
}
