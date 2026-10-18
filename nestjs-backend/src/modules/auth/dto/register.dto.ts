import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsString() @MinLength(8, { message: 'Password must be at least 8 characters' }) @MaxLength(128)
  password: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @IsNotEmpty({ message: 'Business name is required' }) @MaxLength(120)
  businessName: string;
}
