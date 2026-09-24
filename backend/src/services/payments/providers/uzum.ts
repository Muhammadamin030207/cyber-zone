import type { PaymentProvider, CreatePaymentInput, CreatePaymentResult, VerifyPaymentInput, VerifyPaymentResult, WebhookContext, WebhookResult } from '../types';
import { config } from '../../../config';
import { SANDBOX_UZUM } from '../types';
import { hmacSha256hex, safeEqual } from '../crypto';
import { round2 } from '../../../utils/money';
import { ProviderUnavailableError } from './payme';
import { paymentsSandbox } from '../../../config/paymentsRuntime';

/**
 * UZUM Checkout — rasmiy acquiring (X-Terminal-Id + X-API-Key).
 *
 * Create: POST /api/v1/payment/register → paymentRedirectUrl
 * Status: GET  /api/v1/payment/{orderId}
 * Callback: JSON { orderNumber, orderId, operationState, amount (tiyin) }
 * Imzo: X-Sign = HMAC-SHA256(rawBody, apiKey) yoki Basic terminal:apiKey
 */
export class UzumProvider implements PaymentProvider {
  readonly id = 'UZUM' as const;
  readonly label = 'Uzum';

  private get creds() {
    return config.payments.uzum;
  }

  private get sandbox() {
    return paymentsSandbox();
  }

  private get active() {
    const c = this.creds;
    if (c.merchantId && c.secretKey) return c;
    return {
      merchantId: SANDBOX_UZUM.merchantId,
      secretKey: SANDBOX_UZUM.secretKey,
      checkoutUrl: `${config.payments.localOrigin}/api/payments/mock/uzum`,
      apiEndpoint: '',
    };
  }

  isConfigured(): boolean {
    if (this.sandbox) return true;
    return Boolean(this.creds.merchantId && this.creds.secretKey);
  }

  private toTiyin(amount: number): number {
    return Math.round(round2(amount) * 100);
  }

  private headers() {
    const a = this.active;
    return {
      'Content-Type': 'application/json',
      'Content-Language': 'uz',
      'X-Terminal-Id': a.merchantId,
      'X-API-Key': a.secretKey,
    };
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      throw new Error("UZUM_* kredensiallari sozlanmagan");
    }
    const a = this.active;
    const amount = this.toTiyin(input.amount);

    if (this.sandbox) {
      const checkoutUrl = input.sandboxBaseUrl ? `${input.sandboxBaseUrl}/api/payments/mock/uzum` : a.checkoutUrl;
      const qs = new URLSearchParams({
        order_id: input.paymentId,
        amount: String(amount),
        mock_key: config.payments.devMockKey,
      });
      if (input.returnUrl) qs.set('return_url', input.returnUrl);
      return {
        providerPaymentId: input.paymentId,
        providerTransactionId: input.paymentId,
        checkoutUrl: `${checkoutUrl}?${qs.toString()}`,
        status: 'REDIRECT_REQUIRED',
        raw: { orderNumber: input.paymentId, amount },
      };
    }

