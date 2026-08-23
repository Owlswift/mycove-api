import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** One recorded voice-assistant turn from the mobile app. */
export class VoiceLogEntryDto {
  @IsISO8601()
  timestamp!: string;

  @IsString()
  @MaxLength(2000)
  transcript!: string;

  // Free-form on purpose — the client's intent set evolves faster than the
  // server should validate against, and unrecognized values are exactly
  // the signal this dataset exists to capture.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  intent?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  matchedBy?: string[];

  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  response?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  navigationTarget?: string;
}

/** A batch of voice-turn logs uploaded by the mobile app. */
export class VoiceLogsDto {
  @IsArray()
  @ArrayMaxSize(500) // matches the client's on-device retention cap
  @ValidateNested({ each: true })
  @Type(() => VoiceLogEntryDto)
  logs!: VoiceLogEntryDto[];
}