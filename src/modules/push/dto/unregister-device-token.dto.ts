import { IsString } from 'class-validator';

export class UnregisterDeviceTokenDto {
  @IsString()
  token!: string;
}
