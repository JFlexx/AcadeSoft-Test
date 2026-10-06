import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** One-off concept (libro, material, excursión…) charged to a whole group. */
export class ChargeGroupDto {
  @IsString()
  @IsNotEmpty()
  groupId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
