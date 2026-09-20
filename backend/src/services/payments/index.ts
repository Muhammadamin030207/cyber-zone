import type { PaymentProvider, ProviderId } from './types';
import { ClickProvider } from './providers/click';
import { PaymeProvider } from './providers/payme';
import { UzumProvider } from './providers/uzum';
import { PaynetProvider } from './providers/paynet';
import { TestProvider } from './providers/test';
import { config } from '../../config';

export type * from './types';
export { ProviderNotConfiguredError, type ProviderId, type PaymentProvider } from './types';
export { ProviderUnavailableError } from './providers/payme';

const instances: Record<ProviderId, PaymentProvider> = {
  CLICK: new ClickProvider(),
  PAYME: new PaymeProvider(),
  UZUM: new UzumProvider(),
  PAYNET: new PaynetProvider(),
  TEST: new TestProvider(),
};

const BY_METHOD: Record<string, ProviderId> = {
  click: 'CLICK',
  payme: 'PAYME',
  uzum: 'UZUM',
  paynet: 'PAYNET',
  test: 'TEST',
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
  reason?: 'not_configured' | 'test_only' | 'ok';
}

/** Checkout kartalari uchun provayder holati ro'yxati. */
export function getProviderAvailability(): ProviderAvailability[] {
  const list: ProviderAvailability[] = (['CLICK', 'PAYME', 'UZUM', 'PAYNET'] as ProviderId[]).map((id) => {
    const p = instances[id];
    return {
      method: id,
      label: p.label,
      available: p.isConfigured(),
      reason: p.isConfigured() ? 'ok' as const : 'not_configured' as const,
    };
  });
  list.push({
    method: 'TEST',
    label: instances['TEST'].label,
    available: config.payments.mode === 'test',
    reason: config.payments.mode === 'test' ? 'ok' as const : 'test_only' as const,
  });
  return list;
}