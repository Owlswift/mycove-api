import { IsOptional, IsString, MinLength } from 'class-validator';

export class ResetUserPasswordDto {
  /** Required when resetting a GUARD account — the admin picks the new password directly. */
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
