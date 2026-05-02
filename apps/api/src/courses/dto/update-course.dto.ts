import {
  IsBoolean,
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
