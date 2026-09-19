import { Matches } from 'class-validator';

export class SetMoveInDto {
  /** 'YYYY-MM' — the month the resident moved in or began operating. */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Move-in month must look like 2024-03.' })
  moveInMonth!: string;
}
