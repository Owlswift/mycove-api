import { IsOptional, IsString } from 'class-validator';

export class UpdateEmergencyContactsDto {
  @IsOptional()
  @IsString()
  securityGuardPhone?: string | null;

  @IsOptional()
  @IsString()
  estateAdminPhone?: string | null;
}
