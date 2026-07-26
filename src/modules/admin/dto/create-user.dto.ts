import { IsIn, IsOptional, IsString } from 'class-validator';

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
}
