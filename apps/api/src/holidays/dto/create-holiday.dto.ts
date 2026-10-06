import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A day (endDate omitted) or a period without classes, local dates inclusive. */
export class CreateHolidayDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Matches(YMD, { message: 'startDate debe ser YYYY-MM-DD' })
  startDate!: string;

  @IsOptional()
  @Matches(YMD, { message: 'endDate debe ser YYYY-MM-DD' })
  endDate?: string;
}
