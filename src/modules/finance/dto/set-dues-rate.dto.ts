import { IsIn, IsInt, IsPositive, Matches } from 'class-validator';

export class SetDuesRateDto {
  @IsIn(['REGULAR', 'COMMERCIAL'])
  residentType!: 'REGULAR' | 'COMMERCIAL';

  @IsInt()
  @IsPositive()
  monthlyAmount!: number;

  /** The first month the new rate is charged for, as YYYY-MM. */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'effectiveMonth must look like 2026-10' })
  effectiveMonth!: string;
}
