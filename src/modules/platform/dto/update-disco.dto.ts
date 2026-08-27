import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDiscoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  shortCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
