import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDefined, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ImportDuesRowDto {
  @IsString()
  phone!: string;

  /** Naira paid for the period — text or number, "₦45,000" is fine. */
  @IsDefined()
  amount!: string | number;

  /** Optional — the months the amount covers, e.g. "Jan 2024 - Dec 2025". Billing starts from the resident's move-in month, not this. */
  @IsOptional()
  @IsString()
  period?: string;

  /** Only for the finance secretary's own reference — the resident is matched by phone. */
  @IsOptional()
  @IsString()
  name?: string;
}

export class ImportDuesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ImportDuesRowDto)
  rows!: ImportDuesRowDto[];

  /** Import rows that repeat an earlier import (same resident and amount) instead of skipping them. */
  @IsOptional()
  @IsBoolean()
  allowRepeats?: boolean;
}
