import { useEffect, useState } from 'react';
import type { Appearance } from '../../../shared/catalog';
import { ITEMS } from '../../../shared/catalog';
import { call, travel } from '../net';
import { confirmBox, set, toast, useStore } from '../store';
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
          {f.online && <button className="btn small" title="Nhắn tin" onClick={() => { set({ pmTarget: { id: f.id, name: f.name }, panel: null }); }}>💬</button>}
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
            <button className="btn" onClick={() => { set({ pmTarget: { id: p.id, name: p.name } }); close(); }}>💬 Nhắn riêng</button>
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

export function InventoryPanel() {
  const me = useStore((s) => s.me)!;
  const groups: [string, string][] = [['seed', '🌱 Hạt giống'], ['produce', '🧺 Nông sản'], ['feed', '🌾 Thức ăn'], ['clothing', '👗 Trang phục']];
  const entries = Object.entries(me.inventory).filter(([id, q]) => q > 0 && ITEMS[id]);
  return (
    <Modal title="🎒 Túi đồ" onClose={() => set({ panel: null })} wide>
      {groups.map(([kind, label]) => {
        const list = entries.filter(([id]) => ITEMS[id].kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind}>
            <h4>{label}</h4>
            <div className="inv-grid">
              {list.map(([id, q]) => (
                <div key={id} className="inv-item" title={ITEMS[id].name}>
                  {kind === 'clothing'
                    ? <span className="color-dot big" style={{ background: ITEMS[id].color }} />
                    : <span className="inv-icon">{ITEMS[id].icon}</span>}
                  <span className="inv-name">{ITEMS[id].name}</span>
                  {kind !== 'clothing' && <span className="inv-qty">x{q}</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="inv-actions">
        <button className="btn" onClick={() => set({ panel: 'shop', shopTab: 'sell' })}>💰 Bán nông sản</button>
        <button className="btn" onClick={() => set({ panel: 'wardrobe' })}>👗 Thay đồ</button>
      </div>
    </Modal>
  );
}
