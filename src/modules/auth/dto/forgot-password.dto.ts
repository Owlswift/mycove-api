import { IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  phone!: string;
}
