import { useEffect, useState } from 'react';
import type { Appearance } from '../../../shared/catalog';
import { ITEMS } from '../../../shared/catalog';
import { call, travel } from '../net';
import { confirmBox, openChat, set, toast, useStore } from '../store';
import { AvatarPreview, Modal } from './common';

const ZONE_NAMES: Record<string, string> = { park: 'Công viên', fun: 'Khu vui chơi' };
function zoneLabel(z: string | null | undefined) {
  if (!z) return '';
  if (z.startsWith('farm:')) return 'Đang ở nông trại';
  return ZONE_NAMES[z] ?? z;
}

export function goFarm(userId: number) {
  set({ panel: null, playerCard: null });
  travel(`farm:${userId}`);
}

export function FriendsPanel() {
  const { friends, incoming } = useStore((s) => s.friends);
  const unread = useStore((s) => s.unread);
  const [name, setName] = useState('');

  useEffect(() => { call('friend:list').then((r) => r.ok && set({ friends: { friends: r.friends, incoming: r.incoming } })); }, []);

  async function add() {
    if (!name.trim()) return;
    const r = await call('friend:request', { name: name.trim() });
    if (r.ok) { toast(r.accepted ? 'Đã trở thành bạn bè 🤝' : 'Đã gửi lời mời kết bạn 💌', 'success'); setName(''); }
  }

  return (
    <Modal title="👥 Bạn bè" onClose={() => set({ panel: null })}>
      <div className="row-input">
        <input placeholder="Nhập tên người chơi..." value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary" onClick={add}>Kết bạn</button>
      </div>
      {incoming.length > 0 && (
        <>
          <h4>Lời mời kết bạn</h4>
          {incoming.map((f) => (
            <div key={f.id} className="friend-row">
              <span className="friend-name">{f.name} <small>Lv{f.level}</small></span>
              <button className="btn small primary" onClick={() => call('friend:respond', { userId: f.id, accept: true })}>Đồng ý</button>
              <button className="btn small" onClick={() => call('friend:respond', { userId: f.id, accept: false })}>Từ chối</button>
            </div>
          ))}
        </>
      )}
      <h4>Danh sách bạn ({friends.length})</h4>
      {friends.length === 0 && <p className="empty">Chưa có bạn nào. Hãy bấm vào người chơi khác để kết bạn!</p>}
      {friends.map((f) => (
        <div key={f.id} className="friend-row">
          <span className={`dot ${f.online ? 'on' : ''}`} />
          <span className="friend-name">{f.name} <small>Lv{f.level} {f.online ? `· ${zoneLabel(f.zone)}` : '· offline'}</small></span>
          <button className="btn small" title="Thăm nông trại" onClick={() => goFarm(f.id)}>🌾 Thăm vườn</button>
          <button className="btn small" title="Nhắn tin" onClick={() => openChat(f.id, f.name)}>💬{unread[f.id] ? ` ${unread[f.id]}` : ''}</button>
          <button className="btn small danger" title="Huỷ kết bạn" onClick={() => confirmBox(`Huỷ kết bạn với ${f.name}?`, () => call('friend:remove', { userId: f.id }))}>✕</button>
        </div>
      ))}
    </Modal>
  );
}

interface PlayerInfo { id: number; name: string; level: number; appearance: Appearance; friend: string | null; online: boolean }

