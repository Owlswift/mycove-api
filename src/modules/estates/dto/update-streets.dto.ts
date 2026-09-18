import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class UpdateStreetsDto {
  /** The estate's complete street list — replaces whatever was there. */
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  streets!: string[];
}
