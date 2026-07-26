import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  phone!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsIn(['RESIDENT', 'GUARD', 'ADMIN', 'FINANCE_SECRETARY', 'PROJECT_ADMIN'])
  role?: 'RESIDENT' | 'GUARD' | 'ADMIN' | 'FINANCE_SECRETARY' | 'PROJECT_ADMIN';
}
