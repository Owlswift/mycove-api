import { IsIn, IsString, MinLength } from 'class-validator';

export class SaveMeterDto {
  @IsString()
  @MinLength(1)
  discoCode!: string;

  @IsString()
  @MinLength(1)
  discoName!: string;

  @IsString()
  @MinLength(1)
  meterNumber!: string;

  @IsIn(['PREPAID', 'POSTPAID'])
  meterType!: 'PREPAID' | 'POSTPAID';
}
