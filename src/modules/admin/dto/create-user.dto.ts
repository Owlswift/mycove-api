import { IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class CreateUserDto {
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
