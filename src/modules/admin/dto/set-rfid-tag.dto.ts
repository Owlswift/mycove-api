import { IsOptional, IsString, MinLength } from 'class-validator';

export class SetRfidTagDto {
  /** null clears the tag (e.g. lost card). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  rfidTag?: string | null;
}
