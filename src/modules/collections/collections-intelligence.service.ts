import { Injectable, Logger } from '@nestjs/common';
import { OllamaClientService } from './ollama-client.service';

function formatNaira(amount: number): string {
  return `₦${new Intl.NumberFormat('en-NG').format(amount)}`;
}

export interface GateOffer {
  /** Naira. */
  amount: number;
  /** Temporary access granted for paying this amount. 0 = fully settled, no expiry. */
  hours: number;
}

export interface GateOffersResult {
  offers: GateOffer[];
  message: string;
  reasoning: string;
  /** false when the LLM call failed/timed out and a deterministic fallback was used instead. */
  aiGenerated: boolean;
}

/**
 * A resident's track record with the collections system itself — distinct
 * from their raw dues payment history above. Lets the AI tell apart "has
 * been denied before and never followed through" from "pays into whatever
 * tier they're offered" rather than treating every decision as cold start
 * (see the collections spec §6 "What the AI Considers" and §10 "Behavioural
 * Learning" — this is the feedback loop those sections call for).
 */
export interface CollectionsHistory {
  /** How many times this resident has been denied at the gate before (ever). */
  priorDeniedAttempts: number;
  /** How many of those denials were followed by a qualifying payment into one of the offered tiers. */
  priorEntitlementsEarned: number;
  /** The amount paid into the most recent earned entitlement, if any. */
  lastEntitlementAmount: number | null;
  /** How long ago that was. */
  lastEntitlementDaysAgo: number | null;
}

export interface CollectionsInput {
  residentFirstName: string;
  balance: number;
  monthsOwed: number;
  /** The estate's current monthly dues rate for this resident's type, if one is set. */
  monthlyRate: number | null;
  /** Most recent payments first, capped by the caller — empty for a resident with no payment history yet. */
  recentPayments: { amount: number; daysAgo: number }[];
  /** Omitted where the caller has no cheap way to compute it (e.g. the arrears reminder path) — treated as cold start. */
  history?: CollectionsHistory;
}

export interface ArrearsReminderResult {
  message: string;
  aiGenerated: boolean;
}

export interface PaymentEvaluationInput {
  /** Outstanding balance immediately before this payment. */
  balanceBeforePayment: number;
  amountPaid: number;
  /** Outstanding balance immediately after this payment. */
  balanceAfterPayment: number;
  /** The estate's current monthly dues rate for this resident's type, if one is set. */
  monthlyRate: number | null;
  /** The offer tiers from the resident's most recent gate-denial decision, if any (empty when they paid without ever having been denied). */
  priorOffers: GateOffer[];
  history: CollectionsHistory;
}

export interface PaymentEvaluationResult {
  qualifies: boolean;
  /** Hours of temporary gate access this payment earns. Meaningless when qualifies is false. */
  hours: number;
  reasoning: string;
  aiGenerated: boolean;
}

/**
 * Generates the personalized payment tiers and resident-facing message for a
 * gate denial, and the message for an arrears reminder — per the collections
 * spec ("AI-Generated Communication", "Intelligent Payment Offers"). The
 * allow/deny decision itself stays a plain deterministic threshold check
 * elsewhere (GateAccessService); this service only decides what to offer and
 * say *after* that's already been decided.
 *
 * Every call degrades to a safe, deterministic fallback — amounts/durations
 * and a plain-English message — if the LLM is unreachable, slow, or returns
 * something unparseable. A gate denial or a reminder sweep must never fail
 * (or hang) because a local model didn't answer.
 */
@Injectable()
export class CollectionsIntelligenceService {
  private readonly logger = new Logger(CollectionsIntelligenceService.name);

  constructor(private ollama: OllamaClientService) {}

