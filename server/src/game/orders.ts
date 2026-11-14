import type { Socket } from 'socket.io';
import { ECON, ITEMS } from '../../../shared/catalog';
import { makeOrder, Order, OrderSlot, orderText, playerOrderPrice } from '../../../shared/orders';
import {
  addCoins, addItem, addXp, bumpOrdersDone, countOpenPlayerOrders, expirePlayerOrders, Farm, GameError, getFarm, getInventory,
  getProfile, insertPlayerOrder, listMyPlayerOrders, listOpenPlayerOrders, ordersDone, removeItem, takePlayerOrder, tx,
} from '../db';
import { withFarm } from './farm';
import { handle, OnlinePlayer, pushMe, toast } from './online';

const ORDERABLE = (it: string) => it.startsWith('crop:') || it.startsWith('prod:') || it.startsWith('good:');
import { questBump } from './quests';

/** Lấp các ô trống / đã hết giờ chờ bằng đơn mới (theo cấp người chơi). Trả về true nếu có thay đổi. */
function refill(farm: Farm, level: number, now = Date.now()) {
  const slots = (farm.orders ?? []) as OrderSlot[];
  let changed = false;
  const n = Math.max(1, Math.round(ECON.orderSlots));
  while (slots.length < n) { slots.push({ waitUntil: 0 }); changed = true; }
  if (slots.length > n) { slots.length = n; changed = true; }
  let nextId = farm.orderSeq ?? 1;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if ('waitUntil' in s && s.waitUntil <= now) { slots[i] = { order: makeOrder(level, nextId++) }; changed = true; }
  }
  farm.orders = slots;
  farm.orderSeq = nextId;
  return changed;
}

