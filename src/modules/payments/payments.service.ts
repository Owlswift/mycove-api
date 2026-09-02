import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma, Payment } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AnalyticsService } from '../../common/analytics/analytics.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway.interface';
import type { PaymentGateway } from './gateway/payment-gateway.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private gateway: PaymentGateway,
    private notifications: NotificationsService,
    private analytics: AnalyticsService,
    private wallet: WalletService,
  ) {}

  async initiate(userId: string, estateId: string, dto: InitiatePaymentDto) {
    if (dto.purpose === 'LEVY' && !dto.levyId) {
      throw new BadRequestException('levyId is required when purpose is LEVY');
    }
    if (dto.purpose === 'WALLET_TOPUP' && dto.method === 'WALLET') {
      throw new BadRequestException('Cannot fund the wallet from the wallet itself.');
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { duesLiable: true, email: true, phone: true },
    });
    // The duesLiable gate only makes sense for DUES/LEVY — a resident whose
    // dues/levies are managed by whoever invited them (e.g. a household
    // member) still has their own wallet for airtime/electricity, so
    // funding it must stay available to them.
    if (dto.purpose !== 'WALLET_TOPUP' && !user.duesLiable) {
      throw new BadRequestException('Dues and levies for this household are managed by the resident who invited you.');
    }

    if (dto.method === 'WALLET') {
      return this.initiateWallet(userId, estateId, dto);
    }

    // Paystack requires an email to initialize a transaction; email is
    // optional on User, so fall back to a synthesized address rather than
    // forcing residents to set a real one before they can pay.
    const email = user.email || `${user.phone}@mycove.ng`;

    const reference = `PSK-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
    await this.prisma.payment.create({
      data: {
        userId,
        estateId,
        reference,
        purpose: dto.purpose,
        levyId: dto.levyId,
        amount: dto.amount,
        method: 'PAYSTACK',
      },
    });
    this.analytics.trackUser('payment_initiated', userId, {
      payment_type: dto.purpose,
      amount: dto.amount,
      provider: 'paystack',
      payment_method: 'card',
      estate_id: estateId,
    });

    const { authorizationUrl } = await this.gateway.initialize({
      reference,
      amount: dto.amount,
      email,
    });
    return { reference, authorizationUrl };
  }

  /**
   * Wallet payments settle synchronously — there's no external checkout to
   * redirect to or webhook to wait on, so this both creates and resolves
   * the `Payment` row in one call. [WalletService.debit] throws (400) on
   * insufficient balance *before* anything else is written, so a failed
   * debit never leaves behind a dangling PENDING/SUCCESS row.
   */
  private async initiateWallet(
    userId: string,
    estateId: string,
    dto: InitiatePaymentDto,
  ) {
    const reference = `WLT-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
    const description =
      dto.purpose === 'LEVY' ? 'Levy payment' : 'Dues payment';

    await this.wallet.debit({
      userId,
      estateId,
      amount: dto.amount,
      reference,
      description,
    });

    this.analytics.trackUser('payment_initiated', userId, {
      payment_type: dto.purpose,
      amount: dto.amount,
      provider: 'wallet',
      payment_method: 'wallet',
      estate_id: estateId,
    });

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        estateId,
        reference,
        purpose: dto.purpose,
        levyId: dto.levyId,
        amount: dto.amount,
        method: 'WALLET',
        status: 'SUCCESS',
      },
    });
    await this.settleSuccess(payment);
    return { reference, status: 'SUCCESS' as const };
  }

  async verify(userId: string, reference: string) {
    await this.findOwnPayment(userId, reference); // ownership check only
    return this.confirmByReference(reference);
  }

  /**
   * The actual confirm-and-settle logic — deliberately callable without a
   * userId (looked up from the Payment row itself), so both the
   * client-polled `verify()` above AND the Paystack webhook
   * (PaymentsWebhookController) go through this one path. Idempotent: a
   * payment that's already left PENDING is a no-op, so a retried webhook
   * delivery or a webhook arriving after the client already polled success
   * both land here safely.
   */
  async confirmByReference(reference: string) {
    const payment = await this.prisma.payment.findUnique({ where: { reference } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PENDING') {
      return { status: payment.status };
    }
    const userId = payment.userId;

    const { status } = await this.gateway.verify(reference);
    if (status === 'pending') return { status: 'PENDING' };

    const nextStatus = status === 'success' ? 'SUCCESS' : 'FAILED';
    await this.prisma.$transaction(async (tx) => {
      // Re-check inside the transaction — a concurrent call (webhook racing
      // the client's own poll) could have already settled this between the
      // read above and here.
      const current = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!current || current.status !== 'PENDING') return;

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: nextStatus },
      });
      if (nextStatus === 'SUCCESS' && payment.purpose !== 'WALLET_TOPUP') {
        await this.writeSettlementRecords(tx, payment);
      }
    });

    // Crediting the wallet goes through WalletService's own transaction
    // rather than the one above — [confirmByReference] is idempotent on
    // Payment.status (the PENDING re-check just above short-circuits a
    // retried webhook before this line), so a double-credit here can't
    // happen even though this isn't atomic with the status update.
    if (nextStatus === 'SUCCESS' && payment.purpose === 'WALLET_TOPUP') {
      await this.wallet.credit({
        userId,
        estateId: payment.estateId,
        amount: payment.amount,
        reference: payment.reference,
        description: 'Wallet top-up (Paystack)',
      });
    }

    this.analytics.trackUser(
      nextStatus === 'SUCCESS' ? 'payment_success' : 'payment_failed',
      userId,
      {
        payment_type: payment.purpose,
        amount: payment.amount,
        provider: 'paystack',
        estate_id: payment.estateId,
        duration_ms: 0,
      },
    );

    if (nextStatus === 'SUCCESS') {
      await this.notifications.create(
        userId,
        `Payment of ₦${payment.amount.toLocaleString()} was successful`,
        'payment',
      );
    }

    return { status: nextStatus };
  }

  /**
   * Ledger-side effects of a SUCCESS payment — shared by the Paystack path
   * ([confirmByReference], after the gateway confirms) and the wallet path
   * ([initiateWallet], which is SUCCESS immediately since there's no
   * external gateway to wait on).
   */
  private writeSettlementRecords(
    tx: Prisma.TransactionClient,
    payment: Payment,
  ) {
    const label = payment.method === 'WALLET' ? 'Wallet' : 'Paystack';
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    if (payment.purpose === 'DUES') {
      writes.push(
        tx.duesLedgerEntry.create({
          data: {
            userId: payment.userId,
            estateId: payment.estateId,
            date: 'Today',
            desc: `Dues Payment (${label})`,
            type: 'PAYMENT',
            amount: payment.amount,
          },
        }),
      );
    }
    if (payment.purpose === 'LEVY' && payment.levyId) {
      writes.push(
        tx.levyPayment.upsert({
          where: {
            userId_levyId: { userId: payment.userId, levyId: payment.levyId },
          },
          create: {
            userId: payment.userId,
            levyId: payment.levyId,
            estateId: payment.estateId,
          },
          update: {},
        }),
      );
    }
    return Promise.all(writes);
  }

  private async settleSuccess(payment: Payment) {
    await this.writeSettlementRecords(this.prisma, payment);
    this.analytics.trackUser('payment_success', payment.userId, {
      payment_type: payment.purpose,
      amount: payment.amount,
      provider: 'wallet',
      estate_id: payment.estateId,
      duration_ms: 0,
    });
    await this.notifications.create(
      payment.userId,
      `Payment of ₦${payment.amount.toLocaleString()} was successful`,
      'payment',
    );
  }

  async receipt(userId: string, reference: string) {
    const payment = await this.findOwnPayment(userId, reference);
    if (payment.status !== 'SUCCESS') {
      throw new BadRequestException('This payment has not completed yet.');
    }
    return {
      reference: payment.reference,
      amount: payment.amount,
      method: payment.method === 'WALLET' ? 'Wallet' : 'Paystack',
      date: payment.createdAt,
    };
  }

  private async findOwnPayment(userId: string, reference: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { reference },
    });
    if (!payment || payment.userId !== userId)
      throw new NotFoundException('Payment not found');
    return payment;
  }
}
