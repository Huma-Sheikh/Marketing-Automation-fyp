import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/** No length rules on the password here: a wrong password is a 401, not a 400. */
export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsString() @IsNotEmpty({ message: 'Password is required' })
  password: string;
}
