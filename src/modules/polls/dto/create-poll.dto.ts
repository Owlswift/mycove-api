import { ArrayMinSize, IsArray, IsInt, IsPositive, IsString, MinLength } from 'class-validator';

export class CreatePollDto {
  @IsString()
  @MinLength(1)
  question!: string;

  @IsInt()
  @IsPositive()
  closesInDays!: number;

  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  options!: string[];
}