    const endpoint = `${a.apiEndpoint.replace(/\/$/, '')}/api/v1/payment/register`;
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          amount,
          clientId: input.userId || input.paymentId,
          currency: '860',
          paymentDetails: input.description || `Cyber-ZONE ${input.bookingId}`,
          sessionTimeoutSecs: 1800,
          successUrl: input.returnUrl,
          failureUrl: input.returnUrl,
          viewType: 'REDIRECT',
          orderNumber: input.paymentId,
          merchantOrderId: input.paymentId,
          callbackUrl: input.callbackUrl,
          payType: 'ONE_STEP',
        }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ProviderUnavailableError("Uzum Checkout bilan bog'lanib bo'lmadi");
    }

    if (!res.ok) {
      throw new ProviderUnavailableError(`Uzum Checkout http ${res.status}`);
    }

    const data: any = await res.json().catch(() => ({}));
    const result = data?.result || data?.data || data;
    const orderId = String(result?.orderId || result?.paymentId || input.paymentId);
    const checkoutUrl =
      result?.paymentRedirectUrl ||
      result?.redirectUrl ||
      result?.paymentUrl ||
      `${a.checkoutUrl.replace(/\/$/, '')}/pay/${orderId}`;

    if (data?.errorCode && Number(data.errorCode) !== 0) {
      throw new ProviderUnavailableError(`Uzum: ${data.errorMessage || data.errorCode}`);
    }

    return {
      providerPaymentId: orderId,
      providerTransactionId: input.paymentId,
      checkoutUrl,
      status: 'REDIRECT_REQUIRED',
      raw: { orderId, amount },
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const transId = input.providerPaymentId || input.providerTransactionId || input.paymentId;
    if (this.sandbox) {
      return { status: 'PENDING', providerTransactionId: transId };
    }
    if (!this.isConfigured() || !this.creds.apiEndpoint) {
      return { status: 'PENDING', providerTransactionId: transId };
    }
    try {
      const url = `${this.creds.apiEndpoint.replace(/\/$/, '')}/api/v1/payment/${encodeURIComponent(String(transId))}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new ProviderUnavailableError(`Uzum status http ${res.status}`);
      const data: any = await res.json();
      const result = data?.result || data?.data || data;
      const state = String(result?.operationState || result?.status || result?.state || '').toUpperCase();
      let status: VerifyPaymentResult['status'] = 'PENDING';
      if (['SUCCESS', 'COMPLETED', 'PAID', 'CAPTURED'].includes(state)) status = 'PAID';
      else if (['CANCEL', 'CANCELLED', 'FAILED', 'ERROR', 'REVERSED'].includes(state)) status = 'CANCELLED';
      else if (['REGISTERED', 'PROCESSING', 'HOLD', 'AUTHORIZED'].includes(state)) status = 'PROCESSING';
      return {
        status,
        providerPaymentId: String(result?.orderId || transId),
        providerTransactionId: input.paymentId,
        raw: { state },
      };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      return { status: 'PENDING', providerTransactionId: transId };
    }
  }

  async handleWebhook(ctx: WebhookContext): Promise<WebhookResult> {
    const a = this.active;
    const rawAuth = ctx.headers?.authorization ?? ctx.headers?.Authorization;
    const auth = Array.isArray(rawAuth) ? String(rawAuth[0]) : String(rawAuth || '');
    const expectedBasic = 'Basic ' + Buffer.from(`${a.merchantId}:${a.secretKey}`).toString('base64');
    const signHeader = ctx.headers?.['x-sign'] ?? ctx.headers?.['X-Sign'] ?? ctx.headers?.['x-signature'];
    const sign = Array.isArray(signHeader) ? String(signHeader[0]) : String(signHeader || '');
    const bodyStr =
      typeof ctx.body === 'string'
        ? ctx.body
        : ctx.rawBody
          ? ctx.rawBody.toString('utf8')
          : '';

    // Uzum X-Sign HMAC-SHA256(apiKey, RAW body) ustidan hisoblaydi. Bizda raw body
    // server tomonidan saqlanadi (express verify) — aynan shu baytlar imzolanadi,
    // qayta-serializatsiya emas (JSON kalit tartibi o'zgarishi → imzo buzilishi oldini oladi).
    let expectedHmac = '';
    if (bodyStr) {
      expectedHmac = hmacSha256hex(a.secretKey, bodyStr);
    } else {
      const reserialized = JSON.stringify(ctx.body || {});
      if (reserialized) expectedHmac = hmacSha256hex(a.secretKey, reserialized);
    }
    const authorized = safeEqual(auth, expectedBasic) || (sign ? safeEqual(sign.toLowerCase(), expectedHmac.toLowerCase()) : false);

    if (!authorized) {
      return { acknowledged: true, action: 'denied', response: { errorCode: -1, errorMessage: 'Access denied' } };
    }

    const body = ctx.body || {};
    const payload = body.result || body.data || body;
    const orderNumber = String(payload.orderNumber || payload.merchantOrderId || payload.order_id || '');
    const orderId = payload.orderId ? String(payload.orderId) : undefined;
    const state = String(payload.operationState || payload.status || payload.state || '').toUpperCase();
    const amountTiyin = Number(payload.amount);
    const amount = Number.isFinite(amountTiyin) ? round2(amountTiyin / 100) : undefined;

    let status: WebhookResult['status'] = 'PROCESSING';
    if (['SUCCESS', 'COMPLETED', 'PAID', 'CAPTURED'].includes(state)) status = 'PAID';
    else if (['CANCEL', 'CANCELLED', 'FAILED', 'ERROR', 'REVERSED'].includes(state)) status = 'CANCELLED';

    return {
      acknowledged: true,
      action: state || 'callback',
      providerTransactionId: orderNumber || undefined,
      providerPaymentId: orderId,
      status,
      amount,
      response: { errorCode: 0 },
    };
  }
}
