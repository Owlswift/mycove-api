import { IsString, MinLength } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  category!: string;

  @IsString()
  @MinLength(1)
  body!: string;
}
