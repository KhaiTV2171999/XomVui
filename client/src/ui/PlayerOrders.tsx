import { useEffect, useMemo, useState } from 'react';
import { ECON, ITEMS } from '../../../shared/catalog';
import { PlayerOrder, playerOrderPrice } from '../../../shared/orders';
import { call } from '../net';
import { confirmBox, fmt, toast, useStore } from '../store';
import { sfx } from '../sound';

interface Data { open: PlayerOrder[]; mine: PlayerOrder[]; done: number; unlock: number }

function useOrdersData() {
  const [data, setData] = useState<Data | null>(null);
  const load = () => call('porders:list', {}, { silent: true }).then((r) => r.ok && setData(r as unknown as Data));
  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, []);
  return { data, load };
}

function Items({ items, inv }: { items: Record<string, number>; inv?: Record<string, number> }) {
  return (
    <div className="od-items">
      {Object.entries(items).map(([it, n]) => {
        const have = inv?.[it] ?? 0;
        return (
          <span key={it} className={`od-item ${!inv ? 'plain' : have >= n ? 'ok' : 'no'}`} title={ITEMS[it]?.name}>
            <i>{ITEMS[it]?.icon}</i>{inv ? `${Math.min(have, n)}/${n}` : `×${n}`}
          </span>
        );
      })}
    </div>
  );
}

/** Đơn của cư dân khác: giao đủ hàng nhận nguyên giá trị đơn (hệ thống bù phần giảm giá cho người đặt). */
export function PlayerOrdersTab() {
  const { data, load } = useOrdersData();
  const inv = useStore((s) => s.me?.inventory ?? {});
  const [busy, setBusy] = useState<number | null>(null);
  if (!data) return <p className="empty">Đang tải…</p>;
  if (!data.open.length) return <p className="empty">Chưa có cư dân nào đặt hàng. Quay lại sau nhé! 📭</p>;
  return (
    <div className="od-grid">
      {data.open.map((o) => {
        const ok = Object.entries(o.items).every(([it, n]) => (inv[it] ?? 0) >= n);
        return (
          <div key={o.id} className={`od-card ${ok ? 'ready' : ''}`}>
            <div className="od-npc"><span>🧑‍🌾</span><b>{o.buyerName}</b></div>
            <Items items={o.items} inv={inv} />
            <div className="od-reward"><span>💰 {fmt(o.full)}</span></div>
            <div className="od-btns">
              <button className="btn small od-go" disabled={!ok || busy === o.id} onClick={async () => {
                setBusy(o.id);
                const r = await call('porders:fill', { id: o.id });
                setBusy(null);
                if (r.ok) { sfx('coin'); toast(`📦 Đã giao cho ${o.buyerName} · +${fmt(r.coins as number)} xu`, 'success'); }
                load();
              }}>{ok ? '📦 Giao hàng' : 'Chưa đủ hàng'}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const ST: Record<string, string> = { open: '⏳ Đang chờ', done: '✅ Đã nhận hàng', cancelled: '✕ Đã huỷ', expired: '⌛ Hết hạn' };

/** Đơn của tôi: đăng đơn mua (trả trước, đã giảm giá) — mở khoá sau khi giao đủ đơn dân làng. */
export function MyOrdersTab() {
  useStore((s) => s.catalogVer);
  const { data, load } = useOrdersData();
  const coins = useStore((s) => s.me?.coins ?? 0);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const goods = useMemo(() => Object.values(ITEMS).filter((i) => (i.id.startsWith('crop:') || i.id.startsWith('prod:') || i.id.startsWith('good:')) && i.sell), []);
  if (!data) return <p className="empty">Đang tải…</p>;
  const locked = data.done < data.unlock;
  const kinds = Object.keys(cart).length;
  const price = kinds ? playerOrderPrice(cart) : { full: 0, pay: 0 };
  const openCount = data.mine.filter((o) => o.status === 'open').length;
  const setQty = (id: string, q: number) => setCart((c) => {
    const n = { ...c };
    if (q <= 0) delete n[id]; else if (n[id] != null || Object.keys(n).length < 3) n[id] = Math.min(99, q);
    return n;
  });

  return (
    <div className="po-wrap">
      {locked ? (
        <div className="po-lock">
          <span>🔒</span>
          <div>
            <b>Giao {data.unlock} đơn dân làng để mở khoá tự đăng đơn</b>
            <div className="qs-bar"><i style={{ width: `${(data.done / data.unlock) * 100}%` }} /></div>
            <small>Đã giao {data.done}/{data.unlock} đơn</small>
          </div>
        </div>
      ) : (
        <section className="po-create">
          <p className="po-note">Chọn tối đa 3 loại hàng. Bạn chỉ trả <b>{Math.round(ECON.playerOrderPay * 100)}%</b> — hệ thống bù phần còn lại, người giao vẫn nhận đủ giá. Đơn tự huỷ & hoàn tiền sau {ECON.playerOrderHours} giờ.</p>
          <div className="po-goods">
            {goods.map((g) => {
              const q = cart[g.id] ?? 0;
              return (
                <div key={g.id} className={`po-good ${q ? 'on' : ''}`}>
                  <span className="po-ic">{g.icon}</span>
                  <small>{g.name}</small>
                  <div className="po-step">
                    <button type="button" onClick={() => setQty(g.id, q - 1)} disabled={!q}>−</button>
                    <b>{q}</b>
                    <button type="button" onClick={() => setQty(g.id, q + (q ? 1 : 5))} disabled={!q && kinds >= 3}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="po-bar">
            <span>Giá trị <s>{fmt(price.full)}</s> · bạn trả <b>💰 {fmt(price.pay)}</b></span>
            <button className="btn primary" disabled={!kinds || busy || coins < price.pay || openCount >= ECON.playerOrderMax} onClick={() =>
              confirmBox(`Đăng đơn mua và trả trước ${fmt(price.pay)} xu?`, async () => {
                setBusy(true);
                const r = await call('porders:create', { items: cart });
                setBusy(false);
                if (r.ok) { toast('📝 Đã đăng đơn — chờ cư dân giao hàng nhé!', 'success'); setCart({}); load(); }
              })}>{openCount >= ECON.playerOrderMax ? `Tối đa ${ECON.playerOrderMax} đơn` : '📝 Đăng đơn'}</button>
          </div>
        </section>
      )}
      {data.mine.length > 0 && (
        <section className="po-mine">
          <h4>Đơn đã đăng</h4>
          {data.mine.map((o) => (
            <div key={o.id} className={`po-row ${o.status}`}>
              <Items items={o.items} />
              <span className="po-st">{ST[o.status]}{o.status === 'done' && o.filledBy ? ` · ${o.filledBy}` : ''}</span>
              <span className="po-paid">💰 {fmt(o.pay)}</span>
              {o.status === 'open' && <button className="btn tiny" onClick={() => confirmBox(`Huỷ đơn và nhận lại ${fmt(o.pay)} xu?`, async () => {
                const r = await call('porders:cancel', { id: o.id });
                if (r.ok) toast(`Đã huỷ đơn · hoàn ${fmt(r.refund as number)} xu`, 'success');
                load();
              })}>Huỷ</button>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
