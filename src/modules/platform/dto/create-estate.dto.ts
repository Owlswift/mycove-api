import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateEstateDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  managedBy?: string;
}
