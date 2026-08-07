import { IsInt, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateLevyDto {
  @IsString()
  @MinLength(1)
  label!: string;

  @IsInt()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(1)
  dueDate!: string;

  @IsInt()
  year!: number;
}
