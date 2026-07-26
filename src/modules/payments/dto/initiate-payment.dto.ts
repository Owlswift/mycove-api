import { IsIn, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class InitiatePaymentDto {
  @IsInt()
  @IsPositive()
  amount!: number;

  @IsIn(['DUES', 'LEVY'])
  purpose!: 'DUES' | 'LEVY';

  @IsOptional()
  @IsString()
  levyId?: string;
}
