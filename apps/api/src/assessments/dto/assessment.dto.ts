import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class CreateAssessmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @Matches(YMD, { message: 'date debe ser YYYY-MM-DD' })
  date!: string;
}

export class UpdateAssessmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Matches(YMD, { message: 'date debe ser YYYY-MM-DD' })
  date?: string;
}

export class AssessmentResultItemDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  /** 0–10; null clears it. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10)
  score?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string | null;
}

export class SaveResultsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AssessmentResultItemDto)
  items!: AssessmentResultItemDto[];
}
