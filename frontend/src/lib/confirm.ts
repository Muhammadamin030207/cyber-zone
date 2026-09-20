'use client';

import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  id: string;
}

interface ConfirmState {
  request: ConfirmRequest | null;
  resolver: ((ok: boolean) => void) | null;
  open: (opts: ConfirmOptions) => Promise<boolean>;
  close: (ok: boolean) => void;
}

let counter = 0;

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  request: null,
  resolver: null,
  open: (opts) =>
    new Promise<boolean>((resolve) => {
      set({
        request: { ...opts, id: `confirm-${++counter}-${Date.now()}` },
        resolver: resolve,
      });
    }),
  close: (ok) => {
    const { resolver } = get();
    set({ request: null, resolver: null });
    resolver?.(ok);
  },
}));

export async function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().open(opts);
}