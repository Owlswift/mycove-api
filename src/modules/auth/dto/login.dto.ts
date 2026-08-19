import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

import { normalizePhone } from '../../../common/utils/normalize-phone';

export class LoginDto {
  @Transform(({ value }) => normalizePhone(value))
  @IsString()
  phone!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsIn(['RESIDENT', 'GUARD', 'ADMIN', 'FINANCE_SECRETARY', 'PROJECT_ADMIN'])
  role?: 'RESIDENT' | 'GUARD' | 'ADMIN' | 'FINANCE_SECRETARY' | 'PROJECT_ADMIN';

  @IsOptional()
  @IsIn(['ANDROID', 'IOS'])
  platform?: 'ANDROID' | 'IOS';

  @IsOptional()
  @IsString()
  deviceName?: string;
}