  async generateGateOffers(input: CollectionsInput): Promise<GateOffersResult> {
    const raw = await this.ollama.complete(
      [
        "You are MyCove's collections assistant. A resident who owes estate dues was just denied",
        'gate access. Generate 2-3 personalized payment tiers that give the resident a practical way',
        'to regain access, and a short resident-facing notification explaining the restriction and the offers.',
        '',
        'Respond with ONLY a JSON object, no markdown, no extra commentary, in exactly this shape:',
        '{"offers":[{"amount":number,"hours":number}],"message":string,"reasoning":string}',
        '',
        'Rules:',
        '- All amounts are Nigerian Naira (NGN). In the message, always write amounts with the ₦ symbol (e.g. ₦30,000) — never $, USD, or any other currency symbol.',
        '- 2 or 3 offers, amounts strictly increasing, the last one equal to the full outstanding balance with hours=0 (fully settled, no expiry).',
        '- Earlier offers are partial payments that buy temporary access; hours is how long that access lasts.',
        '- A resident with a longer arrears history or more months owed should be offered less generous terms than a resident newly, lightly in arrears.',
        '- A resident with no payment history at all, and no history object below (cold start), should get moderate, not punitive, terms — there is no track record to judge them on yet.',
        '- The input may include a "history" object: priorDeniedAttempts (times denied at the gate before), priorEntitlementsEarned (times they actually paid into an offered tier), lastEntitlementAmount/lastEntitlementDaysAgo (their most recent such payment).',
        '  A resident with priorEntitlementsEarned > 0 has a track record of following through on partial-payment offers — reward that with comparatively generous terms, similar to or better than last time.',
        '  A resident with several priorDeniedAttempts and priorEntitlementsEarned = 0 has a track record of NOT following through — be firmer: a higher first tier, shorter access windows.',
        '- message: short, warm but firm, states the balance and the offers in plain language. Do not use markdown.',
        '- reasoning: one sentence, your own words, explaining why you picked these amounts/durations given the input — reference the history object when one is present, not just the balance.',
      ].join('\n'),
      JSON.stringify(input),
      { timeoutMs: 60_000 },
    );

    const parsed = raw && parseOffersResponse(raw, input.balance);
    if (parsed) return { ...parsed, aiGenerated: true };

    if (raw) this.logger.warn('Ollama returned an unparseable gate-offers response; using fallback tiers.');
    return { ...fallbackOffers(input), aiGenerated: false };
  }

  async generateArrearsReminder(input: CollectionsInput): Promise<ArrearsReminderResult> {
    const raw = await this.ollama.complete(
      [
        "You are MyCove's collections assistant, writing a reminder push notification to a resident who",
        'owes estate dues but has not yet been denied gate access. Respond with ONLY a JSON object, no',
        'markdown, no extra commentary, in exactly this shape: {"message":string}',
        '',
        'The message should be short, plain language, state the outstanding balance, and its tone should',
        'escalate with how many months the resident has been in arrears: gentle for 1 month, more direct',
        'for 2-3 months, and urgent (mentioning possible gate restriction) beyond 3 months. Do not use markdown.',
        'The input may include a "history" object — if history.priorDeniedAttempts is greater than 0, this',
        'resident has already been denied at the gate before; mention that plainly rather than treating this',
        'as their first notice, and lean more urgent regardless of the months-owed tone rule above.',
        'All amounts are Nigerian Naira (NGN) — always write amounts with the ₦ symbol, never $, USD, or any other currency symbol.',
      ].join('\n'),
      JSON.stringify(input),
      { timeoutMs: 45_000 },
    );

    const message = raw && parseReminderResponse(raw);
    if (message) return { message, aiGenerated: true };

    return { message: fallbackReminderMessage(input), aiGenerated: false };
  }

