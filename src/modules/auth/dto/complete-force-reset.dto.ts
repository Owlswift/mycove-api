import { IsString, MinLength } from 'class-validator';

export class CompleteForceResetDto {
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
