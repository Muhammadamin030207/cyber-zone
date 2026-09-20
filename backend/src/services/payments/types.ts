export type ProviderId = 'CLICK' | 'PAYME' | 'UZUM' | 'PAYNET' | 'TEST';

export type ProviderPaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'REDIRECT_REQUIRED'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

/** Provayder kredensiallari yo'q — real integratsoiya hali ulangan emas. */
export class ProviderNotConfiguredError extends Error {
  code = 'PROVIDER_NOT_CONFIGURED';
  constructor(message = 'Ushbu to\'lov provayderi hali ulangan emas') {
    super(message);
    this.name = 'ProviderNotConfiguredError';
  }
}

export interface CreatePaymentInput {
  /** Bizning Payment rekord id (merchant_trans_id sifatida ishlatiladi) */
  paymentId: string;
  bookingId: string;
  /** Server tomonidan hisoblangan summa */
  amount: number;
  currency: string;
  depositPercent: number;
  description?: string;
  /** Backend webhook (provider bizga chaqiradi) */
  callbackUrl: string;
  /** Frontend qaytish sahifasi */
  returnUrl?: string;
  userId?: string;
  /** Provider'ga xos account parametrlari (order_id va h.k.) */
  account?: Record<string, string | number>;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  /** Idempotency uchun yagona transaction id */
  providerTransactionId: string;
  /** Provider checkout URL (kredensial yo'q bo'lsa null) */
  checkoutUrl: string | null;
  expiresAt?: Date;
  status: ProviderPaymentStatus;
  raw?: Record<string, any>;
}

export interface VerifyPaymentInput {
  paymentId: string;
  providerPaymentId?: string | null;
  providerTransactionId?: string | null;
  amount: number;
  currency: string;
  /** Payment.metadata — provayder holatini saqlash uchun (test uchun qulay) */
  storedMetadata?: Record<string, any> | null;
}

export interface VerifyPaymentResult {
  status: ProviderPaymentStatus;
  providerPaymentId?: string;
  providerTransactionId?: string;
  failureReason?: string;
  raw?: Record<string, any>;
}

export interface WebhookContext {
  provider: ProviderId;
  /** express raw → JSON parse qilingan body (Click uchun query params) */
  body: any;
  query: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  /** Provider chaqiradigan mutlaq URL (Click callbacksida sign ishlatiladi) */
  url?: string;
}

export interface WebhookResult {
  acknowledged: boolean;
  action: string;
  providerTransactionId?: string;
  providerPaymentId?: string;
  status?: ProviderPaymentStatus;
  amount?: number;
  /** Provider'ga qaytariladigan maxsus javob (Click prepare/complete) */
  response?: any;
}

export interface PaymentProvider {
  id: ProviderId;
  label: string;
  isConfigured(): boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  handleWebhook(ctx: WebhookContext): Promise<WebhookResult>;
}