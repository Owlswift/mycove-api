import { randomUUID } from 'crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UtilityProviderName } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { VerifyMeterDto } from './dto/verify-meter.dto';
import { SaveMeterDto } from './dto/save-meter.dto';
import { BuyElectricityDto } from './dto/buy-electricity.dto';
import { BuyAirtimeDto } from './dto/buy-airtime.dto';
import { VtpassProvider } from './providers/vtpass.provider';
import { BuypowerProvider } from './providers/buypower.provider';
import type {
  AirtimeVendResult,
  ElectricityVendResult,
  UtilityProvider,
} from './providers/utility-provider.interface';
import {
  UtilityProviderPendingError,
  UtilityRequestRejectedError,
} from './providers/utility-provider.interface';

/**
 * VTpass's own request_id rule (YYYYMMDDHHII + alphanumeric, Africa/Lagos
 * time — see vtpass.com/documentation/how-to-generate-request-id) is a
 * strict superset of "just needs to be a unique string", so this is reused
 * as our own idempotency key on UtilityPurchase.requestId too rather than
 * keeping two different IDs in sync.
 */
function generateRequestId(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const prefix = `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}`;
  return `${prefix}${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

type FailedOutcome = {
  failed: true;
  kind: 'rejected' | 'unavailable';
  reason: string;
};
type PendingOutcome = { pending: true };
type SucceededOutcome<T> = { succeeded: true; providerName: string; result: T };
type Outcome<T> = SucceededOutcome<T> | PendingOutcome | FailedOutcome;

// https://vtpass.com/documentation/transaction-update-webhook-api/ — sent
// when a transaction that came back 099 ("still processing") on the
// original /pay call later resolves. `purchased_code` is documented as the
// slot for an electricity token but VTpass's own docs don't show a
// populated electricity example, so this is a best-effort read.
export interface VtpassCallbackPayload {
  type?: string;
  data?: {
    code?: string;
    response_description?: string;
    requestId?: string;
    purchased_code?: string;
    content?: {
      transactions?: {
        status?: string;
        transactionId?: string;
      };
    };
  };
}

function isElectricityResult(
  result: ElectricityVendResult | AirtimeVendResult,
): result is ElectricityVendResult {
  return 'token' in result;
}

@Injectable()
export class UtilitiesService {
  private readonly logger = new Logger(UtilitiesService.name);
  private readonly providers: UtilityProvider[];

  constructor(
    private prisma: PrismaService,
    vtpass: VtpassProvider,
    buypower: BuypowerProvider,
  ) {
    // Order is the failover order: VTpass primary, BuyPower secondary.
    this.providers = [vtpass, buypower];
  }

  listMeters(userId: string, estateId: string) {
    return this.prisma.utilityMeter.findMany({
      where: { userId, estateId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Not estate-scoped — see ElectricityDisco's schema doc comment.
  listDiscos() {
    return this.prisma.electricityDisco.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { code: true, shortCode: true, name: true },
    });
  }

  async verifyMeter(dto: VerifyMeterDto) {
    const outcome = await this.withFailover((provider) =>
      provider.verifyMeter(dto.discoCode, dto.meterNumber, dto.meterType),
    );
    if ('pending' in outcome) {
      // A meter-verify call has no meaningful "pending" outcome — treat it
      // the same as unavailable rather than surfacing an impossible state.
      throw new ServiceUnavailableException(
        'Could not verify this meter right now. Please try again shortly.',
      );
    }
    if ('failed' in outcome) {
      if (outcome.kind === 'rejected')
        throw new BadRequestException(outcome.reason);
      throw new ServiceUnavailableException(outcome.reason);
    }
    return outcome.result;
  }

  async saveMeter(userId: string, estateId: string, dto: SaveMeterDto) {
    // Re-verify on save rather than trusting whatever the client claims to
    // have seen from a prior /verify call — nothing persists unverified.
    const verification = await this.verifyMeter(dto);
    return this.prisma.utilityMeter.upsert({
      where: { userId_meterNumber: { userId, meterNumber: dto.meterNumber } },
      create: {
        estateId,
        userId,
        discoCode: dto.discoCode,
        discoName: dto.discoName,
        meterNumber: dto.meterNumber,
        meterType: dto.meterType,
        customerName: verification.customerName,
        address: verification.address,
      },
      update: {
        discoCode: dto.discoCode,
        discoName: dto.discoName,
        meterType: dto.meterType,
        customerName: verification.customerName,
        address: verification.address,
      },
    });
  }

  async buyElectricity(
    userId: string,
    estateId: string,
    dto: BuyElectricityDto,
  ) {
    const meter = await this.prisma.utilityMeter.findFirst({
      where: { id: dto.meterId, userId, estateId },
    });
    if (!meter) throw new NotFoundException('Meter not found.');

    const requestId = generateRequestId();
    const purchase = await this.prisma.utilityPurchase.create({
      data: {
        estateId,
        userId,
        type: 'ELECTRICITY',
        meterId: meter.id,
        phone: dto.phone,
        amount: dto.amount,
        requestId,
      },
    });

    const outcome = await this.withFailover<ElectricityVendResult>(
      (provider) =>
        provider.vendElectricity({
          discoCode: meter.discoCode,
          meterNumber: meter.meterNumber,
          meterType: meter.meterType,
          amount: dto.amount,
          phone: dto.phone,
          requestId,
        }),
      purchase.id,
    );
    return this.finalizePurchase(purchase.id, outcome);
  }

  async buyAirtime(userId: string, estateId: string, dto: BuyAirtimeDto) {
    const requestId = generateRequestId();
    const purchase = await this.prisma.utilityPurchase.create({
      data: {
        estateId,
        userId,
        type: 'AIRTIME',
        phone: dto.phone,
        network: dto.network,
        amount: dto.amount,
        requestId,
      },
    });

    const outcome = await this.withFailover<AirtimeVendResult>(
      (provider) =>
        provider.buyAirtime({
          network: dto.network,
          phone: dto.phone,
          amount: dto.amount,
          requestId,
        }),
      purchase.id,
    );
    return this.finalizePurchase(purchase.id, outcome);
  }

  /**
   * Resolves a purchase that was left PENDING after a 099 response. Always
   * acknowledges with {response:'success'} (what VTpass's docs say to
   * return) even for an unknown or already-resolved requestId, so an
   * unrecognized or duplicate callback doesn't make VTpass keep retrying.
   */
  async handleVtpassCallback(payload: VtpassCallbackPayload) {
    const data = payload?.data;
    const requestId = data?.requestId;
    if (!requestId) return { response: 'success' };

    const purchase = await this.prisma.utilityPurchase.findUnique({
      where: { requestId },
    });
    if (!purchase || purchase.status !== 'PENDING') {
      return { response: 'success' };
    }

    if (data?.code === '000') {
      await this.prisma.utilityPurchase.update({
        where: { id: purchase.id },
        data: {
          status: 'SUCCESSFUL',
          provider: 'VTPASS',
          providerRef:
            data.content?.transactions?.transactionId ?? purchase.requestId,
          token:
            purchase.type === 'ELECTRICITY' && data.purchased_code
              ? data.purchased_code
              : purchase.token,
        },
      });
    } else {
      await this.prisma.utilityPurchase.update({
        where: { id: purchase.id },
        data: {
          status: 'FAILED',
          failureReason:
            data?.response_description ||
            `VTpass callback reported code ${data?.code}.`,
        },
      });
    }
    return { response: 'success' };
  }

  listPurchases(userId: string, estateId: string) {
    return this.prisma.utilityPurchase.findMany({
      where: { userId, estateId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Failover orchestration ─────────────────────────────────────────

  /**
   * Tries each provider in order (VTpass, then BuyPower) until one
   * succeeds. A rejection or a pending result stops the loop immediately —
   * neither is safe to retry on the next provider (see the doc comment on
   * UtilityProviderPendingError). Only a genuine unavailability moves on to
   * the next one; if every provider is unavailable, the last error's
   * message is what gets surfaced.
   *
   * `purchaseId` is optional because verifyMeter has no purchase row to
   * annotate with the attempted-providers trail.
   */
  private async withFailover<T>(
    fn: (provider: UtilityProvider) => Promise<T>,
    purchaseId?: string,
  ): Promise<Outcome<T>> {
    const attempted: string[] = [];
    let lastUnavailableReason: string | undefined;

    for (const provider of this.providers) {
      attempted.push(provider.name);
      try {
        const result = await fn(provider);
        if (purchaseId) {
          await this.prisma.utilityPurchase.update({
            where: { id: purchaseId },
            data: {
              attemptedProviders: { set: attempted as UtilityProviderName[] },
            },
          });
        }
        return { succeeded: true, providerName: provider.name, result };
      } catch (e) {
        if (e instanceof UtilityRequestRejectedError) {
          if (purchaseId) {
            await this.prisma.utilityPurchase.update({
              where: { id: purchaseId },
              data: {
                attemptedProviders: { set: attempted as UtilityProviderName[] },
              },
            });
          }
          return { failed: true, kind: 'rejected', reason: e.message };
        }
        if (e instanceof UtilityProviderPendingError) {
          if (purchaseId) {
            await this.prisma.utilityPurchase.update({
              where: { id: purchaseId },
              data: {
                attemptedProviders: { set: attempted as UtilityProviderName[] },
                provider: provider.name,
              },
            });
          }
          return { pending: true };
        }
        // UtilityProviderUnavailableError (or anything unexpected) — log
        // and fall through to the next configured provider.
        lastUnavailableReason = (e as Error).message;
        this.logger.warn(
          `${provider.name} unavailable, trying next provider: ${lastUnavailableReason}`,
        );
      }
    }

    if (purchaseId) {
      await this.prisma.utilityPurchase.update({
        where: { id: purchaseId },
        data: {
          attemptedProviders: { set: attempted as UtilityProviderName[] },
        },
      });
    }
    return {
      failed: true,
      kind: 'unavailable',
      reason:
        lastUnavailableReason || 'No utility provider is currently available.',
    };
  }

  private async finalizePurchase<
    T extends ElectricityVendResult | AirtimeVendResult,
  >(purchaseId: string, outcome: Outcome<T>) {
    if ('pending' in outcome) {
      return this.prisma.utilityPurchase.update({
        where: { id: purchaseId },
        data: { status: 'PENDING' },
      });
    }
    if ('failed' in outcome) {
      await this.prisma.utilityPurchase.update({
        where: { id: purchaseId },
        data: { status: 'FAILED', failureReason: outcome.reason },
      });
      if (outcome.kind === 'rejected')
        throw new BadRequestException(outcome.reason);
      throw new BadGatewayException(outcome.reason);
    }
    const { providerName, result } = outcome;
    const electricityResult = isElectricityResult(result) ? result : null;
    return this.prisma.utilityPurchase.update({
      where: { id: purchaseId },
      data: {
        status: 'SUCCESSFUL',
        provider: providerName as UtilityProviderName,
        providerRef: result.providerRef,
        token: electricityResult?.token ?? null,
        units: electricityResult?.units ?? null,
        tariff: electricityResult?.tariff ?? null,
      },
    });
  }
}
