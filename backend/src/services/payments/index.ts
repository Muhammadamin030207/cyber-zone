import type { PaymentProvider, ProviderId } from './types';
import { ClickProvider } from './providers/click';
import { PaymeProvider } from './providers/payme';
import { UzumProvider } from './providers/uzum';
import { PaynetProvider } from './providers/paynet';

export type * from './types';
export { ProviderNotConfiguredError, type ProviderId, type PaymentProvider, SANDBOX_CLICK, SANDBOX_PAYME } from './types';
export { ProviderUnavailableError } from './providers/payme';

const instances: Record<ProviderId, PaymentProvider> = {
  CLICK: new ClickProvider(),
  PAYME: new PaymeProvider(),
  UZUM: new UzumProvider(),
  PAYNET: new PaynetProvider(),
};

const BY_METHOD: Record<string, ProviderId> = {
  click: 'CLICK',
  payme: 'PAYME',
  uzum: 'UZUM',
  paynet: 'PAYNET',
};

export function getProvider(method: string): PaymentProvider {
  const id = BY_METHOD[String(method).toLowerCase()];
  if (!id) throw new Error(`Noma'lum to'lov metodi: ${method}`);
  return instances[id];
}

export interface ProviderAvailability {
  method: ProviderId;
  label: string;
  available: boolean;
  reason?: 'not_configured' | 'not_implemented' | 'ok';
}

/**
 * UZUM va PAYNET adapterlari hali rasmiy spetsifikatsiya asosida to'ldirilmagan
 * (createPayment/webhook stub) — ularni "ulangan" deb ko'rsatish yolg'on.
 * Faqat to'liq ulangan provayderlar tanlanadigan bo'ladi, qolganlari "Tez orada".
 */
const IMPLEMENTED: Record<ProviderId, boolean> = { CLICK: true, PAYME: true, UZUM: false, PAYNET: false };

/** Provayder haqiqatan ulangan va to'lov qabul qilishga tayyormi. */
export function isProviderAvailable(id: string): boolean {
  const p = instances[id as ProviderId];
  if (!p) return false;
  return IMPLEMENTED[id as ProviderId] && p.isConfigured();
}

/** Checkout kartalari uchun provayder holati ro'yxati. */
export function getProviderAvailability(): ProviderAvailability[] {
  return (['CLICK', 'PAYME', 'UZUM', 'PAYNET'] as ProviderId[]).map((id) => {
    const p = instances[id];
    const implemented = IMPLEMENTED[id];
    const configured = p.isConfigured();
    if (!implemented) {
      return { method: id, label: p.label, available: false, reason: 'not_implemented' as const };
    }
    return {
      method: id,
      label: p.label,
      available: configured,
      reason: configured ? 'ok' as const : 'not_configured' as const,
    };
  });
}