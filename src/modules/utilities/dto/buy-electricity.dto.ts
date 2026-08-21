import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class BuyElectricityDto {
  @IsString()
  @MinLength(1)
  meterId!: string;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsInt()
  @Min(500)
  amount!: number;
}
