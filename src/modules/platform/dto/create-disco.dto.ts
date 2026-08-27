import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDiscoDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  shortCode!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
