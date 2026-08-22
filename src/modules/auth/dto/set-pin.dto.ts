import { IsString, Length, Matches } from 'class-validator';

export class SetPinDto {
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/)
  pin!: string;
}
