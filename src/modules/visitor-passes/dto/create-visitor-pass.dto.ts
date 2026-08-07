import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVisitorPassDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsOptional()
  @IsString()
  plate?: string;

  @IsOptional()
  @IsInt()
  validHours?: number = 24;
}
