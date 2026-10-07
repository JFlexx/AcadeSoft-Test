import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** A front-office (secretaría) user, created by the admin. */
export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;
}