export function PlayerCard() {
  const id = useStore((s) => s.playerCard)!;
  const [p, setP] = useState<PlayerInfo | null>(null);
  useEffect(() => { call('player:info', { userId: id }).then((r) => r.ok && setP(r.player)); }, [id]);
  const close = () => set({ playerCard: null });
  if (!p) return null;
  return (
    <Modal title={p.name} onClose={close} className="player-card">
      <div className="pc-body">
        <div className="stage-circle small"><AvatarPreview appearance={p.appearance} size={150} /></div>
        <div className="pc-info">
          <div className="lv-badge">Cấp {p.level}</div>
          <div className="pc-outfit">
            {[p.appearance.top, p.appearance.bottom, p.appearance.hat, p.appearance.acc].filter(Boolean).map((i) => (
              <span key={i!} className="chip">{ITEMS[i!]?.name}</span>
            ))}
          </div>
          <div className="pc-actions">
            {p.friend === 'accepted' ? <span className="chip ok">🤝 Bạn bè</span>
              : p.friend === 'pending' ? <span className="chip">Đã gửi lời mời</span>
              : <button className="btn primary" onClick={async () => {
                const r = await call('friend:request', { userId: p.id });
                if (r.ok) { toast(r.accepted ? 'Đã trở thành bạn bè 🤝' : 'Đã gửi lời mời 💌', 'success'); setP({ ...p, friend: r.accepted ? 'accepted' : 'pending' }); }
              }}>➕ Kết bạn</button>}
            <button className="btn" onClick={() => goFarm(p.id)}>🌾 Thăm nông trại</button>
            <button className="btn" onClick={() => (p.friend === 'accepted' ? openChat(p.id, p.name) : toast('Kết bạn trước để nhắn tin riêng nhé'))}>💬 Nhắn riêng</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function MapPanel() {
  const me = useStore((s) => s.me)!;
  const go = (zone: string) => { set({ panel: null }); travel(zone); };
  const places = [
    ['myfarm', '🌾', 'Nông trại của tôi', 'Vườn rau, ao cá, chuồng gà bò cừu'],
    ['fun', '🎡', 'Khu vui chơi', 'Khu giải trí (bầu cua, tiến lên), cửa hàng, tiệm thời trang'],
    ['park', '🌳', 'Công viên', 'Hồ sen, ghế đá, nơi hẹn hò tán gẫu'],
  ];
  return (
    <Modal title="🗺️ Bản đồ Xóm Vui" onClose={() => set({ panel: null })}>
      <div className="map-list">
        {places.map(([z, icon, name, desc]) => (
          <button key={z} className="map-item" onClick={() => go(z)}>
            <span className="map-icon">{icon}</span>
            <span><b>{name}</b><small>{desc}</small></span>
          </button>
        ))}
      </div>
      <p className="hint">Mẹo: Bấm vào người chơi khác để kết bạn hoặc thăm nông trại của họ. Chào {me.name}! 👋</p>
    </Modal>
  );
}

type InvTab = 'kho' | 'tui';
const SLOT_LABEL: [string, string][] = [['top', '👕 Áo'], ['bottom', '👖 Quần'], ['hat', '🎩 Mũ'], ['acc', '🕶️ Phụ kiện']];

/** Hai bảng riêng: Kho nông trại (nông sản, hạt giống, thức ăn) và Túi đồ cá nhân (trang phục). */
export function InventoryPanel({ tab }: { tab: InvTab }) {
  useStore((s) => s.catalogVer); // vẽ lại khi bảng giá đổi
  const me = useStore((s) => s.me)!;
  const entries = Object.entries(me.inventory).filter(([id, q]) => q > 0 && ITEMS[id]);
  const byKind = (k: string) => entries.filter(([id]) => ITEMS[id].kind === k);
  return (
    <Modal title={tab === 'kho' ? '🏚️ Kho nông trại' : '🎒 Túi đồ'} onClose={() => set({ panel: null })} wide className="inv-modal">
      {tab === 'kho'
        ? <KhoView produce={byKind('produce')} seeds={byKind('seed')} feed={byKind('feed')} />
        : <TuiView clothes={byKind('clothing')} />}
    </Modal>
  );
}

function KhoView({ produce, seeds, feed }: { produce: [string, number][]; seeds: [string, number][]; feed: [string, number][] }) {
  const [busy, setBusy] = useState(false);
  const value = produce.reduce((s, [id, q]) => s + (ITEMS[id].sell ?? 0) * q, 0);

  async function sell(id: string, qty: number) {
    if (busy) return;
    setBusy(true);
    const r = await call('shop:sell', { itemId: id, qty });
    setBusy(false);
    if (r.ok) toast(`💰 Bán ${qty} ${ITEMS[id].name} · +${r.earned} xu`, 'success');
  }
  async function sellAll() {
    if (busy || !produce.length) return;
    setBusy(true);
    let total = 0;
    for (const [id, q] of produce) {
      const r = await call('shop:sell', { itemId: id, qty: q });
      if (r.ok) total += r.earned;
    }
    setBusy(false);
    if (total) toast(`💰 Đã bán hết nông sản · +${total.toLocaleString('vi-VN')} xu`, 'success');
  }

  if (!produce.length && !seeds.length && !feed.length) {
    return <div className="inv-empty"><span>🏚️</span><p>Kho đang trống.<br />Mua hạt giống ở cửa hàng, trồng và thu hoạch để đầy kho nhé!</p></div>;
  }
  return (
    <div className="inv-body kho-layout">
      <section className="inv-sec inv-card kho-main">
        <div className="inv-sec-head">
          <h4>🧺 Nông sản <small>bán được</small></h4>
          {produce.length > 0 && (
            <div className="inv-sum">
              <span>Giá trị: <b>💰 {value.toLocaleString('vi-VN')}</b></span>
              <button className="btn small primary" disabled={busy} onClick={() => confirmBox(`Bán hết nông sản được ${value.toLocaleString('vi-VN')} xu?`, sellAll)}>Bán hết</button>
            </div>
          )}
        </div>
        {produce.length === 0 ? <p className="inv-note">Chưa có nông sản — thu hoạch cây hoặc nhặt trứng, sữa trong chuồng.</p> : (
          <div className="inv-list">
            {produce.map(([id, q]) => (
              <div key={id} className="inv-row">
                <span className="inv-icon">{ITEMS[id].icon}</span>
                <span className="inv-row-name"><b>{ITEMS[id].name}</b><small>💰 {ITEMS[id].sell} / cái</small></span>
                <span className="inv-row-qty">×{q}</span>
                <div className="inv-row-btns">
                  <button className="btn tiny" disabled={busy} onClick={() => sell(id, 1)}>Bán 1</button>
                  <button className="btn tiny primary" disabled={busy} onClick={() => sell(id, q)}>Bán hết</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="kho-side">
        {([['🌱 Hạt giống', seeds, 'Chọn hạt ở thanh công cụ, chạm ô đất trống để gieo'], ['🌾 Thức ăn', feed, 'Cho vật nuôi trong chuồng ăn']] as [string, [string, number][], string][]).map(([label, list, note]) => (
          <section key={label} className="inv-sec inv-card">
            <div className="inv-sec-head"><h4>{label}</h4></div>
            {list.length === 0 ? <p className="inv-note">Chưa có</p> : (
              <div className="stock-list">
                {list.map(([id, q]) => (
                  <div key={id} className="stock-chip" title={ITEMS[id].name}>
                    <span className="stock-icon">{ITEMS[id].icon}</span>
                    <span className="stock-name">{ITEMS[id].name}</span>
                    <b className="stock-qty">×{q}</b>
                  </div>
                ))}
              </div>
            )}
            <p className="inv-note stock-note">{note}</p>
          </section>
        ))}
      </div>
      <div className="inv-actions">
        <button className="btn" onClick={() => set({ panel: 'shop', shopTab: 'seed' })}>🛒 Mua hạt giống</button>
      </div>
    </div>
  );
}

function TuiView({ clothes }: { clothes: [string, number][] }) {
  const ap = useStore((s) => s.me!.appearance) as unknown as Record<string, string | null>;
  const worn = new Set(Object.values(ap).filter((v): v is string => typeof v === 'string'));
  const [busy, setBusy] = useState<string | null>(null);
  // Màn hẹp: nhân vật xem trước nhỏ hơn (vẽ đúng cỡ, không ép CSS → không méo/cắt)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Chạm là mặc ngay. Mũ / phụ kiện đang đeo thì chạm lần nữa để tháo (áo, quần luôn phải có).
  async function wear(id: string) {
    if (busy) return;
    const slot = ITEMS[id].slot as string;
    const optional = slot === 'hat' || slot === 'acc';
    if (worn.has(id) && !optional) return;
    const next = { ...ap, [slot]: worn.has(id) ? null : id };
    setBusy(id);
    const r = await call('avatar:save', { appearance: next });
    setBusy(null);
    if (r.ok) toast(worn.has(id) ? `Đã tháo ${ITEMS[id].name}` : `✨ Đã mặc ${ITEMS[id].name}`, 'success');
  }

  if (!clothes.length) return <div className="inv-empty"><span>🎒</span><p>Túi trống.<br />Ghé cửa hàng thời trang ở Khu vui chơi nhé!</p></div>;
  return (
    <div className="inv-body tui-layout">
      {/* Nhân vật đang mặc gì */}
      <div className="tui-preview inv-card">
        <div className="tui-stage"><AvatarPreview appearance={ap as unknown as Appearance} size={narrow ? 120 : 170} /></div>
        <small className="tui-label">Đang mặc</small>
      </div>
      <div className="tui-list">
        {SLOT_LABEL.map(([slot, label]) => {
          const list = clothes.filter(([id]) => ITEMS[id].slot === slot);
          if (!list.length) return null;
          return (
            <section key={slot} className="inv-sec inv-card">
              <div className="inv-sec-head"><h4>{label} <small>{list.length}</small></h4></div>
              <div className="cloth-grid">
                {list.map(([id]) => (
                  <button key={id} className={`cloth-card ${worn.has(id) ? 'worn' : ''} ${busy === id ? 'busy' : ''}`} title={ITEMS[id].name}
                    onClick={() => wear(id)} disabled={!!busy}>
                    {/* Xem trước: nhân vật mặc thử món này */}
                    <div className="cloth-ava"><AvatarPreview appearance={{ ...ap, [slot]: id } as unknown as Appearance} size={64} /></div>
                    <span className="cloth-name">{ITEMS[id].name}</span>
                    {worn.has(id)
                      ? <span className="cloth-worn">✓ Đang mặc{(slot === 'hat' || slot === 'acc') ? ' · chạm để tháo' : ''}</span>
                      : <span className="cloth-try">Chạm để mặc</span>}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <div className="inv-actions">
        <button className="btn primary" onClick={() => set({ panel: 'wardrobe' })}>👕 Thay đồ</button>
      </div>
    </div>
  );
}
