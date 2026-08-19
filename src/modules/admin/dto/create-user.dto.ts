import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

import { normalizePhone } from '../../../common/utils/normalize-phone';

export class CreateUserDto {
  @Transform(({ value }) => normalizePhone(value))
  @IsString()
  phone!: string;

  @IsString()
  fullName!: string;

  @IsIn(['RESIDENT', 'GUARD', 'ADMIN', 'FINANCE_SECRETARY', 'PROJECT_ADMIN'])
  role!: 'RESIDENT' | 'GUARD' | 'ADMIN' | 'FINANCE_SECRETARY' | 'PROJECT_ADMIN';

  @IsOptional()
  @IsString()
  house?: string;

  /** Required for GUARD accounts — the admin sets a real password directly instead of a self-service reset flow. */
  @ValidateIf((o) => o.role === 'GUARD')
  @IsString()
  @MinLength(6)
  password?: string;
}
