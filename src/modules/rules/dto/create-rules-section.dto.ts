import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

export class RuleItemDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class CreateRulesSectionDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleItemDto)
  items?: RuleItemDto[];
}