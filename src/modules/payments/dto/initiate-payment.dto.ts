import { IsIn, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class InitiatePaymentDto {
  @IsInt()
  @IsPositive()
  amount!: number;

  @IsIn(['DUES', 'LEVY', 'WALLET_TOPUP'])
  purpose!: 'DUES' | 'LEVY' | 'WALLET_TOPUP';

  @IsOptional()
  @IsString()
  levyId?: string;

  @IsOptional()
  @IsIn(['PAYSTACK', 'WALLET'])
  method?: 'PAYSTACK' | 'WALLET';
}