  /**
   * Per the collections spec §8 ("Payment and Access Flow"): a partial
   * payment doesn't just get checked off against a fixed tier — the AI
   * evaluates it and decides whether it qualifies for temporary access and
   * for how long, the same way it decided the original offers. priorOffers
   * (from the resident's most recent gate-denial decision) is context, not
   * a hard lookup table: the model can grant something between tiers, or
   * reward a resident with a strong history more generously than the tier
   * they technically matched.
   */
  async evaluatePayment(input: PaymentEvaluationInput): Promise<PaymentEvaluationResult> {
    if (input.balanceAfterPayment <= 0) {
      // Fully settled — ordinary threshold check already allows them through; no entitlement needed.
      return { qualifies: false, hours: 0, reasoning: 'Balance fully settled — no temporary entitlement needed.', aiGenerated: false };
    }

    const raw = await this.ollama.complete(
      [
        "You are MyCove's collections assistant. A resident who owes estate dues just made a payment.",
        'Decide whether this payment earns them temporary gate access, and for how long, given the',
        'payment, their balance, and (if present) the payment tiers they were offered at their last gate',
        'denial. Respond with ONLY a JSON object, no markdown, no extra commentary, in exactly this shape:',
        '{"qualifies":boolean,"hours":number,"reasoning":string}',
        '',
        'Rules:',
        '- All amounts are Nigerian Naira (NGN).',
        '- priorOffers, when non-empty, is context from their last gate denial — not a rigid lookup table. A payment',
        '  that at least matches the lowest prior offer amount should normally qualify for around that offer\'s hours;',
        '  you may grant more for a resident with a strong history (see "history" below), or less for one with none.',
        '- If priorOffers is empty, this resident paid without ever having been denied at the gate — use the monthly',
        '  rate (if given) and the payment size relative to it to decide a reasonable grace period; moderate, not punitive.',
        '- history mirrors the gate-offer decision\'s history object (priorDeniedAttempts, priorEntitlementsEarned,',
        '  lastEntitlementAmount/lastEntitlementDaysAgo) — a resident who has earned entitlements before and is paying',
        '  again should generally qualify; one with many denials and zero entitlements earned should need a higher',
        '  payment relative to their balance before qualifying at all.',
        '- hours must be 0 when qualifies is false.',
        '- reasoning: one sentence, your own words.',
      ].join('\n'),
      JSON.stringify(input),
      { timeoutMs: 45_000 },
    );

    const parsed = raw && parsePaymentEvaluationResponse(raw);
    if (parsed) return { ...parsed, aiGenerated: true };

    if (raw) this.logger.warn('Ollama returned an unparseable payment-evaluation response; using fallback tier match.');
    return { ...fallbackPaymentEvaluation(input), aiGenerated: false };
  }
}

function extractJsonObject(text: string): unknown | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function parseOffersResponse(raw: string, balance: number): { offers: GateOffer[]; message: string; reasoning: string } | null {
  const parsed = extractJsonObject(raw) as Partial<GateOffersResult> | null;
  if (!parsed || !Array.isArray(parsed.offers) || typeof parsed.message !== 'string' || !parsed.message.trim()) {
    return null;
  }
  const offers = parsed.offers.filter(
    (o): o is GateOffer =>
      typeof o === 'object' && o !== null && typeof o.amount === 'number' && typeof o.hours === 'number' && o.amount > 0 && o.hours >= 0,
  );
  if (offers.length < 1 || offers.length > 3) return null;
  for (let i = 1; i < offers.length; i++) {
    if (offers[i].amount <= offers[i - 1].amount) return null;
  }
  // The last tier must actually settle the account — cap it to the real balance
  // rather than trust whatever number the model wrote.
  offers[offers.length - 1] = { amount: balance, hours: 0 };
  return {
    offers,
    message: fixCurrencySymbol(parsed.message.trim()),
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'AI-generated.',
  };
}

/** Belt-and-braces: the prompt tells the model to use ₦, but a $N figure sometimes slips through anyway. */
function fixCurrencySymbol(message: string): string {
  return message.replace(/\$(?=\d)/g, '₦');
}

