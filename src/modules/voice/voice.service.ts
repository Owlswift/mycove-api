import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { VoiceCommandDto } from './dto/voice-command.dto';
import { VoiceLogsDto } from './dto/voice-logs.dto';

function formatNaira(amount: number): string {
  return `₦${new Intl.NumberFormat('en-NG').format(amount)}`;
}

/**
 * What the client shows/says next, and — once a resident has said
 * "confirm" and passed biometric auth — exactly what to POST and where.
 * [command]/[endpoint] deliberately point at the *existing* real purchase
 * endpoints (which already enforce wallet balance and do the actual vend)
 * rather than this service executing anything itself: voice only ever
 * prepares a transaction, never spends money — see VoiceService's class
 * doc comment for why that split matters.
 */
export interface VoicePrepareResult {
  ok: boolean;
  needsClarification?: { field: string };
  needsConfirmation?: boolean;
  speech: string;
  endpoint?: string;
  command?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

/**
 * Turns a structured intent (however speech got parsed into one — that
 * choice is still open, see the mobile app's voice design notes) into
 * either an answer (CHECK_BALANCE, TRANSACTION_HISTORY) or a confirmation
 * preview for a purchase. This service never moves money: a purchase
 * intent resolves to a [command]/[endpoint] pair that the *client* posts
 * to the real, already-existing /utilities/* endpoint only after the
 * resident says "confirm" AND passes biometric authentication. Those
 * endpoints are the actual authority — they re-check wallet balance
 * independently, so nothing here is a trusted shortcut around them.
 */
@Injectable()
export class VoiceService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
  ) {}

  prepare(
    userId: string,
    estateId: string,
    dto: VoiceCommandDto,
  ): Promise<VoicePrepareResult> {
    switch (dto.intent) {
      case 'CHECK_BALANCE':
        return this.checkBalance(userId, estateId);
      case 'TRANSACTION_HISTORY':
        return this.transactionHistory(userId, estateId);
      case 'BUY_ELECTRICITY':
        return this.prepareBuyElectricity(userId, estateId, dto);
      case 'BUY_AIRTIME':
        return this.prepareBuyAirtime(userId, estateId, dto);
    }
  }

  private async checkBalance(
    userId: string,
    estateId: string,
  ): Promise<VoicePrepareResult> {
    const balance = await this.wallet.getBalance(userId, estateId);
    return {
      ok: true,
      speech: `Your MyCove balance is ${formatNaira(balance)}.`,
      data: { balance },
    };
  }

  private async transactionHistory(
    userId: string,
    estateId: string,
  ): Promise<VoicePrepareResult> {
    const transactions = await this.wallet.listTransactions(userId, estateId);
    const recent = transactions.slice(0, 5);
    if (recent.length === 0) {
      return { ok: true, speech: "You don't have any transactions yet." };
    }
    const latest = recent[0];
    const verb =
      latest.type === 'TOPUP'
        ? 'a top-up of'
        : latest.type === 'REFUND'
          ? 'a refund of'
          : 'a purchase of';
    return {
      ok: true,
      speech: `Your most recent wallet activity was ${verb} ${formatNaira(latest.amount)}. Your balance is now ${formatNaira(latest.balanceAfter)}.`,
      data: { transactions: recent },
    };
  }

  private async prepareBuyElectricity(
    userId: string,
    estateId: string,
    dto: VoiceCommandDto,
  ): Promise<VoicePrepareResult> {
    if (!dto.amount) {
      return {
        ok: true,
        needsClarification: { field: 'amount' },
        speech: 'How much electricity would you like to buy?',
      };
    }

    const meter = dto.meterId
      ? await this.prisma.utilityMeter.findFirst({
          where: { id: dto.meterId, userId, estateId },
        })
      : await this.prisma.utilityMeter.findFirst({
          where: { userId, estateId },
          orderBy: { createdAt: 'desc' },
        });
    if (!meter) {
      return {
        ok: false,
        speech:
          "You don't have a registered meter yet — add one from the Buy Electricity screen first.",
      };
    }

    const balance = await this.wallet.getBalance(userId, estateId);
    if (balance < dto.amount) {
      return {
        ok: false,
        speech: `Your MyCove balance is ${formatNaira(balance)}, which isn't enough for ${formatNaira(dto.amount)} of electricity.`,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    const meterLabel = meter.meterNumber.slice(-4);

    return {
      ok: true,
      needsConfirmation: true,
      speech: `${formatNaira(dto.amount)} electricity for your meter ending ${meterLabel}. Say confirm to continue.`,
      endpoint: '/utilities/electricity/buy',
      command: {
        meterId: meter.id,
        phone: user?.phone ?? '',
        amount: dto.amount,
      },
    };
  }

  private async prepareBuyAirtime(
    userId: string,
    estateId: string,
    dto: VoiceCommandDto,
  ): Promise<VoicePrepareResult> {
    if (!dto.amount) {
      return {
        ok: true,
        needsClarification: { field: 'amount' },
        speech: 'How much airtime would you like to buy?',
      };
    }
    if (!dto.network) {
      return {
        ok: true,
        needsClarification: { field: 'network' },
        speech: 'Which network — MTN, Airtel, Glo, or 9mobile?',
      };
    }

    const balance = await this.wallet.getBalance(userId, estateId);
    if (balance < dto.amount) {
      return {
        ok: false,
        speech: `Your MyCove balance is ${formatNaira(balance)}, which isn't enough for ${formatNaira(dto.amount)} of airtime.`,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user?.phone) {
      return {
        ok: false,
        speech: "We don't have a phone number on file for your account.",
      };
    }

    return {
      ok: true,
      needsConfirmation: true,
      speech: `${formatNaira(dto.amount)} ${dto.network.toUpperCase()} airtime for ${this.maskPhone(user.phone)}. Say confirm to continue.`,
      endpoint: '/utilities/airtime/buy',
      command: { network: dto.network, phone: user.phone, amount: dto.amount },
    };
  }

  private maskPhone(phone: string): string {
    if (phone.length < 7) return phone;
    return `${phone.slice(0, 4)}${'•'.repeat(phone.length - 7)}${phone.slice(-3)}`;
  }

  /**
   * Stores a batch of on-device voice-turn logs (transcript + parser
   * decision trail) — the analysis dataset behind the deterministic
   * keyword parser: reviewed offline to find misclassifications, repeated
   * STT variants ("owing"→"going", "debt"→"date"), confused intents, and
   * false-positive rules. Write-only from the app's perspective; nothing
   * resident-facing ever reads these rows back.
   */
  async uploadLogs(userId: string, estateId: string, dto: VoiceLogsDto) {
    if (dto.logs.length === 0) return { stored: 0 };
    await this.prisma.voiceInteractionLog.createMany({
      data: dto.logs.map((l) => ({
        estateId,
        userId,
        transcript: l.transcript,
        intent: l.intent ?? null,
        matchedBy: l.matchedBy ?? [],
        ...(l.parameters !== undefined
          ? { parameters: l.parameters as Prisma.InputJsonValue }
          : {}),
        response: l.response ?? null,
        navigationTarget: l.navigationTarget ?? null,
      })),
    });
    return { stored: dto.logs.length };
  }
}
