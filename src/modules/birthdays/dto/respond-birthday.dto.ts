import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class RespondBirthdayDto {
  /** A data URL or base64 image the celebrant picked. Optional — they can skip the photo. */
  @IsOptional()
  @IsString()
  photoBase64?: string;

  @IsBoolean()
  hasParty!: boolean;

  /** When the party starts (ISO 8601, with offset). Required when there is a party. */
  @ValidateIf((o: RespondBirthdayDto) => o.hasParty)
  @IsDateString()
  partyAt?: string;

  @ValidateIf((o: RespondBirthdayDto) => o.hasParty)
  @IsString()
  @MaxLength(120)
  partyVenue?: string;
}
