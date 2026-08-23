import { IsEmail, IsOptional, IsString } from 'class-validator';

/**
 * Self-service profile updates (PATCH /users/me). Only contact-style
 * fields are editable — see UsersService.updateMe for why identity fields
 * are excluded. Every field is optional; sending '' clears it.
 */
export class UpdateMeDto {
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  emergencyContactName?: string | null;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string | null;
}
