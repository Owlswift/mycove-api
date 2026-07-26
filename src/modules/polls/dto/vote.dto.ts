import { IsString } from 'class-validator';

export class VoteDto {
  @IsString()
  optionId!: string;
}
