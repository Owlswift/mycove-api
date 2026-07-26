import { IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateInvoiceDto {
  @IsString()
  projectId!: string;

  @IsInt()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsString()
  vendor?: string;
}
