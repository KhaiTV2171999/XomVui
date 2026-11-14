import { useEffect, useState } from 'react';
import { ITEMS } from '../../../shared/catalog';
import { NPCS, Order, OrderSlot } from '../../../shared/orders';
import { call } from '../net';
import { fmt, get, set, toast, useStore } from '../store';
import { sfx } from '../sound';
import { Modal } from './common';
import { MyOrdersTab, PlayerOrdersTab } from './PlayerOrders';

export interface OrdersState { slots: OrderSlot[]; offset: number }

/** Tải bảng đơn hàng (server tự lấp đơn mới khi hết giờ chờ). */
export async function loadOrders() {
  const r = await call('orders:list', {}, { silent: true });
  if (r.ok) set({ orders: { slots: r.slots as OrderSlot[], offset: (r.now as number) - Date.now() } });
}

/** Số đơn đang đủ hàng để giao. */
export function deliverableCount(orders: OrdersState | null, inv: Record<string, number> | undefined) {
  if (!orders || !inv) return 0;
  return orders.slots.filter((s) => 'order' in s && canDeliver(s.order, inv)).length;
}
function canDeliver(o: Order, inv: Record<string, number>) {
  return Object.entries(o.items).every(([it, n]) => (inv[it] ?? 0) >= n);
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Bảng đơn hàng: dân làng đặt mua, giao đủ hàng nhận xu + XP (cao hơn bán thẳng). */
export function OrdersPanel() {
  useStore((s) => s.catalogVer);
  const orders = useStore((s) => s.orders);
  const inv = useStore((s) => s.me?.inventory ?? {});
  const [busy, setBusy] = useState<number | null>(null);
  const [tab, setTab] = useState<'npc' | 'players' | 'mine'>('npc');
  const now = useNow();
  useEffect(() => { loadOrders(); }, []);
  // Có ô hết giờ chờ → tải lại để nhận đơn mới
  const serverNow = now + (orders?.offset ?? 0);
  const due = orders?.slots.some((s) => 'waitUntil' in s && s.waitUntil <= serverNow);
  useEffect(() => { if (due) loadOrders(); }, [due]);

  async function deliver(i: number) {
    setBusy(i);
    const r = await call('orders:deliver', { slot: i });
    setBusy(null);
    if (r.ok) {
      sfx('coin');
      set({ orders: { slots: r.slots as OrderSlot[], offset: (r.now as number) - Date.now() } });
      toast(`🚚 Giao hàng xong! +${fmt(r.coins as number)} xu · +${r.xp} XP${r.vip ? ' ⭐ VIP' : ''}`, 'success');
    }
  }
  async function skip(i: number) {
    setBusy(i);
    const r = await call('orders:skip', { slot: i });
    setBusy(null);
    if (r.ok) set({ orders: { slots: r.slots as OrderSlot[], offset: (r.now as number) - Date.now() } });
  }

  return (
    <Modal title="🚚 Bảng đơn hàng" onClose={() => set({ panel: null })} wide className="orders-modal">
      <div className="res-tabs">
        <button className={tab === 'npc' ? 'on' : ''} onClick={() => setTab('npc')}>🏘️ Dân làng</button>
        <button className={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>🤝 Đơn cư dân</button>
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>📝 Đơn của tôi</button>
      </div>
      {tab === 'players' ? <PlayerOrdersTab /> : tab === 'mine' ? <MyOrdersTab /> : <>
      <p className="od-intro">Dân làng đặt mua nông sản — giao đủ hàng để nhận <b>nhiều xu hơn bán thẳng</b> và XP. Đơn ⭐ VIP thưởng gấp đôi!</p>
      {!orders ? <p className="empty">Đang tải…</p> : (
        <div className="od-grid">
          {orders.slots.map((s, i) => {
            if ('waitUntil' in s) {
              const left = Math.max(0, Math.ceil((s.waitUntil - serverNow) / 1000));
              return (
                <div key={i} className="od-card waiting">
                  <span className="od-truck">🚚</span>
                  <b>Xe tải đang chở đơn mới…</b>
                  <small>{left > 0 ? `còn ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'sắp tới'}</small>
                </div>
              );
            }
            const o = s.order;
            const npc = NPCS[o.npc] ?? NPCS[0];
            const ok = canDeliver(o, inv);
            return (
              <div key={o.id} className={`od-card ${o.vip ? 'vip' : ''} ${ok ? 'ready' : ''}`}>
                {o.vip && <span className="od-vip">⭐ VIP</span>}
                <div className="od-npc"><span>{npc.icon}</span><b>{npc.name}</b></div>
                <div className="od-items">
                  {Object.entries(o.items).map(([it, n]) => {
                    const have = inv[it] ?? 0;
                    return (
                      <span key={it} className={`od-item ${have >= n ? 'ok' : 'no'}`} title={ITEMS[it]?.name}>
                        <i>{ITEMS[it]?.icon}</i>{Math.min(have, n)}/{n}
                      </span>
                    );
                  })}
                </div>
                <div className="od-reward"><span>💰 {fmt(o.coins)}</span><span>⭐ {o.xp} XP</span></div>
                <div className="od-btns">
                  <button className="btn small od-skip" disabled={busy === i} onClick={() => skip(i)} title="Bỏ đơn này (đơn mới tới chậm hơn)">✕</button>
                  <button className="btn small od-go" disabled={!ok || busy === i} onClick={() => deliver(i)}>{ok ? '🚚 Giao hàng' : 'Chưa đủ hàng'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>}
    </Modal>
  );
}

/** Mở bảng đơn hàng (chỉ trên nông trại của mình). */
export function openOrders() {
  const z = get().zone;
  if (z?.kind === 'farm' && z.ownerId === get().me?.id) set({ panel: 'orders' });
  else toast('Bảng đơn hàng ở nông trại của bạn 🚚');
}
