import { IsOptional, IsString, Matches } from 'class-validator';

export class RecordLevyPaymentDto {
  @IsOptional()
  @IsString()
  @Matches(/^data:(image|video)\//, { message: 'mediaBase64 must be an image or video data URL' })
  mediaBase64?: string;
}
