import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, WalletTransactionType } from '@prisma/client';
import { AnalyticsService } from '../../common/analytics/analytics.service';
import { PrismaService } from '../../database/prisma.service';

interface LedgerParams {
  userId: string;
  estateId: string;
  amount: number;
  reference: string;
  description?: string;
  utilityPurchaseId?: string;
}

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private analytics: AnalyticsService,
  ) {}

  private getOrCreateWallet(
    tx: Prisma.TransactionClient,
    userId: string,
    estateId: string,
  ) {
    return tx.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId, estateId, balance: 0 },
    });
  }

  async getBalance(userId: string, estateId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(this.prisma, userId, estateId);
    return wallet.balance;
  }

  /**
   * Adds money to the wallet — used for both real top-ups and refunding a
   * purchase that debited the wallet but then failed (e.g. a VTpass 099
   * that later resolves to failure via the callback). [reference] must be
   * unique so retrying an already-applied credit is a no-op rather than a
   * double-credit — callers should catch the resulting unique-constraint
   * error and treat it as "already applied", not surface it as a failure.
   */
  credit(params: LedgerParams & { type?: WalletTransactionType }) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.getOrCreateWallet(
        tx,
        params.userId,
        params.estateId,
      );
      const balanceAfter = wallet.balance + params.amount;
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });
      return tx.walletTransaction.create({
        data: {
          estateId: params.estateId,
          userId: params.userId,
          walletId: wallet.id,
          type: params.type ?? 'TOPUP',
          amount: params.amount,
          balanceAfter,
          reference: params.reference,
          description: params.description,
          utilityPurchaseId: params.utilityPurchaseId,
        },
      }).then((tx2) => {
        this.analytics.track('wallet_transaction', params.userId, {
          type: tx2.type,
          amount: tx2.amount,
          balance_after: tx2.balanceAfter,
          estate_id: params.estateId,
        });
        return tx2;
      });
    });
  }

  refund(params: LedgerParams) {
    return this.credit({ ...params, type: 'REFUND' });
  }

  /**
   * Debits the wallet for a purchase. Throws BadRequestException on
   * insufficient balance — callers should check this *before* calling a
   * slow external provider (VTpass/BuyPower), not just let the debit fail
   * after the vend already happened.
   */
  debit(params: LedgerParams) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.getOrCreateWallet(
        tx,
        params.userId,
        params.estateId,
      );
      if (wallet.balance < params.amount) {
        throw new BadRequestException('Insufficient wallet balance.');
      }
      const balanceAfter = wallet.balance - params.amount;
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });
      return tx.walletTransaction.create({
        data: {
          estateId: params.estateId,
          userId: params.userId,
          walletId: wallet.id,
          type: 'PURCHASE_DEBIT',
          amount: params.amount,
          balanceAfter,
          reference: params.reference,
          description: params.description,
          utilityPurchaseId: params.utilityPurchaseId,
        },
      });
    });
  }

  listTransactions(userId: string, estateId: string) {
    return this.prisma.walletTransaction.findMany({
      where: { userId, estateId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
