import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MinLength, ValidateIf } from 'class-validator';

import { normalizePhone } from '../../../common/utils/normalize-phone';

export class CreateUserDto {
  @Transform(({ value }) => normalizePhone(value))
  @IsString()
  phone!: string;

  @IsString()
  fullName!: string;

  @IsIn(['RESIDENT', 'GUARD', 'ADMIN', 'FINANCE_SECRETARY', 'PROJECT_ADMIN', 'CHAIRMAN'])
  role!: 'RESIDENT' | 'GUARD' | 'ADMIN' | 'FINANCE_SECRETARY' | 'PROJECT_ADMIN' | 'CHAIRMAN';

  @IsOptional()
  @IsString()
  house?: string;

  /** Preferred over `house` when the estate has preloaded streets. */
  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  houseNumber?: string;

  /** Regular residents and commercial ones (shops, offices) pay different dues rates. Ignored for non-resident roles. */
  @IsOptional()
  @IsIn(['REGULAR', 'COMMERCIAL'])
  residentType?: 'REGULAR' | 'COMMERCIAL';

  /** 'YYYY-MM' — when a resident moved in or began operating. Dues are billed from this month. Required for residents. */
  @ValidateIf((o) => o.role === 'RESIDENT')
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Move-in month must look like 2024-03.' })
  moveInMonth?: string;

  /** Required for GUARD accounts — the admin sets a real password directly instead of a self-service reset flow. */
  @ValidateIf((o) => o.role === 'GUARD')
  @IsString()
  @MinLength(6)
  password?: string;
}
