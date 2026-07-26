import { IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

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

  @IsInt()
  @IsIn([4, 24, 72])
  validHours!: number;
}
