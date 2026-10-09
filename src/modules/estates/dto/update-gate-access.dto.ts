import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateGateAccessDto {
  /**
   * A resident owing MORE than this amount is denied entry when their
   * RFID tag is scanned at the gate. null (or omitted) turns the
   * restriction off — every recognized tag is allowed through.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  gateAccessRestrictionAmount?: number | null;
}
