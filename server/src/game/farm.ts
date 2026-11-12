import type { Socket } from 'socket.io';
import { ANIMALS, CROPS, ITEMS, MAX_ANIMALS, MAX_PLOTS, plotPrice, stealFloor } from '../../../shared/catalog';
import {
  addCoins, addItem, addXp, emptyPlot, Farm, GameError, getFarm, getProfile, Plot, removeItem, saveFarm, tx,
} from '../db';
import { getIo, handle, OnlinePlayer, pushMe, toast } from './online';

export const DOG_PRICE = 800;
export const DOG_LEVEL = 2;
const DOG_CATCH_CHANCE = 0.5;
const DOG_FINE = 30;

export function farmPayload(farm: Farm) {
  return {
    now: Date.now(),
    plots: farm.plots.map((pl) => ({
      crop: pl.crop,
      plantedAt: pl.plantedAt,
      bonus: pl.bonus,
      growMs: pl.crop ? CROPS[pl.crop].growSec * 1000 : 0,
      waterStage: pl.waterStage,
      yieldLeft: pl.yieldLeft,
      stolenBy: pl.stolenBy,
    })),
    dog: !!farm.dog,
    animals: farm.animals.map((a) => ({
      type: a.type,
      fedAt: a.fedAt,
      produceMs: ANIMALS[a.type].produceSec * 1000,
      left: a.left ?? ANIMALS[a.type].qty,
      stolenBy: a.stolenBy ?? [],
    })),
  };
}

function progress(pl: Plot, now = Date.now()) {
  if (!pl.crop) return 0;
  const grow = CROPS[pl.crop].growSec * 1000;
  return Math.min(1, (now - pl.plantedAt + pl.bonus) / grow);
}
function stage(pl: Plot) {
  const pr = progress(pl);
  return pr >= 1 ? 3 : Math.floor(pr * 3);
}

function broadcastFarm(ownerId: number, farm: Farm) {
  getIo().to(`z:farm:${ownerId}`).emit('farm:update', { ownerId, farm: farmPayload(farm) });
}

/** Đọc-sửa-ghi nông trại trong 1 transaction (khoá dòng), rồi phát cập nhật cho mọi người trong vườn. */
async function withFarm<T>(ownerId: number, fn: (farm: Farm) => Promise<T> | T): Promise<T> {
  const r = await tx(async () => {
    const farm = await getFarm(ownerId);
    const res = await fn(farm);
    await saveFarm(ownerId, farm);
    return { res, farm };
  });
  broadcastFarm(ownerId, r.farm);
  return r.res;
}

function getPlot(farm: Farm, idx: number) {
  const pl = farm.plots[Number(idx)];
  if (!pl) throw new GameError('Ô đất không tồn tại');
  return pl;
}

function levelUpNotice(userId: number, r: { level: number; leveledUp: boolean }) {
  if (r.leveledUp) toast(userId, `🎉 Chúc mừng! Bạn đã lên cấp ${r.level}`, 'success');
}

async function requireLevel(uid: number, level: number) {
  if ((await getProfile(uid)).level < level) throw new GameError(`Cần cấp ${level}`);
}

