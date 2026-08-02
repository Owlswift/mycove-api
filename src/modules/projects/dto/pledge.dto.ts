import { IsInt, IsPositive } from 'class-validator';

export class PledgeDto {
  @IsInt()
  @IsPositive()
  amount!: number;
}
