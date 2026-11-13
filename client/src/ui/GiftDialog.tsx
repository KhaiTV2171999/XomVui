import { useState } from 'react';
import { ITEMS } from '../../../shared/catalog';
import { call } from '../net';
import { set, toast, useStore } from '../store';
import { Modal } from './common';

const GROUPS: [string, string][] = [['produce', '🧺 Nông sản'], ['seed', '🌱 Hạt giống'], ['feed', '🌾 Thức ăn']];

/** Mở bảng tặng quà cho một người bạn. */
export function openGift(id: number, name: string) {
  set({ gift: { id, name } });
}

/** Bảng tặng quà: chọn món trong kho + số lượng rồi gửi cho bạn bè. */
export function GiftDialog() {
  const to = useStore((s) => s.gift)!;
  const inv = useStore((s) => s.me?.inventory ?? {});
  const [pick, setPick] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const close = () => set({ gift: null });

  const owned = Object.entries(inv).filter(([id, q]) => q > 0 && ITEMS[id] && ITEMS[id].kind !== 'clothing');
  const max = pick ? inv[pick] ?? 0 : 0;
  const n = Math.max(1, Math.min(qty, max || 1));

  async function send() {
    if (!pick || busy) return;
    setBusy(true);
    const r = await call('gift:send', { to: to.id, itemId: pick, qty: n });
    setBusy(false);
    if (r.ok) {
      toast(`🎁 Đã tặng ${to.name} ${n} ${ITEMS[pick].icon} ${ITEMS[pick].name}`, 'success');
      close();
    }
  }

  return (
    <Modal title={`🎁 Tặng quà cho ${to.name}`} onClose={close} className="gift-modal">
      {owned.length === 0 ? (
        <div className="inv-empty"><span>🧺</span><p>Kho của bạn đang trống.<br />Thu hoạch nông sản rồi quay lại tặng bạn bè nhé!</p></div>
      ) : (
        <>
          {GROUPS.map(([kind, label]) => {
            const list = owned.filter(([id]) => ITEMS[id].kind === kind);
            if (!list.length) return null;
            return (
              <section key={kind} className="gift-sec">
                <h4>{label}</h4>
                <div className="gift-grid">
                  {list.map(([id, q]) => (
                    <button key={id} className={`gift-item ${pick === id ? 'on' : ''}`} onClick={() => { setPick(id); setQty(1); }}>
                      <span className="gift-icon">{ITEMS[id].icon}</span>
                      <span className="gift-name">{ITEMS[id].name}</span>
                      <small>có {q}</small>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          <div className="gift-bar">
            {pick ? (
              <>
                <span className="gift-pick">{ITEMS[pick].icon} {ITEMS[pick].name}</span>
                <div className="qty-step">
                  <button className="btn small" disabled={n <= 1} onClick={() => setQty(n - 1)}>−</button>
                  <input type="number" min={1} max={max} value={n} onChange={(e) => setQty(Math.floor(Number(e.target.value) || 1))} />
                  <button className="btn small" disabled={n >= max} onClick={() => setQty(n + 1)}>+</button>
                  <button className="btn small" disabled={n >= max} onClick={() => setQty(max)}>Tất cả</button>
                </div>
                <button className="btn primary" disabled={busy} onClick={send}>🎁 Tặng</button>
              </>
            ) : <span className="gift-hint">Chọn một món để tặng</span>}
          </div>
        </>
      )}
    </Modal>
  );
}