export function registerOrders(socket: Socket, p: OnlinePlayer) {
  const uid = p.userId;

  handle(socket, 'orders:list', async () => {
    const level = (await getProfile(uid)).level;
    const farm = await getFarm(uid);
    const copy: Farm = JSON.parse(JSON.stringify(farm));
    if (refill(copy, level)) {
      const r = await withFarm(uid, (f) => { refill(f, level); return f.orders; });
      return { slots: r, now: Date.now() };
    }
    return { slots: copy.orders, now: Date.now() };
  });

  // Giao hàng: đủ món thì trừ kho, nhận xu + XP; ô đó chờ xe tải mang đơn mới tới
  handle<{ slot: number }>(socket, 'orders:deliver', async ({ slot }) => {
    const level = (await getProfile(uid)).level;
    const res = await withFarm(uid, async (farm) => {
      refill(farm, level);
      const s = (farm.orders as OrderSlot[])[Number(slot)];
      if (!s || !('order' in s)) throw new GameError('Đơn hàng không còn');
      const o: Order = s.order;
      const inv = await getInventory(uid);
      const missing = Object.entries(o.items).filter(([it, n]) => (inv[it] ?? 0) < n);
      if (missing.length) throw new GameError(`Còn thiếu ${missing.map(([it, n]) => `${n - (inv[it] ?? 0)} ${ITEMS[it]?.name ?? it}`).join(', ')}`);
      for (const [it, n] of Object.entries(o.items)) await removeItem(uid, it, n);
      await addCoins(uid, o.coins);
      (farm.orders as OrderSlot[])[Number(slot)] = { waitUntil: Date.now() + ECON.orderRefillMin * 60_000 };
      return { order: o, slots: farm.orders };
    });
    const lv = await addXp(uid, res.order.xp);
    if (lv.leveledUp) toast(uid, `🎉 Chúc mừng! Bạn đã lên cấp ${lv.level}`, 'success');
    questBump(uid, 'order');
    await bumpOrdersDone(uid);
    await pushMe(uid);
    return { coins: res.order.coins, xp: res.order.xp, vip: res.order.vip, slots: res.slots, now: Date.now() };
  });

  // Bỏ qua đơn khó: đơn mới tới chậm hơn (không đổi liên tục để chọn đơn dễ)
  handle<{ slot: number }>(socket, 'orders:skip', async ({ slot }) => {
    const level = (await getProfile(uid)).level;
    const slots = await withFarm(uid, (farm) => {
      refill(farm, level);
      const s = (farm.orders as OrderSlot[])[Number(slot)];
      if (!s || !('order' in s)) throw new GameError('Đơn hàng không còn');
      (farm.orders as OrderSlot[])[Number(slot)] = { waitUntil: Date.now() + ECON.orderSkipMin * 60_000 };
      return farm.orders;
    });
    return { slots, now: Date.now() };
  });

  // ---------- Đơn hàng cư dân ----------
  handle(socket, 'porders:list', async () => {
    const [open, mine, done] = await Promise.all([listOpenPlayerOrders(uid), listMyPlayerOrders(uid), ordersDone(uid)]);
    return { open, mine, done, unlock: ECON.playerOrderUnlock };
  });

  // Đăng đơn: trả trước (đã giảm giá); hàng về kho khi có người giao, hết hạn thì hoàn tiền
  handle<{ items: Record<string, number> }>(socket, 'porders:create', async ({ items }) => {
    const done = await ordersDone(uid);
    if (done < ECON.playerOrderUnlock) throw new GameError(`Giao thêm ${ECON.playerOrderUnlock - done} đơn dân làng nữa để mở khoá tự đăng đơn`);
    const clean: Record<string, number> = {};
    for (const [it, n] of Object.entries(items ?? {})) {
      const q = Math.floor(Number(n));
      if (!ITEMS[it] || !ORDERABLE(it) || !(q >= 1 && q <= 99)) throw new GameError('Đơn hàng không hợp lệ');
      clean[it] = q;
    }
    const kinds = Object.keys(clean).length;
    if (kinds < 1 || kinds > 3) throw new GameError('Mỗi đơn từ 1 đến 3 loại hàng');
    if ((await countOpenPlayerOrders(uid)) >= ECON.playerOrderMax) throw new GameError(`Tối đa ${ECON.playerOrderMax} đơn đang mở`);
    const price = playerOrderPrice(clean);
    const id = await tx(async () => {
      await addCoins(uid, -price.pay);
      return insertPlayerOrder(uid, clean, price.full, price.pay, Date.now() + ECON.playerOrderHours * 3600_000);
    });
    await pushMe(uid);
    return { id, ...price };
  });

  // Giao đơn của cư dân khác: người giao nhận đủ giá trị đơn (hệ thống bù phần giảm giá)
  handle<{ id: number }>(socket, 'porders:fill', async ({ id }) => {
    const o = await tx(async () => {
      const ord = await takePlayerOrder(Number(id), 'done', uid);
      if (!ord) throw new GameError('Đơn đã có người giao hoặc đã huỷ');
      if (ord.buyerId === uid) throw new GameError('Không tự giao đơn của mình được');
      if (ord.expiresAt <= Date.now()) throw new GameError('Đơn đã hết hạn');
      for (const [it, n] of Object.entries(ord.items)) { await removeItem(uid, it, n); await addItem(ord.buyerId, it, n); }
      await addCoins(uid, ord.full);
      return ord;
    });
    const lv = await addXp(uid, Math.round(5 + o.full / 20));
    if (lv.leveledUp) toast(uid, `🎉 Chúc mừng! Bạn đã lên cấp ${lv.level}`, 'success');
    toast(o.buyerId, `📦 ${p.name} đã giao đơn của bạn: ${orderText(o)} — hàng đã về kho!`, 'success');
    questBump(uid, 'order');
    await Promise.all([pushMe(uid), pushMe(o.buyerId)]);
    return { coins: o.full };
  });

  handle<{ id: number }>(socket, 'porders:cancel', async ({ id }) => {
    const o = await tx(async () => {
      const ord = await takePlayerOrder(Number(id), 'cancelled', null);
      if (!ord) throw new GameError('Đơn đã có người giao hoặc đã huỷ');
      if (ord.buyerId !== uid) throw new GameError('Không phải đơn của bạn');
      await addCoins(uid, ord.pay);
      return ord;
    });
    await pushMe(uid);
    return { refund: o.pay };
  });
}

// Đơn cư dân quá hạn: hoàn tiền cho người đặt (mỗi 5 phút)
setInterval(() => {
  (async () => {
    for (const o of await expirePlayerOrders()) {
      await addCoins(o.buyerId, o.pay);
      toast(o.buyerId, `⌛ Đơn ${orderText(o)} hết hạn — đã hoàn ${o.pay} xu`, 'info');
      await pushMe(o.buyerId);
    }
  })().catch((e) => console.error('[porders expire]', e));
}, 5 * 60_000);
