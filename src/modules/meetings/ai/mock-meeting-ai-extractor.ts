import { Injectable } from '@nestjs/common';
import type {
  MeetingAiExtractionResult,
  MeetingAiExtractor,
} from './meeting-ai-extractor.interface';

const DECISION_MARKERS = ['agreed', 'resolved', 'decided', 'approved to', 'voted to'];
const ACTION_MARKERS = [
  'to provide',
  'to circulate',
  'to obtain',
  'to ensure',
  'to deploy',
  'to complete',
  'to submit',
  'to follow up',
  'will ',
  'shall ',
];
// A fixed vocabulary rather than free-form NLP — good enough to let the
// voice assistant answer "what was decided about security?" without an LLM
// in the loop, and cheap to swap for a real model's own topic list later.
const TOPIC_VOCABULARY = [
  'security', 'service charge', 'dues', 'levy', 'levies', 'maintenance',
  'water', 'power', 'electricity', 'waste', 'environment', 'parking',
  'visitors', 'budget', 'estate manager', 'road', 'drainage', 'gate',
];

function splitIntoSentences(report: string): string[] {
  return report
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * A placeholder for a real LLM call — plain keyword matching so the rest of
 * the pipeline (approval workflow, mobile UI, voice follow-ups) can be built
 * and tested without an AI provider/API key configured yet. See
 * MeetingAiExtractor's doc comment for how to swap this out later.
 */
@Injectable()
export class MockMeetingAiExtractor implements MeetingAiExtractor {
  async extract(report: string): Promise<MeetingAiExtractionResult> {
    const sentences = splitIntoSentences(report);
    const lower = report.toLowerCase();

    const decisions = sentences.filter((s) =>
      DECISION_MARKERS.some((marker) => s.toLowerCase().includes(marker)),
    );
    const actionItems = sentences.filter(
      (s) =>
        ACTION_MARKERS.some((marker) => s.toLowerCase().includes(marker)) &&
        !decisions.includes(s),
    );
    const topics = TOPIC_VOCABULARY.filter((topic) => lower.includes(topic));

    return { topics, decisions, actionItems };
  }
}
