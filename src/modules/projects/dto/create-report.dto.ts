import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateReportDto {
  @IsString()
  @MinLength(1)
  author!: string;

  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsString()
  @Matches(/^data:(image|video)\//, { message: 'mediaBase64 must be an image or video data URL' })
  mediaBase64?: string;
}
