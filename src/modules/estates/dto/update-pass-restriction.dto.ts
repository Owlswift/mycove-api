import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdatePassRestrictionDto {
  /**
   * Residents owing MORE than this many months of dues can't generate
   * visitor passes. null (or omitted) turns the restriction off.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  passRestrictionMonths?: number | null;
}
