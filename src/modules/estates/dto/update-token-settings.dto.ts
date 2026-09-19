import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** The estate admin's paid-token settings. Whether the feature is on at all is the platform's switch, not part of this. */
export class UpdateTokenSettingsDto {
  @IsOptional() @IsInt() @Min(0) @Max(1000)
  tokenAllowanceRegular?: number;

  @IsOptional() @IsInt() @Min(0) @Max(1000)
  tokenAllowanceCommercial?: number;

  /** Naira per extra token; 0 keeps extra tokens free. */
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000)
  tokenPriceRegular?: number;

  @IsOptional() @IsInt() @Min(0) @Max(1_000_000)
  tokenPriceCommercial?: number;
}
