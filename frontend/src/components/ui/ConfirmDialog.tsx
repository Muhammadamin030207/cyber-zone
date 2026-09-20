'use client';

import { useCallback, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useConfirmStore } from '@/lib/confirm';

export default function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request);
  const close = useConfirmStore((s) => s.close);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const onConfirm = useCallback(() => close(true), [close]);
  const onCancel = useCallback(() => close(false), [close]);

  useEffect(() => {
    if (!request) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, close]);

  useEffect(() => {
    if (!request) return;
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus?.();
  }, [request]);

  if (!request) return null;

  const { title, message, confirmLabel, cancelLabel, danger } = request;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="relative w-full max-w-sm neo-card rounded-2xl p-6 animate-pop"
      >
        <div className="flex items-start gap-4">
          <span
            className={`w-11 h-11 rounded-xl border grid place-items-center shrink-0 ${
              danger ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-yellow-400/10 border-yellow-400/30 text-yellow-300'
            }`}
          >
            <AlertTriangle size={22} />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="font-bold text-lg leading-snug break-words">
              {title}
            </h2>
            {message && (
              <p id="confirm-dialog-desc" className="text-sm text-gray-400 mt-1 leading-relaxed break-words">
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl btn-ghost text-sm font-medium"
          >
            {cancelLabel || 'Bekor qilish'}
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
              danger
                ? 'bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25'
                : 'neon-btn'
            }`}
          >
            {confirmLabel || 'Tasdiqlash'}
          </button>
        </div>
      </div>
    </div>
  );
}