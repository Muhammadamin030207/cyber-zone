'use client';

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, type?: ToastType) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

function makeToast(message: string, type: ToastType): Toast {
  return { id: `toast-${++counter}-${Date.now()}`, message, type };
}

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (message, type = 'success') => {
    const toast = makeToast(message, type);
    set((s) => ({ toasts: [...s.toasts, toast] }));
    setTimeout(() => get().dismiss(toast.id), 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toastSuccess(message: string) {
  useToastStore.getState().show(message, 'success');
}
export function toastError(message: string) {
  useToastStore.getState().show(message, 'error');
}
export function toastWarning(message: string) {
  useToastStore.getState().show(message, 'warning');
}
export function toastInfo(message: string) {
  useToastStore.getState().show(message, 'info');
}