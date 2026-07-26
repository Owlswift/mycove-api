import { IsIn, IsString, MinLength } from 'class-validator';

export class BroadcastDto {
  @IsString()
  @MinLength(1)
  message!: string;

  @IsIn(['RESIDENTS', 'GUARDS', 'ALL'])
  target!: 'RESIDENTS' | 'GUARDS' | 'ALL';
}
