import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
