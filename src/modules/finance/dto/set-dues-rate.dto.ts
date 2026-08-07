import { IsInt, IsPositive } from 'class-validator';

export class SetDuesRateDto {
  @IsInt()
  @IsPositive()
  monthlyAmount!: number;
}
