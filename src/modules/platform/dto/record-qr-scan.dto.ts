import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RecordQrScanDto {
  @IsIn(['IOS', 'ANDROID', 'OTHER'])
  platform!: 'IOS' | 'ANDROID' | 'OTHER';

  @IsString()
  @MinLength(1)
  userAgent!: string;

  /**
   * The visitor's real IP, as seen by mycove-website's own request headers
   * (X-Real-IP, set by nginx) — sent explicitly because this call itself
   * is server-to-server (mycove-website's /get route to mycove-api), so
   * this request's own X-Real-IP would otherwise just be the website
   * container's address, not the actual visitor who scanned the code.
   */
  @IsOptional()
  @IsString()
  ip?: string;
}
