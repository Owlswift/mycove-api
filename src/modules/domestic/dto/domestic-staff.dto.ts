import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength, ValidateIf } from 'class-validator';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateDomesticStaffDto {
  @IsString()
  @MinLength(1)
  name!: string;

  /** The staff member's WhatsApp number. */
  @IsString()
  @MinLength(7)
  phone!: string;

  /** 0 = Sunday … 6 = Saturday; leave empty for any day. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days?: number[];

  /** "HH:mm" — with endTime, the hours they're expected. Omit both for any time. */
  @IsOptional()
  @ValidateIf((o: CreateDomesticStaffDto) => o.startTime !== null)
  @Matches(TIME, { message: 'startTime must look like 08:00' })
  startTime?: string | null;

  @IsOptional()
  @ValidateIf((o: CreateDomesticStaffDto) => o.endTime !== null)
  @Matches(TIME, { message: 'endTime must look like 14:00' })
  endTime?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class UpdateDomesticStaffDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days?: number[];

  @IsOptional()
  @ValidateIf((o: UpdateDomesticStaffDto) => o.startTime !== null)
  @Matches(TIME, { message: 'startTime must look like 08:00' })
  startTime?: string | null;

  @IsOptional()
  @ValidateIf((o: UpdateDomesticStaffDto) => o.endTime !== null)
  @Matches(TIME, { message: 'endTime must look like 14:00' })
  endTime?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}
