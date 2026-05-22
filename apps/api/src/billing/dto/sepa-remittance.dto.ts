import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class SepaRemittanceDto {
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsOptional()
  @IsDateString()
  collectionDate?: string;
}
