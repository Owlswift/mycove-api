import { IsInt, IsPositive } from 'class-validator';

export class DonateDto {
  @IsInt()
  @IsPositive()
  amount!: number;
}
