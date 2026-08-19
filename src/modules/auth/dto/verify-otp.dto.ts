import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

import { normalizePhone } from '../../../common/utils/normalize-phone';

export class VerifyOtpDto {
  @Transform(({ value }) => normalizePhone(value))
  @IsString()
  phone!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
