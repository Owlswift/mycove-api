export type PaymentGatewayStatus = 'pending' | 'success' | 'failed';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/**
 * Shape a real Paystack client would offer too — initialize starts the
 * transaction, verify polls its current status. Swap MockPaystackGateway for
 * a real implementation behind this interface; nothing else needs to change.
 */
export interface PaymentGateway {
  initialize(params: {
    reference: string;
    amount: number;
  }): Promise<{ authorizationUrl: string }>;
  verify(reference: string): Promise<{ status: PaymentGatewayStatus }>;
}
