import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateProgressDto {
  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;

  @IsOptional()
  @IsIn(['IN_PROGRESS', 'COMPLETED'])
  status?: 'IN_PROGRESS' | 'COMPLETED';
}
