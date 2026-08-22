import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const VOICE_INTENTS = [
  'BUY_ELECTRICITY',
  'BUY_AIRTIME',
  'CHECK_BALANCE',
  'TRANSACTION_HISTORY',
] as const;

export type VoiceIntent = (typeof VOICE_INTENTS)[number];

/**
 * The structured output of whatever turns speech into an intent (a
 * speech-to-text + LLM pipeline, or a simpler on-device parser) — this DTO
 * is deliberately audio-agnostic, so swapping the speech provider later
 * never touches this contract or anything behind it.
 */
export class VoiceCommandDto {
  @IsIn(VOICE_INTENTS)
  intent!: VoiceIntent;

  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  // BUY_AIRTIME only — there's nowhere in the app that records a
  // resident's own network, so this can't be defaulted like the meter can.
  @IsOptional()
  @IsIn(['mtn', 'airtel', 'glo', 'etisalat'])
  network?: 'mtn' | 'airtel' | 'glo' | 'etisalat';

  // BUY_ELECTRICITY only — which saved meter to use, when a resident has
  // more than one and didn't say which. Omitted, the most recent is used.
  @IsOptional()
  @IsString()
  meterId?: string;
}
