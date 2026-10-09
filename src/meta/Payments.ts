/**
 * Real-money purchases go through a PaymentProvider.
 * The shipped provider is a *sandbox*: it is explicit in the UI ("MODE TEST")
 * and grants the product without charging. A Google Play Billing provider can
 * implement the same interface once the store listing exists.
 */
export interface PaymentProvider {
  readonly id: string;
  readonly sandbox: boolean;
  purchase(productId: string): Promise<{ ok: boolean; error?: string }>;
}
export class SandboxPayments implements PaymentProvider {
  readonly id = 'sandbox';
  readonly sandbox = true;
  async purchase(productId: string) {
    await new Promise((r) => setTimeout(r, 450));
    return productId ? { ok: true } : { ok: false, error: 'invalid product' };
  }
}
export const payments: PaymentProvider = new SandboxPayments();
