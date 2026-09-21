'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import {
  ShoppingCart, Plus, Minus, Trash2, Loader2, Coffee, UtensilsCrossed, CakeSlice,
  CheckCircle2, AlertCircle, LogIn, Armchair,
} from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { formatPrice, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

export interface BarItem {
  id: string;
  roomId: string;
  name: string;
  description?: string | null;
  price: number | string;
  category: 'DRINK' | 'FOOD' | 'DESSERT';
  isAvailable: boolean;
}

const CATEGORIES = [
  { key: 'DRINK', label: 'Ichimliklar', icon: Coffee, chip: 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/25' },
  { key: 'FOOD', label: 'Taomlar (Sushki)', icon: UtensilsCrossed, chip: 'bg-amber-500/10 text-amber-400 border-amber-500/25' },
  { key: 'DESSERT', label: 'Desertlar', icon: CakeSlice, chip: 'bg-neon-green/10 text-neon-green border-neon-green/25' },
] as const;

interface CartLine {
  item: BarItem;
  qty: number;
}

export default function BarOrdering({ roomId }: { roomId: string }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [items, setItems] = useState<BarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string>('DRINK');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [seat, setSeat] = useState('');
  const [placing, setPlacing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [myOrders, setMyOrders] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/bar/rooms/${roomId}/items`);
      setItems(data.data || []);
    } catch { /* skip */ }
    setLoading(false);
  }, [roomId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (user) {
      api.get('/api/bar/orders/my').then(({ data }) => {
        const mine = (data.data || []).filter((o: any) => o.roomId === roomId && ['PENDING', 'PREPARING', 'READY'].includes(o.status));
        setMyOrders(mine);
      }).catch(() => { /* skip */ });
    }
  }, [user, roomId, msg]);

  const visible = items.filter((i) => i.category === cat);
  const total = cart.reduce((s, l) => s + Number(l.item.price) * l.qty, 0);

  function add(item: BarItem) {
    setCart((c) => {
      const ex = c.find((l) => l.item.id === item.id);
      if (ex) return c.map((l) => l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l);
      return [...c, { item, qty: 1 }];
    });
  }

  function change(itemId: string, delta: number) {
    setCart((c) => c.map((l) => l.item.id === itemId ? { ...l, qty: Math.max(0, l.qty + delta) } : l).filter((l) => l.qty > 0));
  }

  async function placeOrder() {
    if (!user) {
      router.push(`/login?redirect=/rooms/${roomId}`);
      return;
    }
    setPlacing(true);
    setMsg(null);
    try {
      await api.post('/api/bar/orders', {
        roomId,
        seatNumber: seat || undefined,
        items: cart.map((l) => ({ itemId: l.item.id, qty: l.qty })),
      });
      setCart([]);
      setCartOpen(false);
      setMsg({ type: 'ok', text: `Buyurtma qabul qilindi! Jami: ${formatPrice(total)} so'm. Ofitsiant sizga yetkazadi.` });
    } catch (err) {
      setMsg({ type: 'err', text: getApiErrorMessage(err) });
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="neo-card rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neon-cyan/15 bg-gradient-to-r from-amber-500/10 via-transparent to-neon-cyan/10 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Coffee size={18} className="text-amber-400" /> Gaming Bar
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Sushki · Pizza · Ichimliklar — to'g'ridan-to'g'ri saytingizga</p>
        </div>
        {cart.length > 0 && (
          <button
            onClick={() => setCartOpen((o) => !o)}
            className={cn(
              'relative px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors',
              cartOpen ? 'bg-amber-500/20 text-amber-300' : 'btn-ghost text-amber-300')
            }
          >
            <ShoppingCart size={15} />
            {formatPrice(total)}
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-400 text-black text-[10px] font-extrabold flex items-center justify-center">
              {cart.reduce((s, l) => s + l.qty, 0)}
            </span>
          </button>
        )}
      </div>

      <div className="p-5">
        {msg && (
          <div className={cn('mb-4 flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm',
            msg.type === 'ok' ? 'bg-neon-green/10 border border-neon-green/30 text-neon-green' : 'bg-red-500/10 border border-red-500/30 text-red-300')}>
            {msg.type === 'ok' ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
            {msg.text}
          </div>
        )}

        {/* Kategoriyalar */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-thin pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition-colors',
                cat === c.key ? c.chip : 'border-white/10 bg-cyber-900 text-gray-400 hover:border-white/20'
              )}
            >
              <c.icon size={13} /> {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-24 rounded-xl bg-cyber-800 animate-pulse" />)}</div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">Bu bo'limda hozircha mahsulot yo'q</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {visible.map((item) => {
              const inCart = cart.find((l) => l.item.id === item.id)?.qty || 0;
              return (
                <div key={item.id} className="rounded-xl border border-white/10 bg-cyber-900 p-3 flex flex-col justify-between card-hover">
                  <div>
                    <span className="flex items-start gap-1.5 text-xs text-gray-400">
                      <span className={`w-7 h-7 rounded-lg border grid place-items-center shrink-0 ${
                        item.category === 'DRINK' ? 'border-neon-cyan/25 bg-neon-cyan/10 text-neon-cyan' :
                        item.category === 'FOOD' ? 'border-amber-500/25 bg-amber-500/10 text-amber-400' :
                        'border-neon-green/25 bg-neon-green/10 text-neon-green'
                      }`}>
                        {item.category === 'DRINK' ? <Coffee size={13} /> : item.category === 'FOOD' ? <UtensilsCrossed size={13} /> : <CakeSlice size={13} />}
                      </span>
                      {item.name}
                    </span>
                    {item.description && <p className="text-[11px] text-gray-600 mt-0.5 line-clamp-2">{item.description}</p>}
                  </div>
                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-sm font-bold text-amber-400">{formatPrice(item.price)}</span>
                    {inCart > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => change(item.id, -1)} className="w-7 h-7 rounded-lg border border-white/10 grid place-items-center text-gray-400 hover:text-white"><Minus size={12} /></button>
                        <span className="text-sm font-bold w-4 text-center">{inCart}</span>
                        <button onClick={() => change(item.id, +1)} className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 grid place-items-center hover:bg-amber-500/30"><Plus size={12} /></button>
                      </div>
                    ) : (
                      <button onClick={() => add(item)} className="w-7 h-7 rounded-lg bg-neon-cyan/15 text-neon-cyan grid place-items-center hover:bg-neon-cyan/25"><Plus size={12} /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Savat */}
        {cartOpen && cart.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 animate-fade-in">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
              <ShoppingCart size={14} className="text-amber-400" /> Buyurtma ({cart.reduce((s, l) => s + l.qty, 0)})
            </h3>
            <div className="space-y-2">
              {cart.map((l) => (
                <div key={l.item.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">{l.item.name} × {l.qty}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-medium">{formatPrice(Number(l.item.price) * l.qty)}</span>
                    <button onClick={() => change(l.item.id, -1)} className="p-1 rounded text-gray-500 hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>

            <div className="h-px bg-white/10 my-3" />

            <div className="flex items-center gap-2">
              <Armchair size={14} className="text-amber-400 shrink-0" />
              <input
                value={seat}
                onChange={(e) => setSeat(e.target.value)}
                placeholder="Kompyuter / stol raqami (masalan: PC-12)"
                className="glass-input flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-gray-400">Jami:</span>
              <span className="font-bold text-lg neon-text">{formatPrice(total)} so'm</span>
            </div>

            <button
              onClick={placeOrder}
              disabled={placing}
              className="mt-3 w-full py-2.5 rounded-xl btn-amber flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50"
            >
              {placing ? <Loader2 size={15} className="animate-spin" /> : <ShoppingCart size={15} />}
              {user ? 'Buyurtma berish' : 'Kirish va buyurtma'}
            </button>
          </div>
        )}

        {/* Mening faol buyurtmalarim */}
        {myOrders.length > 0 && (
          <div className="mt-5">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Mening buyurtmalarim</h3>
            <div className="space-y-2">
              {myOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-cyber-900 px-3 py-2.5 text-sm">
                  <div>
                    <span className="font-medium">{formatPrice(o.totalPrice)} so'm</span>
                    {o.seatNumber && <span className="text-xs text-gray-500 ml-2">→ {o.seatNumber}</span>}
                  </div>
                  <span className={cn('px-2 py-0.5 rounded text-xs font-bold',
                    o.status === 'PENDING' ? 'bg-yellow-500/15 text-yellow-400'
                      : o.status === 'PREPARING' ? 'bg-neon-cyan/15 text-neon-cyan'
                      : 'bg-neon-green/15 text-neon-green')}>
                    {o.status === 'PENDING' ? 'Kutilmoqda' : o.status === 'PREPARING' ? 'Tayyorlanmoqda' : 'Tayyor'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}