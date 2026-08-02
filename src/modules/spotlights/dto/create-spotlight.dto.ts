import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSpotlightDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(['PERSON', 'BUSINESS'])
  category!: 'PERSON' | 'BUSINESS';

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsString()
  imageBase64?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
