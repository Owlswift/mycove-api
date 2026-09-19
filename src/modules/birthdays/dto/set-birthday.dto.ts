import { IsInt, Max, Min } from 'class-validator';

export class SetBirthdayDto {
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  day!: number;
}
