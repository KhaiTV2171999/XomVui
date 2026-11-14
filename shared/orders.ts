// Bảng đơn hàng: dân làng đặt mua nông sản / sản phẩm vật nuôi, trả cao hơn bán thẳng.
import { ANIMALS, CROPS, ECON, ITEMS } from './catalog';
import { MACHINES } from './workshop';

export interface Order {
  id: number;
  npc: number;
  /** itemId → số lượng cần */
  items: Record<string, number>;
  coins: number;
  xp: number;
  vip: boolean;
}
/** Một ô trên bảng: có đơn, hoặc đang chờ xe tải mang đơn mới tới. */
export type OrderSlot = { order: Order } | { waitUntil: number };

export const NPCS: { name: string; icon: string }[] = [
  { name: 'Bà Tư', icon: '👵' }, { name: 'Ông Bảy', icon: '👴' }, { name: 'Cô Năm', icon: '👩' },
  { name: 'Chú Ba', icon: '👨' }, { name: 'Bé Na', icon: '👧' }, { name: 'Cu Tí', icon: '👦' },
  { name: 'Bác Sáu', icon: '🧓' }, { name: 'Chị Hai', icon: '🙋' },
];

/** Các món có thể xuất hiện trong đơn theo cấp người chơi (cây đã mở + sản phẩm của vật nuôi đã mở). */
function pool(level: number) {
  const out: { item: string; value: number; cheap: boolean }[] = [];
  for (const c of Object.values(CROPS)) if (c.level <= level) out.push({ item: `crop:${c.id}`, value: c.sell, cheap: c.sell <= 30 });
  for (const a of Object.values(ANIMALS)) if (a.level <= level) out.push({ item: a.product, value: a.productSell, cheap: false });
  for (const m of MACHINES) if (m.level <= level && Math.random() < 0.5) out.push({ item: m.output, value: ITEMS[m.output]?.sell ?? 0, cheap: false });
  return out;
}

/** Tạo một đơn hàng ngẫu nhiên phù hợp cấp người chơi. */
export function makeOrder(level: number, id: number, rnd: () => number = Math.random): Order {
  const p = pool(level);
  const kinds = Math.min(p.length, 1 + Math.floor(rnd() * (level >= 4 ? 3 : 2)));
  const picked: typeof p = [];
  while (picked.length < kinds) {
    const x = p[Math.floor(rnd() * p.length)];
    if (!picked.includes(x)) picked.push(x);
  }
  const items: Record<string, number> = {};
  let value = 0;
  for (const x of picked) {
    const max = x.cheap ? 4 + Math.floor(level / 2) : 2 + Math.floor(level / 3);
    const n = 1 + Math.floor(rnd() * max);
    items[x.item] = n;
    value += x.value * n;
  }
  const vip = rnd() < ECON.orderVipChance;
  const coins = Math.max(10, Math.round(value * ECON.orderBonus * (vip ? 2 : 1)));
  const xp = Math.round(5 + value / 10) * (vip ? 2 : 1);
  return { id, npc: Math.floor(rnd() * NPCS.length), items, coins, xp, vip };
}

/** Giá trị đơn cư dân (người giao nhận đủ) và số xu người đặt phải trả (đã giảm giá hệ thống). */
export function playerOrderPrice(items: Record<string, number>) {
  let value = 0;
  for (const [it, n] of Object.entries(items)) value += (ITEMS[it]?.sell ?? 0) * n;
  const full = Math.max(1, Math.round(value * ECON.orderBonus));
  return { full, pay: Math.max(1, Math.round(full * ECON.playerOrderPay)) };
}
export interface PlayerOrder {
  id: number; buyerId: number; buyerName: string; items: Record<string, number>;
  full: number; pay: number; status: 'open' | 'done' | 'cancelled' | 'expired';
  createdAt: number; expiresAt: number; filledBy: string | null;
}

export function orderText(o: { items: Record<string, number> }) {
  return Object.entries(o.items).map(([it, n]) => `${n} ${ITEMS[it]?.icon ?? ''}`).join(' + ');
}
