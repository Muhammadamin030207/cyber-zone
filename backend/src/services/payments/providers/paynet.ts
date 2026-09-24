import type { PaymentProvider, CreatePaymentInput, CreatePaymentResult, VerifyPaymentInput, VerifyPaymentResult, WebhookContext, WebhookResult } from '../types';
import { config } from '../../../config';
import { SANDBOX_PAYNET } from '../types';
import { md5hex, safeEqual } from '../crypto';
import { round2 } from '../../../utils/money';
import { ProviderUnavailableError } from './payme';

/**
 * PAYNET — merchant JSON-RPC (GetInformation / PerformTransaction) + checkout.
 *
 * Checkout: PAYNET_CHECKOUT_URL ga imzolangan hisob (account = paymentId).
 * Webhook: Paynet merchant API bizning /webhook/paynet ga JSON-RPC yuboradi.
 * Auth: HTTP Basic merchantId:password.
 * Summa tiyinda keladi.
 */
export class PaynetProvider implements PaymentProvider {
  readonly id = 'PAYNET' as const;
  readonly label = 'Paynet';

  private get creds() {
    return config.payments.paynet;
  }

  private get sandbox() {
    return config.payments.devMode;
  }

  private get active() {
    const c = this.creds;
    if (c.merchantId && c.password) return c;
    return {
      merchantId: SANDBOX_PAYNET.merchantId,
      password: SANDBOX_PAYNET.password,
      serviceId: SANDBOX_PAYNET.serviceId,
      checkoutUrl: `${config.payments.localOrigin}/api/payments/mock/paynet`,
      apiEndpoint: '',
    };
  }

  isConfigured(): boolean {
    if (this.sandbox) return true;
    return Boolean(this.creds.merchantId && this.creds.password);
  }

  private toTiyin(amount: number): number {
    return Math.round(round2(amount) * 100);
  }

  private sign(paymentId: string, amountTiyin: number, time: string): string {
    const a = this.active;
    return md5hex([paymentId, a.merchantId, String(amountTiyin), time, a.password].join(''));
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.isConfigured()) {
      throw new Error("PAYNET_* kredensiallari sozlanmagan");
    }
    const a = this.active;
    const amount = this.toTiyin(input.amount);
    const signTime = String(Date.now());
    const qs = new URLSearchParams({
      merchant_id: a.merchantId,
      service_id: a.serviceId || a.merchantId,
      account: input.paymentId,
      order_id: input.paymentId,
      amount: String(amount),
      sign_time: signTime,
      sign: this.sign(input.paymentId, amount, signTime),
    });
    if (input.returnUrl) qs.set('return_url', input.returnUrl);
    if (this.sandbox) qs.set('mock_key', config.payments.devMockKey);

    return {
      providerPaymentId: input.paymentId,
      providerTransactionId: input.paymentId,
      checkoutUrl: `${a.checkoutUrl}${a.checkoutUrl.includes('?') ? '&' : '?'}${qs.toString()}`,
      status: 'REDIRECT_REQUIRED',
      raw: { amount, signTime },
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const transId = input.providerTransactionId || input.paymentId;
    if (this.sandbox) {
      return { status: 'PENDING', providerTransactionId: transId };
    }
    if (!this.isConfigured() || !this.creds.apiEndpoint) {
      return { status: 'PENDING', providerTransactionId: transId };
    }
    try {
      const a = this.active;
      const res = await fetch(a.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + Buffer.from(`${a.merchantId}:${a.password}`).toString('base64'),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'GetTransaction',
          params: { transactionId: transId, account: input.paymentId },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new ProviderUnavailableError(`Paynet http ${res.status}`);
      const data: any = await res.json();
      const state = String(data?.result?.status || data?.result?.state || '').toUpperCase();
      let status: VerifyPaymentResult['status'] = 'PENDING';
      if (['SUCCESS', 'PAID', 'OK', '1', '2'].includes(state)) status = 'PAID';
      else if (['CANCELLED', 'FAILED', 'ERROR', '-1'].includes(state)) status = 'CANCELLED';
      return { status, providerTransactionId: transId, raw: data?.result };
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      return { status: 'PENDING', providerTransactionId: transId };
    }
  }

  async handleWebhook(ctx: WebhookContext): Promise<WebhookResult> {
    const a = this.active;
    const rawAuth = ctx.headers?.authorization ?? ctx.headers?.Authorization;
    const auth = Array.isArray(rawAuth) ? String(rawAuth[0]) : String(rawAuth || '');
    const expected = 'Basic ' + Buffer.from(`${a.merchantId}:${a.password}`).toString('base64');
    if (!safeEqual(auth, expected)) {
      return {
        acknowledged: true,
        action: 'denied',
        response: { jsonrpc: '2.0', id: ctx.body?.id || null, error: { code: -32504, message: 'Access denied' } },
      };
    }

    const body = ctx.body || {};
    const method = String(body.method || ctx.query.method || 'PerformTransaction');
    const params = body.params || {};
    const fields = params.fields || {};
    const account = String(fields.id || fields.account || params.account || ctx.query.order_id || ctx.query.account || '');
    const paynetTransId = params.transactionId ? String(params.transactionId) : undefined;
    const amountTiyin = Number(params.amount);
    const amount = Number.isFinite(amountTiyin) ? round2(amountTiyin / 100) : undefined;
    const rpcId = body.id ?? 1;

    const ok = (result: Record<string, unknown>, extra: Partial<WebhookResult> = {}): WebhookResult => ({
      acknowledged: true,
      action: method,
      providerTransactionId: account || undefined,
      providerPaymentId: paynetTransId,
      amount,
      response: { jsonrpc: '2.0', id: rpcId, result },
      ...extra,
    });

    if (method === 'GetInformation' || method === 'CheckTransaction') {
      return ok({ status: 'OK', timestamp: Date.now() }, { status: 'PROCESSING' });
    }
    if (method === 'CancelTransaction') {
      return ok({ status: 'CANCELED', timestamp: Date.now() }, { status: 'CANCELLED' });
    }
    // PerformTransaction — to'lov yakunlandi
    if (!account) {
      return {
        acknowledged: true,
        action: method,
        response: { jsonrpc: '2.0', id: rpcId, error: { code: -32602, message: 'account required' } },
      };
    }
    if (!Number.isFinite(amountTiyin) || amountTiyin <= 0) {
      return {
        acknowledged: true,
        action: method,
        providerTransactionId: account,
        response: { jsonrpc: '2.0', id: rpcId, error: { code: -32602, message: 'Incorrect amount' } },
      };
    }
    return ok({ status: 'OK', timestamp: Date.now(), transactionId: paynetTransId }, { status: 'PAID' });
  }
}
