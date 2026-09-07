import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateEstateDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  managedBy?: string;

  @IsOptional()
  @IsString()
  imageBase64?: string;

  /**
   * Optional — bootstraps the estate's first ADMIN account in the same
   * call. Needed because there's no other way to create an admin for a
   * brand-new estate: `/admin/users` requires an existing admin JWT
   * already scoped to that estateId, which doesn't exist yet.
   */
  @IsOptional()
  @IsString()
  adminPhone?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  adminPassword?: string;

  @IsOptional()
  @IsString()
  adminFullName?: string;
}
