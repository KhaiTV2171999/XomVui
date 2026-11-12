import type { Socket } from 'socket.io';
import { Appearance, HAIR_COLORS, HAIR_STYLES, ITEMS, SKINS, Slot } from '../../../shared/catalog';
import { addCoins, addItem, GameError, getProfile, itemQty, removeItem, setAppearance, tx } from '../db';
import { broadcastToZone } from './world';
import { handle, OnlinePlayer, pushMe } from './online';

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
    if (!item || item.sell == null) throw new GameError('Không bán được món này');
    const n = Math.floor(Number(qty) || 1);
    if (n < 1) throw new GameError('Số lượng không hợp lệ');
    const earned = item.sell * n;
    await tx(async () => {
      await removeItem(uid, itemId, n);
      await addCoins(uid, earned);
    });
    await pushMe(uid);
    return { earned };
  });

  handle<{ appearance: Appearance }>(socket, 'avatar:save', async ({ appearance: a }) => {
    if (!a || typeof a !== 'object') throw new GameError('Dữ liệu không hợp lệ');
    const clean: Appearance = {
      skin: clampIdx(a.skin, SKINS.length),
      hair: clampIdx(a.hair, HAIR_STYLES.length),
      hairColor: clampIdx(a.hairColor, HAIR_COLORS.length),
      top: (await checkOwned(uid, a.top, 'top', false))!,
      bottom: (await checkOwned(uid, a.bottom, 'bottom', false))!,
      hat: await checkOwned(uid, a.hat, 'hat', true),
      acc: await checkOwned(uid, a.acc, 'acc', true),
    };
    await setAppearance(uid, clean);
    p.appearance = clean;
    if (p.zone) broadcastToZone(p.zone, 'player:appearance', { id: uid, appearance: clean });
    await pushMe(uid);
  });
}

function clampIdx(v: unknown, n: number) {
  const i = Math.floor(Number(v));
  if (!Number.isInteger(i) || i < 0 || i >= n) throw new GameError('Dữ liệu không hợp lệ');
  return i;
}

async function checkOwned(uid: number, id: unknown, slot: Slot, optional: boolean): Promise<string | null> {
  if (id == null || id === '') {
    if (optional) return null;
    throw new GameError('Thiếu trang phục');
  }
  const item = ITEMS[String(id)];
  if (!item || item.kind !== 'clothing' || item.slot !== slot) throw new GameError('Trang phục không hợp lệ');
  if ((await itemQty(uid, item.id)) < 1) throw new GameError(`Bạn chưa sở hữu ${item.name}`);
  return item.id;
}
