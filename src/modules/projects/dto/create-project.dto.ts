import { ArrayMinSize, IsArray, IsInt, IsOptional, IsPositive, IsString, Matches, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class BudgetLineDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @IsInt()
  @IsPositive()
  amount!: number;
}

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsInt()
  @IsPositive()
  goal!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  budget!: BudgetLineDto[];

  @IsOptional()
  @IsString()
  @Matches(/^data:(image|video)\//, { message: 'mediaBase64 must be an image or video data URL' })
  mediaBase64?: string;
}
