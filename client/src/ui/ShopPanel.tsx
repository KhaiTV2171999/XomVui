import { ANIMALS, CROPS, ITEMS, MAX_ANIMALS } from '../../../shared/catalog';
import { call } from '../net';
import { confirmBox, fmt, set, toast, useStore } from '../store';
import { fmtTime } from '../game/farmUtil';
import { AvatarPreview, Modal, Tabs } from './common';

const DOG_PRICE = 800;
const DOG_LEVEL = 2;

/** Chó giữ nhà: 50% bắt được kẻ hái trộm, phạt 30 xu về cho chủ vườn. */
function DogCard({ level }: { level: number }) {
  const hasDog = useStore((s) => !!s.farm?.dog);
  const locked = level < DOG_LEVEL;
  return (
    <div className={`shop-card ${locked ? 'locked' : ''}`}>
      <div className="shop-icon">🐕</div>
      <div className="shop-name">Chó giữ nhà</div>
      <div className="shop-meta">Đuổi kẻ hái trộm (50%), phạt 30 xu về cho bạn</div>
      {hasDog ? <div className="owned-tag">✔ Đã có</div>
        : locked ? <div className="lock-tag">🔒 Cấp {DOG_LEVEL}</div>
        : <button className="btn small primary" onClick={async () => {
          const r = await call('farm:buyDog');
          if (r.ok) toast('🐕 Chó giữ nhà đã về! Kẻ trộm coi chừng nhé', 'success');
        }}>💰 {fmt(DOG_PRICE)}</button>}
    </div>
  );
}

type Tab ='seed' | 'animal' | 'clothing' | 'sell';

