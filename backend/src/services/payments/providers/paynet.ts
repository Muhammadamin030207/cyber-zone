import type { PaymentProvider, CreatePaymentInput, CreatePaymentResult, VerifyPaymentInput, VerifyPaymentResult, WebhookContext, WebhookResult } from '../types';
import { config } from '../../../config';
import { ProviderNotConfiguredError } from '../types';

/**
 * PAYNET provider.
 *
 * Paynet rasmiy merhant API spetsifikatsiyasi tasdiqlangan paytda
 * to'ldiriladi. Hozircha faqat struktura:
 *  - PAYNET_MERCHANT_ID / PAYNET_PASSWORD env'da bo'lmasa — "integratsiya ulangan emas".
 *  - Soxta "muvaffaqiyatli" javob hech qachon qaytarilmaydi.
 */
export class PaynetProvider implements PaymentProvider {
  readonly id = 'PAYNET' as const;
  readonly label = 'Paynet';

  private get creds() {
    return config.payments.paynet;
  }

  isConfigured(): boolean {
    return Boolean(this.creds.merchantId && this.creds.password);
  }

  async createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError('Paynet to\'lov xizmati hali ulangan emas');
    }
    throw new ProviderNotConfiguredError('Paynet adapteri rasmiy spetsifikatsiya asosida to\'ldirilmagan');
  }

  async verifyPayment(_input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError('Paynet to\'lov xizmati hali ulangan emas');
    }
    return { status: 'PENDING' };
  }

  async handleWebhook(ctx: WebhookContext): Promise<WebhookResult> {
    return {
      acknowledged: true,
      action: (ctx.body?.action as string) || 'unknown',
      status: 'PENDING',
      response: { error: -1, error_note: 'Not implemented' },
    };
  }
}