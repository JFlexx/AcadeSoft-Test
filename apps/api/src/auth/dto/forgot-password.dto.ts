import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  tenantSlug!: string;

  @IsEmail()
  email!: string;
}
