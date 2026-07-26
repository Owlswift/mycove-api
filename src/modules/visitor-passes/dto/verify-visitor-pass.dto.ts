import { IsString, Length } from 'class-validator';

export class VerifyVisitorPassDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
