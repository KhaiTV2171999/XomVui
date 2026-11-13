import { useMemo, useState } from 'react';
import { Appearance, ECON, GEAR_SLOTS, HAIR_COLORS, HAIR_STYLES, ITEMS, Item, OPTIONAL_SLOTS, resellPrice, SKINS, Slot } from '../../../shared/catalog';
import { call } from '../net';
import { confirmBox, fmt, set, toast, useStore } from '../store';
import { AvatarPreview, Modal, Tabs } from './common';

type Ap = Appearance & Record<string, unknown>;

/** Mặc / tháo một món (lưu ngay lên server). */
async function wear(ap: Appearance, slot: Slot, id: string | null) {
  const r = await call('avatar:save', { appearance: { ...ap, [slot]: id } });
  return r.ok;
}

const SLOT_WORD: Record<Slot, string> = { top: 'Mặc', bottom: 'Mặc', hat: 'Đội', acc: 'Đeo', hand: 'Cầm', mouth: 'Ngậm', ride: 'Đi' };

/**
 * Mặt tiền cửa hàng: bên trái là nhân vật thử đồ, bên phải là danh sách theo ô.
 * Chạm một món để thử, bấm Mua để mua (mua xong tự mặc/dùng luôn).
 */
function Storefront({ slots, tab, setTab, extraTabs, extra }: {
  slots: [Slot, string][]; tab: string; setTab: (t: string) => void;
  extraTabs: [string, string][]; extra: (tryOn: (p: Partial<Appearance>) => void, reset: () => void) => React.ReactNode;
}) {
  useStore((s) => s.catalogVer);
  const me = useStore((s) => s.me)!;
  const [tryOn, setTryOn] = useState<Partial<Appearance>>({});
  const [busy, setBusy] = useState(false);
  const preview = { ...me.appearance, ...tryOn } as Appearance;
  const slotTab = slots.find(([s]) => s === tab)?.[0];
  const ride = preview.ride ? ITEMS[preview.ride] : null;

  async function buy(it: Item) {
    if (busy) return;
    setBusy(true);
    const r = await call('shop:buy', { itemId: it.id });
    if (r.ok) {
      // Mua xong mặc / dùng luôn
      const ok = await wear(me.appearance, it.slot!, it.id);
      toast(`🛍️ Đã mua ${it.name}${ok ? ' — dùng luôn nhé!' : ''}`, 'success');
      setTryOn({});
    }
    setBusy(false);
  }

  async function toggleWear(it: Item, worn: boolean) {
    if (busy) return;
    const slot = it.slot!;
    if (worn && !OPTIONAL_SLOTS.includes(slot)) return;
    setBusy(true);
    if (await wear(me.appearance, slot, worn ? null : it.id)) toast(worn ? `Đã tháo ${it.name}` : `✨ ${SLOT_WORD[slot]} ${it.name}`, 'success');
    setTryOn({});
    setBusy(false);
  }

  const items = slotTab ? Object.values(ITEMS).filter((i) => i.kind === 'clothing' && i.slot === slotTab && (i.price ?? 0) > 0)
    .sort((a, b) => (a.level ?? 1) - (b.level ?? 1) || a.price! - b.price!) : [];

  return (
    <div className="store">
      <div className="store-preview">
        <div className={`stage-circle store-stage ${ride ? 'riding' : ''}`}><AvatarPreview appearance={preview} size={ride ? 190 : 200} /></div>
        {Object.keys(tryOn).length > 0
          ? <button className="btn small" onClick={() => setTryOn({})}>↺ Bỏ thử đồ</button>
          : <small className="store-hint">Chạm một món để thử trước khi mua</small>}
        {ride?.speed && <span className="chip ok">⚡ Tốc độ ×{String(ride.speed).replace('.', ',')}</span>}
      </div>
      <div className="store-main">
        <Tabs<string> value={tab} onChange={(t) => { setTab(t); setTryOn({}); }} tabs={[...slots, ...extraTabs]} />
        {slotTab ? (
          <div className="store-grid">
            {items.map((it) => {
              const owned = (me.inventory[it.id] ?? 0) > 0;
              const worn = (me.appearance as Ap)[it.slot!] === it.id;
              const locked = me.level < (it.level ?? 1);
              const trying = (tryOn as Ap)[it.slot!] === it.id;
              return (
                <div key={it.id} className={`store-card ${locked ? 'locked' : ''} ${trying ? 'trying' : ''} ${worn ? 'worn' : ''}`}
                  onClick={() => setTryOn(trying ? {} : { [it.slot!]: it.id })}>
                  <div className="store-ava">
                    {/* Ảnh thẻ: chỉ mặc thêm món này (bỏ xe đang đi cho gọn, trừ khi đang xem xe) */}
                    <AvatarPreview appearance={{ ...me.appearance, ...(it.slot === 'ride' ? {} : { ride: null }), [it.slot!]: it.id } as Appearance} size={it.slot === 'ride' ? 70 : 78} />
                    {GEAR_SLOTS.includes(it.slot!) && <span className="store-ic">{it.icon}</span>}
                  </div>
                  <div className="store-name">{it.name}</div>
                  {it.desc && <div className="store-desc">{it.desc}</div>}
                  <div className="store-act" onClick={(e) => e.stopPropagation()}>
                    {owned
                      ? <button className={`btn small ${worn ? '' : 'primary'}`} disabled={busy || (worn && !OPTIONAL_SLOTS.includes(it.slot!))} onClick={() => toggleWear(it, worn)}>
                          {worn ? (OPTIONAL_SLOTS.includes(it.slot!) ? '✓ Đang dùng · Tháo' : '✓ Đang mặc') : `${SLOT_WORD[it.slot!]} ngay`}
                        </button>
                      : locked ? <span className="lock-tag">🔒 Cấp {it.level}</span>
                      : <button className="btn small buy" disabled={busy || me.coins < it.price!} onClick={() => buy(it)}>💰 {fmt(it.price!)}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : extra((p) => setTryOn(p), () => setTryOn({}))}
      </div>
    </div>
  );
}

/** Bán lại quần áo / vật phẩm trong các ô cho trước. */
function SellBack({ slots }: { slots: Slot[] }) {
  const me = useStore((s) => s.me)!;
  const ap = me.appearance as Ap;
  const list = Object.entries(me.inventory)
    .filter(([id, q]) => q > 0 && ITEMS[id]?.kind === 'clothing' && slots.includes(ITEMS[id].slot!))
    .map(([id]) => ITEMS[id])
    .sort((a, b) => resellPrice(b.id) - resellPrice(a.id));
  if (!list.length) return <p className="empty">Bạn chưa có món nào để bán.</p>;
  return (
    <div className="sell-list">
      <p className="store-note">Bán lại được {Math.round(ECON.resellRate * 100)}% giá mua. Đồ đang dùng phải tháo ra trước.</p>
      {list.map((it) => {
        const price = resellPrice(it.id);
        const worn = ap[it.slot!] === it.id;
        return (
          <div key={it.id} className="sell-row">
            <span className="sell-icon">{it.icon}</span>
            <span className="sell-name">{it.name}{worn && <small> · đang dùng</small>}</span>
            {price === 0 ? <span className="sell-price">Đồ tặng kèm</span>
              : <button className="btn small primary" disabled={worn} onClick={() => confirmBox(`Bán ${it.name} được ${fmt(price)} xu?`, async () => {
                  const r = await call('shop:sell', { itemId: it.id, qty: 1 });
                  if (r.ok) toast(`Bán được ${fmt(r.earned)} xu 💰`, 'success');
                })}>Bán · {fmt(price)}</button>}
          </div>
        );
      })}
    </div>
  );
}

/** Tiệm làm tóc: đổi kiểu tóc, nhuộm màu, đổi màu da — tính tiền từng thay đổi. */
function Salon({ tryOn, reset }: { tryOn: (p: Partial<Appearance>) => void; reset: () => void }) {
  const me = useStore((s) => s.me)!;
  const cur = me.appearance;
  const [hair, setHair] = useState(cur.hair);
  const [hairColor, setHairColor] = useState(cur.hairColor);
  const [skin, setSkin] = useState(cur.skin);
  const [busy, setBusy] = useState(false);
  const cost = (hair !== cur.hair ? ECON.salonHair : 0) + (hairColor !== cur.hairColor ? ECON.salonColor : 0) + (skin !== cur.skin ? ECON.salonSkin : 0);
  const pick = (p: Partial<Appearance>) => {
    const n = { hair, hairColor, skin, ...p };
    if (p.hair != null) setHair(p.hair);
    if (p.hairColor != null) setHairColor(p.hairColor);
    if (p.skin != null) setSkin(p.skin);
    tryOn({ ...n, hat: null });
  };
  return (
    <div className="salon">
      <h4>💇 Kiểu tóc <small>{fmt(ECON.salonHair)} xu</small></h4>
      <div className="hair-grid">
        {HAIR_STYLES.map((name, i) => (
          <button key={name} className={`hair-opt ${hair === i ? 'selected' : ''}`} onClick={() => pick({ hair: i })}>
            <AvatarPreview appearance={{ ...cur, hair: i, hairColor, skin, hat: null, hand: null, ride: null }} size={70} />
            <span>{name}</span>
          </button>
        ))}
      </div>
      <h4>🎨 Màu tóc <small>{fmt(ECON.salonColor)} xu</small></h4>
      <div className="swatches">
        {HAIR_COLORS.map((c, i) => (
          <button key={c} className={`swatch ${hairColor === i ? 'selected' : ''}`} style={{ background: c }} onClick={() => pick({ hairColor: i })} aria-label={`Màu tóc ${i + 1}`} />
        ))}
      </div>
      <h4>🙂 Màu da <small>{fmt(ECON.salonSkin)} xu</small></h4>
      <div className="swatches">
        {SKINS.map((c, i) => (
          <button key={c} className={`swatch ${skin === i ? 'selected' : ''}`} style={{ background: c }} onClick={() => pick({ skin: i })} aria-label={`Màu da ${i + 1}`} />
        ))}
      </div>
      <div className="salon-bar">
        <button className="btn" disabled={!cost} onClick={() => { setHair(cur.hair); setHairColor(cur.hairColor); setSkin(cur.skin); reset(); }}>↺ Như cũ</button>
        <button className="btn primary" disabled={!cost || busy || me.coins < cost} onClick={async () => {
          setBusy(true);
          const r = await call('salon:apply', { hair, hairColor, skin });
          setBusy(false);
          if (r.ok) { toast(`💇 Làm đẹp xong! (−${fmt(r.cost)} xu)`, 'success'); reset(); }
        }}>{cost ? `✂️ Làm đẹp · ${fmt(cost)} xu` : 'Chọn kiểu mới để làm'}</button>
      </div>
    </div>
  );
}

const FASHION: [Slot, string][] = [['top', '👕 Áo'], ['bottom', '👖 Quần'], ['hat', '🎩 Mũ'], ['acc', '🕶️ Phụ kiện']];
const GEAR: [Slot, string][] = [['hand', '🎈 Cầm tay'], ['mouth', '🎺 Ngậm'], ['ride', '🛵 Phương tiện']];

/** Tiệm thời trang: mua bán quần áo, phụ kiện, làm tóc. */
export function BoutiquePanel() {
  const [tab, setTab] = useState('top');
  const slots = useMemo(() => FASHION.map(([s]) => s), []);
  return (
    <Modal title="👗 Tiệm thời trang" onClose={() => set({ panel: null })} wide className="store-modal">
      <Storefront slots={FASHION} tab={tab} setTab={setTab} extraTabs={[['salon', '💇 Làm tóc'], ['sell', '💸 Bán đồ']]}
        extra={(tryOn, reset) => tab === 'salon' ? <Salon tryOn={tryOn} reset={reset} /> : <SellBack slots={slots} />} />
    </Modal>
  );
}

/** Cửa hàng vật phẩm (Khu vui chơi): đồ cầm tay, đồ ngậm, phương tiện. */
export function GearShopPanel() {
  const [tab, setTab] = useState('hand');
  const slots = useMemo(() => GEAR.map(([s]) => s), []);
  return (
    <Modal title="🛒 Cửa hàng vật phẩm" onClose={() => set({ panel: null })} wide className="store-modal">
      <Storefront slots={GEAR} tab={tab} setTab={setTab} extraTabs={[['sell', '💸 Bán lại']]}
        extra={() => <SellBack slots={slots} />} />
    </Modal>
  );
}
