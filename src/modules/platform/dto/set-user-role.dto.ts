import { IsIn, IsString } from 'class-validator';

export class SetUserRoleDto {
  @IsString()
  phone!: string;

  @IsIn(['RESIDENT', 'GUARD', 'ADMIN', 'FINANCE_SECRETARY', 'PROJECT_ADMIN', 'CHAIRMAN'])
  role!: 'RESIDENT' | 'GUARD' | 'ADMIN' | 'FINANCE_SECRETARY' | 'PROJECT_ADMIN' | 'CHAIRMAN';
}
