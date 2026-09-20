import type { PaymentProvider, CreatePaymentInput, CreatePaymentResult, VerifyPaymentInput, VerifyPaymentResult, WebhookContext, WebhookResult } from '../types';
import { config } from '../../../config';

/**
 * TEST provayder — faqat PAYMENTS_MODE=test bo'lganda ishlaydi.
 * Real to'lov amalga oshirmaydi, lekin to'liq server-side jarayonni
 * (yaratish -> confirm -> verify -> PAID) haqiyqiy arxitektura bo'ylab
 * ishlatadi. Ishlab chiqish/smoke-test uchun mo'ljallangan.
 */
export class TestProvider implements PaymentProvider {
  readonly id = 'TEST' as const;
  readonly label = 'Test Provider';

  isConfigured(): boolean {
    return config.payments.mode === 'test';
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      throw new Error('TEST provayder faqat test rejimda ishlaydi');
    }
    const providerPaymentId = `TEST-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
    // Checkout URL frontend'ning test to'lov sahifasiga ishora qiladi.
    // Test provider server-side /payments/test/:id/confirm bilan yakunlanadi.
    const frontendBase = config.frontendUrls[0] || 'http://localhost:3006';
    return {
      providerPaymentId,
      providerTransactionId: providerPaymentId,
      checkoutUrl: `${frontendBase}/checkout/${input.bookingId}/pay?pid=${input.paymentId}&test=1`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      status: 'REDIRECT_REQUIRED',
      raw: { test: true, paymentId: input.paymentId, bookingId: input.bookingId },
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const confirmed = !!(input.storedMetadata && (input.storedMetadata as any).test_confirmed_at);
    return {
      status: confirmed ? 'PAID' : 'PENDING',
      providerPaymentId: input.providerPaymentId || undefined,
      providerTransactionId: input.providerTransactionId || undefined,
      raw: { test: true, confirmed },
    };
  }

  /** Test confirm faqat test rejimda chaqiriladi. Server bu natijani DB'ga saqlaydi. */
  async confirmTest(): Promise<VerifyPaymentResult> {
    if (!this.isConfigured()) {
      throw new Error('Test confirm faqat test rejimda mavjud');
    }
    return { status: 'PAID', raw: { test: true, confirmed: true } };
  }

  async handleWebhook(_ctx: WebhookContext): Promise<WebhookResult> {
    return { acknowledged: true, action: 'ignored', status: 'PENDING' };
  }
}