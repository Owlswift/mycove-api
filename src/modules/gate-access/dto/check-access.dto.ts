import { IsString, MinLength } from 'class-validator';

export class CheckAccessDto {
  @IsString()
  @MinLength(1)
  rfidTag!: string;
}
