'use client';

import { cn } from '@/lib/utils';
import { Monitor, Armchair } from 'lucide-react';

export interface SeatInfo {
  id: string;
  name: string;
  specs: Record<string, any>;
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'BROKEN';
  canBook: boolean;
}

interface Props {
  computers: SeatInfo[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

export default function SeatMap({ computers, selectedId, onSelect }: Props) {
  return (
    <div>
      <div className="rounded-xl border border-white/10 bg-cyber-950/60 p-4 relative overflow-hidden">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] text-gray-500 tracking-widest">
          EKRAN TOMONI
        </div>

        <div className="mt-8 grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-10 gap-2">
          {computers.map((pc, i) => {
            const busy = !pc.canBook;
            const selected = selectedId === pc.id;
            return (
              <button
                key={pc.id}
                disabled={busy}
                onClick={() => onSelect(pc.id)}
                title={`${pc.name}${busy ? ' — band' : ''}`}
                className={cn(
                  'relative flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-all',
                  selected
                    ? 'border-amber-400 bg-amber-500/15 shadow-glow scale-105'
                    : busy
                      ? 'border-white/5 bg-white/5 opacity-40 cursor-not-allowed'
                      : 'border-neon-green/30 bg-neon-green/5 hover:bg-neon-green/15 hover:border-neon-green/60'
                )}
              >
                <Monitor size={16} className={busy ? 'text-gray-600' : 'text-neon-green'} />
                <span className={cn(
                  'text-[10px] font-bold leading-none',
                  busy ? 'text-gray-600' : 'text-white'
                )}>
                  {i + 1}
                </span>
                {selected && <Armchair size={10} className="absolute -top-1.5 -right-1.5 text-amber-400" />}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-neon-green/60" /> Bo'sh
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-white/15" /> Band
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Tanlangan
          </span>
        </div>
      </div>
    </div>
  );
}