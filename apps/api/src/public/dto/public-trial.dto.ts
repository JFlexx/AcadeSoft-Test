import { Equals, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** A family books a free trial class in one specific session. */
export class PublicTrialDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guardianName?: string;

  @IsOptional()
  @IsEmail()
  guardianEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  guardianPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /** "He leído la política de privacidad de la academia" (required). */
  @Equals(true, { message: 'Debes aceptar la política de privacidad' })
  acceptPrivacy!: boolean;
}
