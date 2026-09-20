import type { PaymentProvider, CreatePaymentInput, CreatePaymentResult, VerifyPaymentInput, VerifyPaymentResult, WebhookContext, WebhookResult } from '../types';
import { config } from '../../../config';
import { ProviderNotConfiguredError } from '../types';

/**
 * UZUM provider.
 *
 * Uzum Bank rasmiy merhant API spetsifikatsiyasi tasdiqlangan migyosda
 * backend'ga ulangan paytda to'ldiriladi. Hozircha faqat struktura:
 *  - UZUM_MERCHANT_ID / UZUM_SECRET_KEY env'da bo'lmasa — "integratsiya ulangan emas".
 *  - Bu provayder orqali to'lov yaratish uringanda ProviderNotConfiguredError
 *    qaytadi — hech qachon soxta "muvaffaqiyatli" javob bermaydi.
 */
export class UzumProvider implements PaymentProvider {
  readonly id = 'UZUM' as const;
  readonly label = 'Uzum';

  private get creds() {
    return config.payments.uzum;
  }

  isConfigured(): boolean {
    return Boolean(this.creds.merchantId && this.creds.secretKey);
  }

  async createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError('Uzum to\'lov xizmati hali ulangan emas');
    }
    throw new ProviderNotConfiguredError('Uzum adapteri rasmiy spetsifikatsiya asosida to\'ldirilmagan');
  }

  async verifyPayment(_input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError('Uzum to\'lov xizmati hali ulangan emas');
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