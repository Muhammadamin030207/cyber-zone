'use client';

import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { useToastStore } from '@/lib/toast';
import { cn } from '@/lib/utils';

const STYLES = {
  success: 'border-neon-green/40 bg-cyber-800/95 text-neon-green',
  error: 'border-red-500/40 bg-cyber-800/95 text-red-400',
  info: 'border-neon-cyan/40 bg-cyber-800/95 text-neon-cyan',
};

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-2.5 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-lg shadow-black/40 animate-fade-up',
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