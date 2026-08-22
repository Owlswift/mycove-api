export const MEETING_AI_EXTRACTOR = Symbol('MEETING_AI_EXTRACTOR');

export interface MeetingAiExtractionResult {
  topics: string[];
  decisions: string[];
  actionItems: string[];
}

/**
 * Runs once, offline, when a secretary's report is written or edited (see
 * MeetingsService.adminCreate/adminUpdate) — never at request time for a
 * resident or the voice assistant, which only ever read back whatever this
 * produced (and only once an admin has approved it). Swap
 * MockMeetingAiExtractor for a real LLM-backed implementation behind this
 * interface; nothing else needs to change.
 */
export interface MeetingAiExtractor {
  extract(report: string): Promise<MeetingAiExtractionResult>;
}
