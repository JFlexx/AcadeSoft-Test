import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** Creates the teacher's login with an initial password set by the admin. */
export class GrantTeacherAccessDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;
}
