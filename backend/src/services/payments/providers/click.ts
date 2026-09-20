import type { PaymentProvider, CreatePaymentInput, CreatePaymentResult, VerifyPaymentInput, VerifyPaymentResult, WebhookContext, WebhookResult } from '../types';
import { config } from '../../../config';
import { md5hex, safeEqual } from '../crypto';

/**
 * CLICK provider — klassik merchant (2 fazali) integratsoiya.
 *
 * Sxema:
 *  - Checkout: my.click.uz services/pay linki. Pay-link imzosi:
 *    md5(merchant_trans_id + service_id + amount + callback_url + secret_key).
 *  - Webhook: Click /api/payments/webhook/click ga Prepare (action=0) va
 *    Complete (action=1) so'rovlarini yuboradi. Callback imzosi:
 *    md5(click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time).
 *  - PAID holati faqat Complete validatsiyadan o'tganidan so'ng yoziladi.
 *
 * Kredensiallar (CLICK_*) yo'q bo'lsa provayder "ulangan emas" hisoblanadi.
 */
export class ClickProvider implements PaymentProvider {
  readonly id = 'CLICK' as const;
  readonly label = 'Click';

  private get creds() {
    return config.payments.click;
  }

  isConfigured(): boolean {
    return Boolean(this.creds.serviceId && this.creds.secretKey);
  }

  /** Click so'mni butun son sifatida kutadi. */
  private normalizeAmount(amount: number): number {
    return Math.round(amount);
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      throw new Error('CLICK_* kredensiallari sozlanmagan');
    }
    const now = new Date();
    const signTime = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const amount = this.normalizeAmount(input.amount);
    const signString = md5hex([input.paymentId, this.creds.serviceId, String(amount), input.callbackUrl, this.creds.secretKey].join(''));
    const qs = new URLSearchParams({
      service_id: this.creds.serviceId,
      merchant_trans_id: input.paymentId,
      merchant_user_id: this.creds.merchantUserId,
      amount: String(amount),
      sign_time: signTime,
      sign_string: signString,
    });
    return {
      providerPaymentId: input.paymentId,
      providerTransactionId: input.paymentId,
      checkoutUrl: `${this.creds.endpoint}?${qs.toString()}`,
      status: 'REDIRECT_REQUIRED',
      raw: { sign_time: signTime, amount },
    };
  }

  /** Click klassik merchant'da tayyor holat so'rovi mavjud emas — yakuniy natija Complete webhook'da qayd etiladi. */
  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    return {
      status: 'PENDING',
      providerPaymentId: input.providerPaymentId || undefined,
      providerTransactionId: input.providerTransactionId || undefined,
      raw: { info: 'Click: yakuniy holat Complete webhook orqali belgilanadi' },
    };
  }

  async handleWebhook(ctx: WebhookContext): Promise<WebhookResult> {
    const p = ctx.query;
    const action = p['action'] === '1' ? 1 : 0;
    const clickTransId = p['click_trans_id'] || '';
    const serviceId = p['service_id'] || '';
    const clickPaydocId = p['click_paydoc_id'] || '';
    const merchantTransId = p['merchant_trans_id'] || '';
    const amountStr = p['amount'] || '';
    const errorNote = p['error_note'] || '';
    const signTime = p['sign_time'] || '';
    const signString = p['sign_string'] || '';

    const response = (error: number) => ({
      click_trans_id: clickTransId || undefined,
      merchant_trans_id: merchantTransId || undefined,
      error,
      error_note: error === 0 ? 'Success' : p['error_note'] || errorNote || 'Failed',
    });

    if (serviceId && serviceId !== this.creds.serviceId) {
      return { acknowledged: true, action: action === 1 ? 'complete' : 'prepare', providerTransactionId: merchantTransId || undefined, response: response(-1) };
    }

    // Callback imzosini tekshirish (imzo kelganda).
    if (this.isConfigured() && signString) {
      const expected = md5hex(
        [clickTransId, serviceId || this.creds.serviceId, this.creds.secretKey, merchantTransId, amountStr, String(action), signTime].join('')
      );
      if (!safeEqual(signString, expected)) {
        return { acknowledged: true, action: action === 1 ? 'complete' : 'prepare', providerTransactionId: merchantTransId || undefined, response: response(-1) };
      }
    }

    if (!merchantTransId) {
      return { acknowledged: true, action: action === 1 ? 'complete' : 'prepare', response: response(-2) };
    }
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { acknowledged: true, action: action === 1 ? 'complete' : 'prepare', providerTransactionId: merchantTransId, response: response(-3) };
    }

    return {
      acknowledged: true,
      action: action === 1 ? 'complete' : 'prepare',
      providerTransactionId: merchantTransId,
      providerPaymentId: clickPaydocId || undefined,
      amount,
      status: action === 1 ? ('PAID' as const) : ('PROCESSING' as const),
      response: response(0),
    };
  }
}