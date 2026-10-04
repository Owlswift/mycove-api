import { IsString, MinLength } from 'class-validator';

export class ResetUserPasswordDto {
  @IsString()
  phone!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
