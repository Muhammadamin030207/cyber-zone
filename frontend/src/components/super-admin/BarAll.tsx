'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Coffee, Plus, Trash2, Loader2, Save, Check, Pencil, X, Timer, ChefHat, PackageCheck, Truck, Monitor, ShoppingCart,
} from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { formatPrice, formatDateTime, cn } from '@/lib/utils';

interface BarItem {
  id: string;
  roomId: string;
  name: string;
  description?: string | null;
  price: number | string;
  category: string;
  isAvailable: boolean;
}

interface Order {
  id: string;
  roomId: string;
  room: { name: string };
  seatNumber?: string | null;
  items: Array<{ itemId: string; name: string; price: number; qty: number }>;
  totalPrice: number | string;
  status: string;
  createdAt: string;
  user?: { fullName: string; phone?: string | null };
}

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: 'Kutilmoqda', color: 'bg-yellow-500/15 text-yellow-400', icon: Timer },
  PREPARING: { label: 'Tayyorlanmoqda', color: 'bg-neon-cyan/15 text-neon-cyan', icon: ChefHat },
  READY: { label: 'Tayyor', color: 'bg-neon-green/15 text-neon-green', icon: PackageCheck },
  DELIVERED: { label: 'Yetkazildi', color: 'bg-gray-500/15 text-gray-400', icon: Truck },
  CANCELLED: { label: 'Bekor qilindi', color: 'bg-red-500/15 text-red-400', icon: X },
};