function parseReminderResponse(raw: string): string | null {
  const parsed = extractJsonObject(raw) as { message?: unknown } | null;
  if (!parsed || typeof parsed.message !== 'string' || !parsed.message.trim()) return null;
  return fixCurrencySymbol(parsed.message.trim());
}

function parsePaymentEvaluationResponse(raw: string): { qualifies: boolean; hours: number; reasoning: string } | null {
  const parsed = extractJsonObject(raw) as Partial<PaymentEvaluationResult> | null;
  if (!parsed || typeof parsed.qualifies !== 'boolean') return null;
  if (!parsed.qualifies) return { qualifies: false, hours: 0, reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'AI-generated.' };
  if (typeof parsed.hours !== 'number' || parsed.hours <= 0) return null;
  // Cap at 30 days — even a resident with an excellent history shouldn't get
  // an unbounded grant from a single payment evaluation.
  const hours = Math.min(parsed.hours, 24 * 30);
  return { qualifies: true, hours, reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'AI-generated.' };
}

/** A simple, fixed-ratio 3-tier offer set — used only when the LLM is unavailable. */
function fallbackOffers(input: CollectionsInput): { offers: GateOffer[]; message: string; reasoning: string } {
  const { balance } = input;
  const round = (n: number) => Math.max(1000, Math.round(n / 1000) * 1000);
  const tier1 = Math.min(round(balance * 0.25), balance);
  const tier2 = Math.min(round(balance * 0.6), balance);
  const offers: GateOffer[] = Array.from(
    new Map(
      [
        { amount: tier1, hours: 24 },
        { amount: tier2, hours: 24 * 14 },
        { amount: balance, hours: 0 },
      ].map((o) => [o.amount, o]),
    ).values(),
  ).sort((a, b) => a.amount - b.amount);

  const message =
    `Your access has been temporarily restricted — your outstanding balance is ${formatNaira(balance)}. ` +
    `You can restore access with: ` +
    offers.map((o) => (o.hours === 0 ? `${formatNaira(o.amount)} to fully settle your account` : `${formatNaira(o.amount)} for ${formatDuration(o.hours)} of access`)).join(', ') +
    '.';

  return {
    offers,
    message,
    reasoning: `Fallback: fixed-ratio tiers used because the AI collections service was unavailable (history: ${
      input.history ? `${input.history.priorDeniedAttempts} prior denial(s), ${input.history.priorEntitlementsEarned} earned entitlement(s)` : 'none available'
    }).`,
  };
}

/** The original deterministic tier-match — used only when the LLM is unavailable. */
function fallbackPaymentEvaluation(input: PaymentEvaluationInput): { qualifies: boolean; hours: number; reasoning: string } {
  const qualifying = input.priorOffers
    .filter((o) => o.hours > 0 && o.amount <= input.amountPaid)
    .sort((a, b) => b.hours - a.hours)[0];
  if (qualifying) {
    return {
      qualifies: true,
      hours: qualifying.hours,
      reasoning: `Fallback: matched the ₦${input.amountPaid.toLocaleString('en-NG')} payment against the ${qualifying.hours}-hour prior offer tier because the AI collections service was unavailable.`,
    };
  }
  return {
    qualifies: false,
    hours: 0,
    reasoning: 'Fallback: payment did not match any prior offer tier, and the AI collections service was unavailable to evaluate it independently.',
  };
}

function fallbackReminderMessage(input: CollectionsInput): string {
  const { balance, monthsOwed } = input;
  if (monthsOwed > 3) {
    return `Your outstanding balance is now ${formatNaira(balance)} — ${monthsOwed} months overdue. Please pay now to avoid restrictions on your estate gate access.`;
  }
  return `Reminder: you currently owe ${formatNaira(balance)} in estate dues. Please settle from the Dues tab to stay up to date.`;
}

function formatDuration(hours: number): string {
  if (hours % 24 === 0 && hours >= 24) {
    const days = hours / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}
