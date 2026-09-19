import { IsBoolean } from 'class-validator';

export class SetTokenChargingDto {
  @IsBoolean()
  enabled!: boolean;
}
