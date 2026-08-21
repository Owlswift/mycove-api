import { IsIn, IsString, MinLength } from 'class-validator';

export class VerifyMeterDto {
  @IsString()
  @MinLength(1)
  discoCode!: string;

  @IsString()
  @MinLength(1)
  meterNumber!: string;

  @IsIn(['PREPAID', 'POSTPAID'])
  meterType!: 'PREPAID' | 'POSTPAID';
}
