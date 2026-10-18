import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ScrapeLeadsDto {
  /** linkedin | instagram | facebook | twitter — leads-service decides what it supports. */
  @IsString() @IsNotEmpty() @MaxLength(40)
  platform: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @IsNotEmpty({ message: 'Enter something to search for' }) @MaxLength(200)
  query: string;

  @IsOptional() @IsInt() @Min(1) @Max(500)
  maxResults?: number;
}
