'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[cyber-zone] page error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] grid place-items-center px-4">
      <div className="neo-card rounded-2xl p-8 text-center max-w-md w-full">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/25 grid place-items-center mb-4">
          <AlertTriangle size={28} className="text-red-400" />
        </div>
        <h1 className="text-xl font-bold mb-2">Xatolik yuz berdi</h1>
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
          Sahifa yuklashda kutilmagan muammo bo&apos;ldi. Sahifani qayta yuklab ko&apos;ring yoki keyinroq urinib
          ko&apos;ring.
        </p>
        <button onClick={reset} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl neon-btn font-bold text-sm">
          <RotateCcw size={16} /> Qayta urinish
        </button>
      </div>
    </div>
  );
}