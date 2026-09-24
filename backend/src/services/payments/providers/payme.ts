import type { PaymentProvider, CreatePaymentInput, CreatePaymentResult, VerifyPaymentInput, VerifyPaymentResult, WebhookContext, WebhookResult } from '../types';
import { config } from '../../../config';
import { round2 } from '../../../utils/money';
import { safeEqual } from '../crypto';
import { SANDBOX_PAYME } from '../types';

/** Provayder bilan bog'lanishda xato — foydalanuvchiga "vaqtincha ishlamayapti" ko'rsatiladi. */
export class ProviderUnavailableError extends Error {
  code = 'PROVIDER_UNAVAILABLE';
  constructor(message = 'To\'lov provayderi bilan bog\'lanishda xatolik yuz berdi') {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

/** Payme summasini tiyindan so'mga o'tkazadi (controller bilan solishtirish uchun). */
function tiyinToSom(t: number): number {
  return round2(Number(t) / 100);
}

/** Webhook Authorization header'ini tekshiradi (Merchant API auth). */
function isAuthorized(ctx: WebhookContext, creds: { merchantId: string; merchantKey: string }): boolean {
  if (!creds.merchantId || !creds.merchantKey) return false;
  const raw = ctx?.headers?.authorization ?? ctx?.headers?.Authorization;
  const auth = Array.isArray(raw) ? String(raw[0]) : String(raw || '');
  const expected = 'Basic ' + Buffer.from(`${creds.merchantId}:${creds.merchantKey}`).toString('base64');
  return safeEqual(auth, expected) || safeEqual(auth, `Bearer ${creds.merchantKey}`);
}

/**
 * PAYME provider — official merchant API (JSON-RPC) + Checkout redirect.
 *
 * Sxema:
 *  - CreateTransaction: merchant_key bilan JSON-RPC chaqiruvi → trans id.
 *  - Redirect: https://checkout.payme.uz?m=<merchant_id>&ac.order_id=<payment_id>
 *  - Yakuniy holat PerformTransaction / CheckTransaction orqali tekshiriladi.
 *  - Summa tiyinda uzatiladi (so'm × 100).
 *
 * Kredensiallar (PAYME_*) yo'q bo'lsa provayder "ulangan emas".
 */
export class PaymeProvider implements PaymentProvider {
  readonly id = 'PAYME' as const;
  readonly label = 'Payme';

  private get creds() {
    return config.payments.payme;
  }

  private get sandbox() {
    return config.payments.devMode;
  }

  /** Real kredensiallar bo'lsa ularni, aks holda SANDBOX dev kredensiallarini qaytaradi. */
  private get active() {
    const c = this.creds;
    if (c.merchantId && c.merchantKey) return c;
    return {
      merchantId: SANDBOX_PAYME.merchantId,
      merchantKey: SANDBOX_PAYME.merchantKey,
      checkoutUrl: `${config.payments.localOrigin}/api/payments/mock/payme`,
      apiEndpoint: '',
    };
  }

  isConfigured(): boolean {
    if (this.sandbox) return true;
    return Boolean(this.creds.merchantId && this.creds.merchantKey);
  }

  /** Payme summani tiyinda kutadi. */
  private toTiyin(amount: number): number {
    return Math.round(round2(amount) * 100);
  }

  private async rpc(method: string, params: Record<string, any>): Promise<any> {
    if (!this.isConfigured()) throw new Error('PAYME_* kredensiallari sozlanmagan');
    const res = await fetch(this.creds.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.creds.merchantKey}`,
      },
      body: JSON.stringify({ method, params, id: Date.now() }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new ProviderUnavailableError(`PAYME http ${res.status}`);
    }
    const data: any = await res.json();
    if (data && data.error) {
      throw new ProviderUnavailableError(`PAYME ${data.error.code || 'err'}: ${data.error.message || ''}`);
    }
    return data;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      throw new Error('PAYME_* kredensiallari sozlanmagan');
    }
    const a = this.active;
    const amount = this.toTiyin(input.amount);
    let providerTransactionId = input.paymentId;
    if (!this.sandbox) {
      // Real rejimda provayderdan trans id olinadi.
      try {
        const created = await this.rpc('CreateTransaction', {
          amount,
          account: { order_id: input.paymentId },
        });
        providerTransactionId = String(created?.result?.transaction || created?.result?.t || providerTransactionId);
      } catch (err) {
        // Trans yaratishda provayder ishlamay qolsa ham checkout link beramiz;
        // qaytishda status tekshiruvi yakuniy hal qiladi.
        if (err instanceof ProviderUnavailableError) throw err;
      }
    }
    if (this.sandbox) {
      const qs = new URLSearchParams({ m: a.merchantId, 'ac.order_id': input.paymentId, mock_key: config.payments.devMockKey });
      if (input.returnUrl) qs.set('return_url', input.returnUrl);
      return {
        providerPaymentId: providerTransactionId,
        providerTransactionId: input.paymentId,
        checkoutUrl: `${a.checkoutUrl}?${qs.toString()}`,
        status: 'REDIRECT_REQUIRED',
        raw: { order_id: input.paymentId, amount },
      };
    }

    // Rasmiy Payme Checkout: base64(m=...;ac.order_id=...;a=...;c=...)
    const parts = [`m=${a.merchantId}`, `ac.order_id=${input.paymentId}`, `a=${amount}`];
    if (input.returnUrl) parts.push(`c=${input.returnUrl}`);
    const encoded = Buffer.from(parts.join(';'), 'utf8').toString('base64');
    return {
      providerPaymentId: providerTransactionId,
      providerTransactionId: input.paymentId,
      checkoutUrl: `${a.checkoutUrl.replace(/\/$/, '')}/${encoded}`,
      status: 'REDIRECT_REQUIRED',
      raw: { order_id: input.paymentId, amount },
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const transId = input.providerTransactionId || input.paymentId;
    if (this.sandbox) {
      // SANDBOX: tashqi provayderga murojaat qilinmaydi — yakuniy holat
      // imzolangan webhook (mock gateway) orqali keladi.
      return { status: 'PENDING', providerTransactionId: transId };
    }
    if (!this.isConfigured()) {
      // Kredensial yo'q — faqat webhook ma'lumotlariga tayanamiz.
      return { status: 'PENDING', providerTransactionId: transId };
    }
    try {
      const data = await this.rpc('CheckTransaction', { id: transId });
      const txn = data?.result;
      const state = txn?.state;
      // Payme states: 1 = CREATED, 2 = PAID (Perform done), -1/-2 = CANCELLED
      let status: VerifyPaymentResult['status'] = 'PENDING';
      if (state === 2) status = 'PAID';
      else if (state === -1 || state === -2) status = 'CANCELLED';
      else if (state === 1) status = 'PROCESSING';
      return {
        status,
        providerTransactionId: transId,
        providerPaymentId: transId,
        raw: { state },
      };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      return { status: 'PENDING', providerTransactionId: transId };
    }
  }

  async handleWebhook(ctx: WebhookContext): Promise<WebhookResult> {
    // Merchant API autentifikatsiya — imzosiz/soxta webhook bilan to'lovni
    // PAID qilib bo'lmaydi. Provayder ulangan bo'lsa header MAJBURIY.
    if (!isAuthorized(ctx, this.active)) {
      return {
        acknowledged: true,
        action: ctx.body?.method || 'CheckPerformTransaction',
        response: { error: { code: -32504, message: 'Access denied' } },
      };
    }

    const body = ctx.body || {};
    const method = body?.method || '';
    const params = body?.params || {};
    // Merhant API trans id: params.id (Payme transactoin raqami)
    const paymeTransId = params?.id ? String(params?.id) : undefined;
    const accountOrderId = params?.account?.order_id ? String(params?.account?.order_id) : undefined;
    const amount = typeof params?.amount === 'number' ? params.amount : NaN; // tiyinda

    const fail = (code: number, message: string): WebhookResult => ({
      acknowledged: true,
      action: method,
      response: { error: { code, message } },
    });

    switch (method) {
      case 'CheckPerformTransaction': {
        // Faqat summa validatsiyasi — DB tekshiruvi controller'da.
        if (!Number.isFinite(amount) || amount <= 0) {
          return fail(-31090, 'Incorrect amount');
        }
        return {
          acknowledged: true,
          action: method,
          providerTransactionId: accountOrderId || paymeTransId,
          response: { result: { allow: true } },
        };
      }
      case 'CreateTransaction': {
        const response = {
          result: {
            create_time: Date.now(),
            transaction: paymeTransId || `${amount}${accountOrderId || ''}`,
            state: 1,
          },
        };
        return {
          acknowledged: true,
          action: method,
          providerTransactionId: accountOrderId || undefined,
          providerPaymentId: paymeTransId,
          status: 'PROCESSING',
          amount,
          response,
        };
      }
      case 'PerformTransaction': {
        if (!Number.isFinite(amount) || amount <= 0) {
          return fail(-31090, 'Incorrect amount');
        }
        return {
          acknowledged: true,
          action: method,
          providerTransactionId: accountOrderId || undefined,
          providerPaymentId: paymeTransId,
          status: 'PAID',
          amount: tiyinToSom(amount),
          response: { result: { state: 2, transaction: paymeTransId } },
        };
      }
      case 'CheckTransaction': {
        return {
          acknowledged: true,
          action: method,
          providerTransactionId: accountOrderId || undefined,
          providerPaymentId: paymeTransId,
          status: 'PENDING',
          response: { result: { state: 1, transaction: paymeTransId } },
        };
      }
      case 'CancelTransaction': {
        return {
          acknowledged: true,
          action: method,
          providerTransactionId: accountOrderId || undefined,
          providerPaymentId: paymeTransId,
          status: 'CANCELLED',
          response: { result: { state: -1, transaction: paymeTransId } },
        };
      }
      default:
        return fail(-32400, 'Method not found');
    }
  }
}