import { IsString, MinLength } from 'class-validator';

export class CreateComplaintDto {
  @IsString()
  category!: string;

  @IsString()
  @MinLength(5)
  description!: string;
}
