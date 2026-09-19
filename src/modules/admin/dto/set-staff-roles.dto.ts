import { ArrayMaxSize, IsArray, IsIn } from 'class-validator';

export const GRANTABLE_STAFF_ROLES = [
  'FINANCE_SECRETARY',
  'PROJECT_ADMIN',
  'CHAIRMAN',
] as const;

export class SetStaffRolesDto {
  /** The complete set of staff roles this resident holds — replaces what was there; empty removes them all. */
  @IsArray()
  @ArrayMaxSize(GRANTABLE_STAFF_ROLES.length)
  @IsIn(GRANTABLE_STAFF_ROLES, { each: true })
  staffRoles!: (typeof GRANTABLE_STAFF_ROLES)[number][];
}