export function registerFarm(socket: Socket, p: OnlinePlayer) {
  const uid = p.userId;

  handle<{ plot: number; crop: string }>(socket, 'farm:plant', async ({ plot, crop }) => {
    const c = CROPS[crop];
    if (!c) throw new GameError('Hạt giống không hợp lệ');
    await requireLevel(uid, c.level);
    await withFarm(uid, async (farm) => {
      const pl = getPlot(farm, plot);
      if (pl.crop) throw new GameError('Ô đất đã có cây');
      await removeItem(uid, `seed:${crop}`, 1);
      Object.assign(pl, emptyPlot(), { crop, plantedAt: Date.now(), yieldLeft: c.yield });
    });
    await pushMe(uid);
  });

  handle<{ owner: number; plot: number }>(socket, 'farm:water', async ({ owner, plot }) => {
    const ownerId = Number(owner);
    await withFarm(ownerId, (farm) => {
      const pl = getPlot(farm, plot);
      if (!pl.crop) throw new GameError('Ô đất trống');
      const st = stage(pl);
      if (st >= 3) throw new GameError('Cây đã chín rồi');
      if (pl.waterStage === st) throw new GameError('Cây không cần tưới lúc này');
      pl.waterStage = st;
      pl.bonus += CROPS[pl.crop].growSec * 1000 * 0.15;
    });
    const r = await addXp(uid, ownerId === uid ? 1 : 2);
    if (ownerId !== uid) {
      await addCoins(uid, 5);
      toast(ownerId, `💧 ${p.name} đã tưới cây giúp bạn`, 'info');
    }
    levelUpNotice(uid, r);
    await pushMe(uid);
  });

  handle<{ plot: number }>(socket, 'farm:harvest', async ({ plot }) => {
    const gained = await withFarm(uid, async (farm) => {
      const pl = getPlot(farm, plot);
      if (!pl.crop) throw new GameError('Ô đất trống');
      if (progress(pl) < 1) throw new GameError('Cây chưa chín');
      const c = CROPS[pl.crop];
      const g = { item: `crop:${c.id}`, qty: pl.yieldLeft, xp: c.xp };
      await addItem(uid, g.item, g.qty);
      Object.assign(pl, emptyPlot());
      return g;
    });
    levelUpNotice(uid, await addXp(uid, gained.xp));
    await pushMe(uid);
    return gained;
  });

  handle<{ owner: number; plot: number }>(socket, 'farm:steal', async ({ owner, plot }) => {
    const ownerId = Number(owner);
    if (ownerId === uid) throw new GameError('Đây là nông trại của bạn');
    const out = await withFarm(ownerId, async (farm) => {
      const pl = getPlot(farm, plot);
      if (!pl.crop || progress(pl) < 1) throw new GameError('Chưa có gì để hái');
      const c = CROPS[pl.crop];
      if (pl.stolenBy.includes(uid)) throw new GameError('Bạn đã hái ô này rồi');
      if (pl.yieldLeft <= stealFloor(c.yield)) throw new GameError('Chủ vườn đã đề phòng, không hái được nữa');
      pl.stolenBy.push(uid); // bị bắt hay không thì ô này cũng không thử lại được
      if (farm.dog && Math.random() < DOG_CATCH_CHANCE) {
        // Chó đuổi: phạt kẻ trộm, tiền phạt về chủ vườn (cùng transaction)
        const fine = Math.min(DOG_FINE, (await getProfile(uid)).coins);
        if (fine > 0) { await addCoins(uid, -fine); await addCoins(ownerId, fine); }
        return { caught: true as const, fine, item: '' };
      }
      pl.yieldLeft -= 1;
      const item = `crop:${c.id}`;
      await addItem(uid, item, 1);
      return { caught: false as const, fine: 0, item };
    });
    if (out.caught) {
      getIo().to(`z:farm:${ownerId}`).emit('farm:dogchase', { thiefId: uid, plot: Number(plot) });
      toast(ownerId, `🐕 Chó nhà bạn vừa đuổi ${p.name} khi đang hái trộm! +${out.fine} xu tiền phạt`, 'success');
      await Promise.all([pushMe(uid), pushMe(ownerId)]);
      return { caught: true, fine: out.fine };
    }
    toast(ownerId, `😈 ${p.name} vừa hái trộm ${ITEMS[out.item].name} trong vườn bạn!`, 'error');
    levelUpNotice(uid, await addXp(uid, 1));
    await pushMe(uid);
    return { item: out.item };
  });

  // Trộm sản phẩm vật nuôi (trứng, sữa, len) ở nông trại người khác
  handle<{ owner: number; idx: number }>(socket, 'farm:stealAnimal', async ({ owner, idx }) => {
    const ownerId = Number(owner);
    if (ownerId === uid) throw new GameError('Đây là nông trại của bạn');
    const out = await withFarm(ownerId, async (farm) => {
      const an = farm.animals[Number(idx)];
      if (!an) throw new GameError('Không tìm thấy vật nuôi');
      const def = ANIMALS[an.type];
      if (an.fedAt == null || Date.now() < an.fedAt + def.produceSec * 1000) throw new GameError('Chưa có gì để lấy');
      const left = an.left ?? def.qty;
      const stolenBy = an.stolenBy ?? [];
      if (stolenBy.includes(uid)) throw new GameError('Bạn đã lấy lứa này rồi');
      if (left <= stealFloor(def.qty)) throw new GameError('Chủ chuồng đã đề phòng, không lấy được nữa');
      an.stolenBy = [...stolenBy, uid];
      if (farm.dog && Math.random() < DOG_CATCH_CHANCE) {
        const fine = Math.min(DOG_FINE, (await getProfile(uid)).coins);
        if (fine > 0) { await addCoins(uid, -fine); await addCoins(ownerId, fine); }
        return { caught: true as const, fine, item: '' };
      }
      an.left = left - 1;
      await addItem(uid, def.product, 1);
      return { caught: false as const, fine: 0, item: def.product };
    });
    if (out.caught) {
      getIo().to(`z:farm:${ownerId}`).emit('farm:dogchase', { thiefId: uid, animal: Number(idx) });
      toast(ownerId, `🐕 Chó nhà bạn vừa đuổi ${p.name} khi đang trộm ở chuồng! +${out.fine} xu tiền phạt`, 'success');
      await Promise.all([pushMe(uid), pushMe(ownerId)]);
      return { caught: true, fine: out.fine };
    }
    toast(ownerId, `😈 ${p.name} vừa lấy trộm ${ITEMS[out.item].name} trong chuồng nhà bạn!`, 'error');
    levelUpNotice(uid, await addXp(uid, 1));
    await pushMe(uid);
    return { item: out.item };
  });

  handle(socket, 'farm:buyDog', async () => {
    await requireLevel(uid, DOG_LEVEL);
    await withFarm(uid, async (farm) => {
      if (farm.dog) throw new GameError('Bạn đã có chó giữ nhà rồi');
      await addCoins(uid, -DOG_PRICE);
      farm.dog = true;
    });
    await pushMe(uid);
  });

  handle(socket, 'farm:buyPlot', async () => {
    await withFarm(uid, async (farm) => {
      if (farm.plots.length >= MAX_PLOTS) throw new GameError('Đã mở hết ô đất');
      await addCoins(uid, -plotPrice(farm.plots.length));
      farm.plots.push(emptyPlot());
    });
    await pushMe(uid);
  });

  handle<{ type: string }>(socket, 'farm:buyAnimal', async ({ type }) => {
    const a = ANIMALS[type];
    if (!a) throw new GameError('Vật nuôi không hợp lệ');
    await requireLevel(uid, a.level);
    await withFarm(uid, async (farm) => {
      if (farm.animals.length >= MAX_ANIMALS) throw new GameError('Chuồng đã đầy');
      await addCoins(uid, -a.price);
      farm.animals.push({ type, fedAt: null });
    });
    await pushMe(uid);
  });

  handle<{ idx: number }>(socket, 'farm:feed', async ({ idx }) => {
    await withFarm(uid, async (farm) => {
      const an = farm.animals[Number(idx)];
      if (!an) throw new GameError('Không tìm thấy vật nuôi');
      if (an.fedAt != null) throw new GameError('Vật nuôi đã no');
      await removeItem(uid, 'feed', ANIMALS[an.type].feed);
      an.fedAt = Date.now();
      an.left = ANIMALS[an.type].qty; // lứa mới: đủ số, chưa ai trộm
      an.stolenBy = [];
    });
    await pushMe(uid);
  });

  handle<{ idx: number }>(socket, 'farm:collect', async ({ idx }) => {
    const res = await withFarm(uid, async (farm) => {
      const an = farm.animals[Number(idx)];
      if (!an) throw new GameError('Không tìm thấy vật nuôi');
      const def = ANIMALS[an.type];
      if (an.fedAt == null || Date.now() < an.fedAt + def.produceSec * 1000) throw new GameError('Chưa có sản phẩm');
      const qty = an.left ?? def.qty; // phần còn lại sau khi bị trộm
      await addItem(uid, def.product, qty);
      an.fedAt = null;
      an.left = undefined;
      an.stolenBy = [];
      return { item: def.product, qty, xp: def.xp };
    });
    levelUpNotice(uid, await addXp(uid, res.xp));
    await pushMe(uid);
    return { item: res.item, qty: res.qty };
  });
}
