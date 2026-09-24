export type ProviderId = 'CLICK' | 'PAYME' | 'UZUM' | 'PAYNET';

/**
 * SANDBOX (dev) kredensiallari — real CLICK_ va PAYME_ env o'zgarmayganda
 * checkout/webhook oqimini lokal sinash uchun. Webhook imzosi HAMON
 * mana shu dev secret bilan tekshiriladi — "soxta PAID" qabul qilinmaydi.
 */
export const SANDBOX_CLICK = {
  serviceId: 'dev-click-service',
  merchantUserId: 'dev-click-user',
  secretKey: 'dev-click-secret',
} as const;

export const SANDBOX_PAYME = {
  merchantId: 'dev-payme-merchant',
  merchantKey: 'dev-payme-secret',
} as const;

export const SANDBOX_UZUM = {
  merchantId: 'dev-uzum-terminal',
  secretKey: 'dev-uzum-secret',
} as const;

export const SANDBOX_PAYNET = {
  merchantId: 'dev-paynet-merchant',
  password: 'dev-paynet-secret',
  serviceId: 'dev-paynet-service',
} as const;

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
  /** Payment.metadata — provayder holatini saqlash uchun */
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
  /** Body kelgan paytdagi xom baytlar (Uzum kabi raw-body imzosini tekshirish uchun) */
  rawBody?: Buffer | string;
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