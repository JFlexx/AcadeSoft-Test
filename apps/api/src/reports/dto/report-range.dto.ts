import { Matches } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Period of a report: academy-local dates, both inclusive. */
export class ReportRangeDto {
  @Matches(YMD, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(YMD, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;
}
