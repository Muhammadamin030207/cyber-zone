'use client';

import { CheckCircle2, XCircle, TriangleAlert, Info, X } from 'lucide-react';
import { useToastStore } from '@/lib/toast';
import { cn } from '@/lib/utils';

const STYLES = {
  success: 'border-neon-green/40 bg-cyber-800/95 text-neon-green',
  error: 'border-red-500/40 bg-cyber-800/95 text-red-400',
  warning: 'border-yellow-400/40 bg-cyber-800/95 text-yellow-300',
  info: 'border-neon-cyan/40 bg-cyber-800/95 text-neon-cyan',
};

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: TriangleAlert,
  info: Info,
};

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed right-3 bottom-[calc(calc(4.5rem+env(safe-area-inset-bottom)) + 0.25rem)] md:right-5 md:bottom-5 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100vw-1.5rem)] md:w-auto"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-2.5 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-lg shadow-black/40 toast-in',
              STYLES[t.type]
            )}
          >
            <Icon size={18} className="shrink-0 mt-0.5" />
            <p className="text-sm font-medium flex-1">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-gray-500 hover:text-white transition-colors">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}