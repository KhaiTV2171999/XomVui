import { useState } from 'react';
import { Appearance, HAIR_COLORS, HAIR_STYLES, ITEMS, SKINS, Slot } from '../../../shared/catalog';
import { call } from '../net';
import { get, set, toast, useStore } from '../store';
import { AvatarPreview, Modal, Tabs } from './common';

type Tab = 'body' | 'hair' | Slot;

export function WardrobeEditor({ onSaved, saveLabel = 'Lưu trang phục' }: { onSaved?: () => void; saveLabel?: string }) {
  const me = useStore((s) => s.me)!;
  const [a, setA] = useState<Appearance>(me.appearance);
  const [tab, setTab] = useState<Tab>('body');
  const [busy, setBusy] = useState(false);

  const owned = (slot: Slot) => Object.keys(me.inventory).filter((id) => ITEMS[id]?.kind === 'clothing' && ITEMS[id].slot === slot);

  async function save() {
    setBusy(true);
    const r = await call('avatar:save', { appearance: a });
    setBusy(false);
    if (r.ok) {
      toast('Đã lưu trang phục ✨', 'success');
      onSaved?.();
    }
  }

  const slotItems = (slot: Slot, optional: boolean) => (
    <div className="item-grid">
      {optional && (
        <button className={`swatch-item ${a[slot] == null ? 'selected' : ''}`} onClick={() => setA({ ...a, [slot]: null })}>
          <span className="big-emoji">🚫</span><span>Không</span>
        </button>
      )}
      {owned(slot).map((id) => (
        <button key={id} className={`swatch-item ${a[slot] === id ? 'selected' : ''}`} onClick={() => setA({ ...a, [slot]: id })}>
          <span className="color-dot" style={{ background: ITEMS[id].color }} />
          <span>{ITEMS[id].name}</span>
        </button>
      ))}
      {me.created && (
        <button className="swatch-item ghost" onClick={() => {
          if (get().zone?.kind === 'fun') set({ panel: 'shop', shopTab: 'clothing' });
          else toast('Ghé Cửa hàng ở Khu vui chơi để mua thêm quần áo 🛍️');
        }}>
          <span className="big-emoji">🛍️</span><span>Mua thêm</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="wardrobe">
      <div className="wardrobe-preview">
        <div className="stage-circle"><AvatarPreview appearance={a} size={210} /></div>
        <button className="btn primary big" onClick={save} disabled={busy}>{saveLabel}</button>
      </div>
      <div className="wardrobe-options">
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[['body', '🙂 Da'], ['hair', '💇 Tóc'], ['top', '👕 Áo'], ['bottom', '👖 Quần'], ['hat', '🎩 Mũ'], ['acc', '🕶️ Phụ kiện']]} />
        {tab === 'body' && (
          <div className="swatches">
            {SKINS.map((c, i) => (
              <button key={c} className={`swatch ${a.skin === i ? 'selected' : ''}`} style={{ background: c }} onClick={() => setA({ ...a, skin: i })} />
            ))}
          </div>
        )}
        {tab === 'hair' && (
          <>
            <h4>Kiểu tóc</h4>
            <div className="hair-grid">
              {HAIR_STYLES.map((name, i) => (
                <button key={name} className={`hair-opt ${a.hair === i ? 'selected' : ''}`} onClick={() => setA({ ...a, hair: i })}>
                  <AvatarPreview appearance={{ ...a, hair: i, hat: null }} size={70} />
                  <span>{name}</span>
                </button>
              ))}
            </div>
            <h4>Màu tóc</h4>
            <div className="swatches">
              {HAIR_COLORS.map((c, i) => (
                <button key={c} className={`swatch ${a.hairColor === i ? 'selected' : ''}`} style={{ background: c }} onClick={() => setA({ ...a, hairColor: i })} />
              ))}
            </div>
          </>
        )}
        {tab === 'top' && slotItems('top', false)}
        {tab === 'bottom' && slotItems('bottom', false)}
        {tab === 'hat' && slotItems('hat', true)}
        {tab === 'acc' && slotItems('acc', true)}
      </div>
    </div>
  );
}

export function WardrobePanel() {
  return (
    <Modal title="👗 Tiệm thời trang · Thay đồ" onClose={() => set({ panel: null })} wide>
      <WardrobeEditor onSaved={() => set({ panel: null })} />
    </Modal>
  );
}

export function CreateCharacter() {
  return (
    <div className="create-screen">
      <div className="create-card">
        <h1>Tạo nhân vật của bạn</h1>
        <p>Chọn màu da, kiểu tóc và trang phục. Bạn có thể mua thêm đồ đẹp trong game!</p>
        <WardrobeEditor saveLabel="Bắt đầu phiêu lưu ➜" onSaved={() => call('zone:join', { zone: 'myfarm', via: 'login' })} />
      </div>
    </div>
  );
}
