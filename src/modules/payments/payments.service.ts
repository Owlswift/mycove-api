import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AnalyticsService } from '../../common/analytics/analytics.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway.interface';
import type { PaymentGateway } from './gateway/payment-gateway.interface';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private gateway: PaymentGateway,
    private notifications: NotificationsService,
    private analytics: AnalyticsService,
  ) {}

  async initiate(userId: string, estateId: string, dto: InitiatePaymentDto) {
    if (dto.purpose === 'LEVY' && !dto.levyId) {
      throw new BadRequestException('levyId is required when purpose is LEVY');
    }
    if (dto.purpose === 'DUES' || dto.purpose === 'LEVY') {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { duesLiable: true } });
      if (!user.duesLiable) {
        throw new BadRequestException('Dues and levies for this household are managed by the resident who invited you.');
      }
    }

    const reference = `PSK-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
    await this.prisma.payment.create({
      data: {
        userId,
        estateId,
        reference,
        purpose: dto.purpose,
        levyId: dto.levyId,
        amount: dto.amount,
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
    });
    return { reference, authorizationUrl };
  }

  async verify(userId: string, reference: string) {
    const payment = await this.findOwnPayment(userId, reference);
    if (payment.status !== 'PENDING') {
      return { status: payment.status };
    }

    const { status } = await this.gateway.verify(reference);
    if (status === 'pending') return { status: 'PENDING' };

    const nextStatus = status === 'success' ? 'SUCCESS' : 'FAILED';
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: nextStatus },
      });
      if (nextStatus === 'SUCCESS' && payment.purpose === 'DUES') {
        await tx.duesLedgerEntry.create({
          data: {
            userId,
            estateId: payment.estateId,
            date: 'Today',
            desc: 'Dues Payment (Paystack)',
            type: 'PAYMENT',
            amount: payment.amount,
          },
        });
      }
      if (
        nextStatus === 'SUCCESS' &&
        payment.purpose === 'LEVY' &&
        payment.levyId
      ) {
        await tx.levyPayment.upsert({
          where: { userId_levyId: { userId, levyId: payment.levyId } },
          create: { userId, levyId: payment.levyId, estateId: payment.estateId },
          update: {},
        });
      }
    });

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

  async receipt(userId: string, reference: string) {
    const payment = await this.findOwnPayment(userId, reference);
    if (payment.status !== 'SUCCESS') {
      throw new BadRequestException('This payment has not completed yet.');
    }
    return {
      reference: payment.reference,
      amount: payment.amount,
      method: 'Paystack',
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