export default function BarAll() {
  const [tab, setTab] = useState<'orders' | 'menu'>('orders');
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [roomSel, setRoomSel] = useState<string>('');
  const [items, setItems] = useState<BarItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', category: 'DRINK' });
  const [editId, setEditId] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/rooms');
      const list = (data.data || []);
      setRooms(list);
      setRoomSel((s) => s || (list[0]?.id || ''));
      return list[0]?.id || '';
    } catch { return ''; }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/bar/admin/orders?all=true');
      setOrders(data.data || []);
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  const loadItems = useCallback(async (roomId: string) => {
    if (!roomId) return;
    try {
      const { data } = await api.get(`/api/bar/items/all?roomId=${roomId}`);
      setItems(data.data || []);
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    loadAll();
    loadRooms().then((first) => first && loadItems(first));
  }, [loadAll, loadRooms, loadItems]);

  function pickRoom(id: string) {
    setRoomSel(id);
    loadItems(id);
  }

  async function saveItem() {
    if (!roomSel) return;
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        price: Number(form.price),
        category: form.category,
        roomId: roomSel,
      };
      if (editId) await api.patch(`/api/bar/items/${editId}`, payload);
      else await api.post('/api/bar/items', payload);
      setMsg('Menyu saqlandi!');
      setForm({ name: '', description: '', price: '', category: 'DRINK' });
      setEditId(null);
      loadItems(roomSel);
    } catch (err) { setMsg(getApiErrorMessage(err)); }
  }

  async function removeItem(id: string) {
    if (!confirm('Menyuni o\'chirish?')) return;
    try { await api.delete(`/api/bar/items/${id}`); loadItems(roomSel); } catch { /* skip */ }
  }

  async function toggle(item: BarItem) {
    try { await api.patch(`/api/bar/items/${item.id}`, { isAvailable: !item.isAvailable }); loadItems(roomSel); } catch { /* skip */ }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className="px-3 py-2 rounded-lg text-sm bg-neon-green/10 border border-neon-green/30 text-neon-green">
          <Check size={14} className="inline mr-1" />{msg}
        </div>
      )}

      <div className="flex items-center gap-1">
        {([['orders', 'Buyurtmalar', ShoppingCart], ['menu', 'Menyu', Coffee]] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors',
              tab === k ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : 'border-neon-cyan/10 text-gray-400 hover:text-neon-cyan'
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="neo-card rounded-2xl h-64 animate-pulse" />
      ) : tab === 'orders' ? (
        <div className="neo-card rounded-2xl p-5">
          {orders.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-12">Barcha xonalarda hali buyurtma yo'q</p>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {orders.map((o) => {
                const meta = STATUS_META[o.status] || STATUS_META.PENDING;
                const Icon = meta.icon;
                return (
                  <div key={o.id} className="rounded-xl border border-white/10 bg-cyber-900 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0">
                        <span className="font-bold flex items-center gap-1.5"><Monitor size={12} className="text-neon-cyan shrink-0" /> {o.room?.name}</span>
                        <span className="text-xs text-gray-500 block mt-0.5 truncate">{o.user?.fullName}</span>
                        {o.seatNumber && <span className="text-xs text-amber-400">→ {o.seatNumber}</span>}
                      </div>
                      <span className={cn('px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap', meta.color)}>
                        <Icon size={10} className="inline mr-1" />{meta.label}
                      </span>
                    </div>
                    <div className="space-y-0.5 text-sm text-gray-300">
                      {(o.items as any[]).map((l, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="truncate">{l.name} × {l.qty}</span>
                          <span className="text-gray-400 shrink-0">{formatPrice(l.price * l.qty)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="h-px bg-white/10 my-2" />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">{formatDateTime(o.createdAt)}</span>
                      <span className="font-bold text-amber-400">{formatPrice(o.totalPrice)} so'm</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="neo-card rounded-2xl p-5">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <Coffee size={16} className="text-amber-400" /> {editId ? 'Menyuni tahrirlash' : 'Yangi mahsulot'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Xona</label>
                <select value={roomSel} onChange={(e) => pickRoom(e.target.value)} className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none">
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Nomi</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Sushi Filadelfiya 8 dona" className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Tavsif</label>
                <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Qisqacha izoh" className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Narx (so'm)</label>
                  <input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} type="number" placeholder="45000" className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Kategoriya</label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none">
                    <option value="DRINK">Ichimliklar</option>
                    <option value="FOOD">Taomlar</option>
                    <option value="DESSERT">Desertlar</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveItem} className="px-5 py-2.5 rounded-xl neon-btn text-sm font-bold flex items-center gap-2">
                  <Save size={15} /> {editId ? 'Yangilash' : 'Qo\'shish'}
                </button>
                {editId && (
                  <button onClick={() => { setEditId(null); setForm({ name: '', description: '', price: '', category: 'DRINK' }); }} className="px-4 py-2.5 rounded-xl border border-gray-500/30 text-gray-400 text-sm"><X size={15} /></button>
                )}
              </div>
            </div>
          </div>

          <div className="neo-card rounded-2xl p-5">
            <h3 className="font-bold mb-4">Menyu — {rooms.find((r) => r.id === roomSel)?.name || ''} ({items.length})</h3>
            <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
              {items.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-10">Bu xonada hali mahsulot yo'q</p>
              ) : items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-neon-cyan/15 bg-cyber-800/50">
                  <div>
                    <span className={cn('font-medium', !item.isAvailable && 'opacity-40')}>
                      {item.name}
                    </span>
                    <span className="text-xs text-amber-400 ml-2 font-bold">{formatPrice(item.price)}</span>
                  </div>
                  <div className="flex gap-1.5 items-center">
                    <button onClick={() => toggle(item)} className={cn('w-7 h-7 rounded-lg text-xs font-bold', item.isAvailable ? 'bg-neon-green/15 text-neon-green' : 'bg-gray-500/15 text-gray-400')}>
                      {item.isAvailable ? <Check size={13} className="m-auto" /> : <X size={13} className="m-auto" />}
                    </button>
                    <button onClick={() => { setEditId(item.id); setForm({ name: item.name, description: item.description || '', price: String(item.price), category: item.category }); }} className="p-1.5 rounded-lg text-neon-cyan hover:bg-neon-cyan/10"><Pencil size={13} /></button>
                    <button onClick={() => removeItem(item.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}