import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class AllocateFundsDto {
  @IsString()
  projectId!: string;

  @IsInt()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
