import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** The term a report card covers (local dates, inclusive) and its title. */
export class ReportCardDto {
  @Matches(YMD, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(YMD, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;

  /** e.g. "1º trimestre 2026-27". */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
