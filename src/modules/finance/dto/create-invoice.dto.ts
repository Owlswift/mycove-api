import { IsInt, IsOptional, IsPositive, IsString, Matches, MinLength } from 'class-validator';

export class CreateInvoiceDto {
  @IsString()
  projectId!: string;

  @IsInt()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^data:(image|video)\//, { message: 'mediaBase64 must be an image or video data URL' })
  mediaBase64?: string;
}
