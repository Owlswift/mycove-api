import { IsIn, IsInt, IsString, Min, MinLength } from 'class-validator';

export class BuyAirtimeDto {
  @IsIn(['mtn', 'airtel', 'glo', 'etisalat'])
  network!: 'mtn' | 'airtel' | 'glo' | 'etisalat';

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsInt()
  @Min(50)
  amount!: number;
}
