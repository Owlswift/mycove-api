import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

import { normalizePhone } from '../../../common/utils/normalize-phone';

export class CreateHouseholdInviteDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @Transform(({ value }) => normalizePhone(value))
  @IsString()
  phone!: string;
}
