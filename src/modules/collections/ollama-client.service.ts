import { Injectable, Logger } from '@nestjs/common';

/**
 * Thin client for an OpenAI-compatible chat completions endpoint — local
 * Ollama (gpt-oss:20b) today, swappable for a hosted provider later without
 * touching any caller. A local 20B model on CPU/GPU can take 10-20+ seconds
 * to answer, so every call here has a hard timeout; callers must have a
 * deterministic fallback ready rather than ever blocking a gate decision or
 * a reminder sweep on this.
 */
@Injectable()
export class OllamaClientService {
  private readonly logger = new Logger(OllamaClientService.name);
  private readonly baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  private readonly model = process.env.OLLAMA_MODEL ?? 'gpt-oss:20b';

  /** Returns null (never throws) on timeout, network error, or a non-2xx response — callers fall back. */
  async complete(
    systemPrompt: string,
    userPrompt: string,
    opts: { timeoutMs?: number; temperature?: number } = {},
  ): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: opts.temperature ?? 0.3,
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Ollama call failed: HTTP ${res.status}`);
        return null;
      }
      const body = await res.json();
      const content: unknown = body?.choices?.[0]?.message?.content;
      return typeof content === 'string' && content.trim() ? content : null;
    } catch (e) {
      this.logger.warn(`Ollama call failed: ${(e as Error).message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
