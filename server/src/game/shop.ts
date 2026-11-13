import type { Socket } from 'socket.io';
import { Appearance, ECON, HAIR_COLORS, HAIR_STYLES, ITEMS, OPTIONAL_SLOTS, resellPrice, SKINS, Slot } from '../../../shared/catalog';
import { addCoins, addItem, GameError, getProfile, itemQty, removeItem, setAppearance, tx } from '../db';
import { broadcastToZone } from './world';
import { handle, OnlinePlayer, pushMe } from './online';
import { announce } from './community';

export function registerShop(socket: Socket, p: OnlinePlayer) {
  const uid = p.userId;

  handle<{ itemId: string; qty?: number }>(socket, 'shop:buy', async ({ itemId, qty }) => {
    const item = ITEMS[itemId];
    if (!item || item.price == null) throw new GameError('Vật phẩm không bán');
    let n = Math.floor(Number(qty) || 1);
    if (n < 1 || n > 99) throw new GameError('Số lượng không hợp lệ');
    if (item.kind === 'clothing') {
      n = 1;
      if ((await itemQty(uid, itemId)) > 0) throw new GameError('Bạn đã có món này');
    }
    if ((await getProfile(uid)).level < (item.level ?? 1)) throw new GameError(`Cần cấp ${item.level}`);
    await tx(async () => {
      await addCoins(uid, -item.price! * n);
      await addItem(uid, itemId, n);
    });
    await pushMe(uid);
  });

  handle<{ itemId: string; qty?: number }>(socket, 'shop:sell', async ({ itemId, qty }) => {
    const item = ITEMS[itemId];
    if (!item) throw new GameError('Không bán được món này');
    let n = Math.floor(Number(qty) || 1);
    if (n < 1) throw new GameError('Số lượng không hợp lệ');
    let unit: number;
    if (item.kind === 'clothing') {
      // Quần áo / vật phẩm: bán lại theo tỉ lệ giá mua, không bán món đang mặc
      unit = resellPrice(itemId);
      if (!unit) throw new GameError('Đồ tặng kèm không bán lại được');
      const worn = Object.values(p.appearance ?? {}).includes(itemId);
      if (worn) throw new GameError(`Bạn đang dùng ${item.name} — tháo ra rồi mới bán được`);
      n = 1;
    } else {
      if (item.sell == null) throw new GameError('Không bán được món này');
      unit = item.sell;
    }
    const earned = unit * n;
    await tx(async () => {
      await removeItem(uid, itemId, n);
      await addCoins(uid, earned);
    });
    await pushMe(uid);
    return { earned };
  });

  handle<{ appearance: Appearance }>(socket, 'avatar:save', async ({ appearance: a }) => {
    if (!a || typeof a !== 'object') throw new GameError('Dữ liệu không hợp lệ');
    const prof = await getProfile(uid);
    const firstTime = !prof.created;
    const clean: Appearance = {
      // Tóc, màu da chỉ chọn tự do khi tạo nhân vật; sau đó phải ra Tiệm thời trang (salon:apply)
      skin: firstTime ? clampIdx(a.skin, SKINS.length) : prof.appearance.skin,
      hair: firstTime ? clampIdx(a.hair, HAIR_STYLES.length) : prof.appearance.hair,
      hairColor: firstTime ? clampIdx(a.hairColor, HAIR_COLORS.length) : prof.appearance.hairColor,
      top: (await checkOwned(uid, a.top, 'top'))!,
      bottom: (await checkOwned(uid, a.bottom, 'bottom'))!,
      hat: await checkOwned(uid, a.hat, 'hat'),
      acc: await checkOwned(uid, a.acc, 'acc'),
      hand: await checkOwned(uid, a.hand, 'hand'),
      mouth: await checkOwned(uid, a.mouth, 'mouth'),
      ride: await checkOwned(uid, a.ride, 'ride'),
    };
    await setAppearance(uid, clean);
    if (firstTime) await announce('newbie', `🎉 Chào mừng cư dân mới ${p.name} vừa chuyển đến Xóm Vui! Ghé chào và kết bạn nhé 👋`, uid);
    applyAppearance(clean);
    await pushMe(uid);
  });

  // Tiệm làm tóc: đổi kiểu tóc / màu tóc / màu da, tính tiền từng món thay đổi
  handle<{ hair?: number; hairColor?: number; skin?: number }>(socket, 'salon:apply', async (req) => {
    const prof = await getProfile(uid);
    const cur = prof.appearance;
    const next: Appearance = {
      ...cur,
      hair: req.hair == null ? cur.hair : clampIdx(req.hair, HAIR_STYLES.length),
      hairColor: req.hairColor == null ? cur.hairColor : clampIdx(req.hairColor, HAIR_COLORS.length),
      skin: req.skin == null ? cur.skin : clampIdx(req.skin, SKINS.length),
    };
    const cost = (next.hair !== cur.hair ? ECON.salonHair : 0)
      + (next.hairColor !== cur.hairColor ? ECON.salonColor : 0)
      + (next.skin !== cur.skin ? ECON.salonSkin : 0);
    if (!cost) throw new GameError('Bạn chưa thay đổi gì');
    await tx(async () => {
      await addCoins(uid, -cost);
      await setAppearance(uid, next);
    });
    applyAppearance(next);
    await pushMe(uid);
    return { cost };
  });

  function applyAppearance(a: Appearance) {
    p.appearance = a;
    if (p.zone) broadcastToZone(p.zone, 'player:appearance', { id: uid, appearance: a });
  }
}

function clampIdx(v: unknown, n: number) {
  const i = Math.floor(Number(v));
  if (!Number.isInteger(i) || i < 0 || i >= n) throw new GameError('Dữ liệu không hợp lệ');
  return i;
}

async function checkOwned(uid: number, id: unknown, slot: Slot): Promise<string | null> {
  if (id == null || id === '') {
    if (OPTIONAL_SLOTS.includes(slot)) return null;
    throw new GameError('Thiếu trang phục');
  }
  const item = ITEMS[String(id)];
  if (!item || item.kind !== 'clothing' || item.slot !== slot) throw new GameError('Trang phục không hợp lệ');
  if ((await itemQty(uid, item.id)) < 1) throw new GameError(`Bạn chưa sở hữu ${item.name}`);
  return item.id;
}
