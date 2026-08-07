import { IsInt, IsOptional, IsPositive, IsString, Matches } from 'class-validator';

export class RecordPaymentDto {
  @IsInt()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  @Matches(/^data:(image|video)\//, { message: 'mediaBase64 must be an image or video data URL' })
  mediaBase64?: string;
}
