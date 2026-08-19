import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';

import { normalizePhone } from '../../../common/utils/normalize-phone';

export class ForgotPasswordDto {
  @Transform(({ value }) => normalizePhone(value))
  @IsString()
  phone!: string;
}