export function ShopPanel() {
  const me = useStore((s) => s.me)!;
  const zoneKind = useStore((s) => s.zone?.kind);
  // Ở nông trại: hạt giống, vật nuôi, bán nông sản. Ở nơi khác: chỉ quần áo, phụ kiện.
  const farmShop = zoneKind === 'farm';
  const storedTab = useStore((s) => s.shopTab) as Tab;
  const tab: Tab = farmShop ? (storedTab === 'clothing' ? 'seed' : storedTab) : 'clothing';
  const setTab = (t: Tab) => set({ shopTab: t });

  async function buy(itemId: string, qty = 1) {
    const r = await call('shop:buy', { itemId, qty });
    if (r.ok) toast(`Đã mua ${qty > 1 ? qty + ' x ' : ''}${ITEMS[itemId].name}`, 'success');
  }

  async function sell(itemId: string, qty: number) {
    const r = await call('shop:sell', { itemId, qty });
    if (r.ok) toast(`Bán được ${fmt(r.earned)} xu 💰`, 'success');
  }

  const sellable = Object.entries(me.inventory).filter(([id, q]) => q > 0 && ITEMS[id]?.sell != null);
  const sellAll = () => {
    const total = sellable.reduce((s, [id, q]) => s + ITEMS[id].sell! * q, 0);
    confirmBox(`Bán toàn bộ nông sản được ${fmt(total)} xu?`, async () => {
      for (const [id, q] of sellable) await call('shop:sell', { itemId: id, qty: q });
      toast(`Bán được ${fmt(total)} xu 💰`, 'success');
    });
  };

  return (
    <Modal title={farmShop ? '🌱 Cửa hàng nông trại' : '🛍️ Cửa hàng thời trang'} onClose={() => set({ panel: null })} wide>
      {farmShop && <Tabs<Tab> value={tab} onChange={setTab} tabs={[['seed', '🌱 Hạt giống'], ['animal', '🐔 Vật nuôi'], ['sell', '💰 Bán nông sản']]} />}

      {tab === 'seed' && (
        <div className="shop-grid">
          {Object.values(CROPS).map((c) => {
            const locked = me.level < c.level;
            const id = `seed:${c.id}`;
            return (
              <div key={c.id} className={`shop-card ${locked ? 'locked' : ''}`}>
                <div className="shop-icon">{c.icon}</div>
                <div className="shop-name">{c.name}</div>
                <div className="shop-meta">⏱ {fmtTime(c.growSec * 1000)} · thu {c.yield} · bán {c.sell}/quả</div>
                <div className="shop-meta">Đang có: {me.inventory[id] ?? 0}</div>
                {locked ? <div className="lock-tag">🔒 Cấp {c.level}</div> : (
                  <div className="shop-actions">
                    <button className="btn small" onClick={() => buy(id, 1)}>💰 {c.seedPrice}</button>
                    <button className="btn small primary" onClick={() => buy(id, 10)}>x10 · {fmt(c.seedPrice * 10)}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'animal' && (
        <div className="shop-grid">
          {Object.values(ANIMALS).map((a) => {
            const locked = me.level < a.level;
            return (
              <div key={a.id} className={`shop-card ${locked ? 'locked' : ''}`}>
                <div className="shop-icon">{a.icon}</div>
                <div className="shop-name">{a.name}</div>
                <div className="shop-meta">Ăn {a.feed} 🌾 → {a.qty} {ITEMS[a.product].icon} sau {fmtTime(a.produceSec * 1000)}</div>
                {locked ? <div className="lock-tag">🔒 Cấp {a.level}</div> : (
                  <button className="btn small primary" onClick={async () => {
                    const r = await call('farm:buyAnimal', { type: a.id });
                    if (r.ok) toast(`${a.name} đã về chuồng! (tối đa ${MAX_ANIMALS} con)`, 'success');
                  }}>💰 {fmt(a.price)}</button>
                )}
              </div>
            );
          })}
          <DogCard level={me.level} />
          <div className="shop-card">
            <div className="shop-icon">🌾</div>
            <div className="shop-name">Thức ăn gia súc</div>
            <div className="shop-meta">Đang có: {me.inventory.feed ?? 0}</div>
            <div className="shop-actions">
              <button className="btn small" onClick={() => buy('feed', 1)}>💰 15</button>
              <button className="btn small primary" onClick={() => buy('feed', 10)}>x10 · 150</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'clothing' && (
        <div className="shop-grid clothes">
          {Object.values(ITEMS).filter((i) => i.kind === 'clothing' && i.price! > 0).map((it) => {
            const owned = (me.inventory[it.id] ?? 0) > 0;
            const locked = me.level < (it.level ?? 1);
            const preview = { ...me.appearance, [it.slot!]: it.id };
            return (
              <div key={it.id} className={`shop-card ${locked ? 'locked' : ''}`}>
                <AvatarPreview appearance={preview} size={96} />
                <div className="shop-name">{it.name}</div>
                {owned ? <div className="owned-tag">✔ Đã có</div>
                  : locked ? <div className="lock-tag">🔒 Cấp {it.level}</div>
                  : <button className="btn small primary" onClick={() => buy(it.id)}>💰 {fmt(it.price!)}</button>}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'sell' && (
        <>
          {sellable.length === 0 ? <p className="empty">Bạn chưa có nông sản nào. Ra nông trại thu hoạch nhé! 🌾</p> : (
            <>
              <div className="sell-list">
                {sellable.map(([id, q]) => (
                  <div key={id} className="sell-row">
                    <span className="sell-icon">{ITEMS[id].icon}</span>
                    <span className="sell-name">{ITEMS[id].name} <b>x{q}</b></span>
                    <span className="sell-price">{ITEMS[id].sell} xu/cái</span>
                    <button className="btn small" onClick={() => sell(id, 1)}>Bán 1</button>
                    <button className="btn small primary" onClick={() => sell(id, q)}>Bán hết · {fmt(ITEMS[id].sell! * q)}</button>
                  </div>
                ))}
              </div>
              <button className="btn primary big full" onClick={sellAll}>💰 Bán tất cả</button>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
