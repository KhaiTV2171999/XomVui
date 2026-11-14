import type { Socket } from 'socket.io';
import { ANIMAL_MAX_LVL, animalProduceSec, animalQty, animalUpgradeCost, ANIMALS, CROPS, ECON, ITEMS, MAX_ANIMALS, MAX_PLOTS, plotPrice, plotYield, stealFloor } from '../../../shared/catalog';
import { AreaId, areaCost, FARM_AREAS, maxPlots, OBSTACLES, obstacleActive } from '../../../shared/farmExpand';
import {
  addCoins, addItem, addXp, emptyPlot, Farm, GameError, getFarm, getProfile, itemQty, Plot, removeItem, saveFarm, tx,
} from '../db';
import { getIo, handle, OnlinePlayer, pushMe, toast } from './online';
import { questBump } from './quests';

export const DOG_PRICE = 800;
export const DOG_LEVEL = 2;
export const DOG_CATCH_CHANCE = 0.5;
export const DOG_FINE = 30;

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
      lvl: pl.lvl ?? 0,
    })),
    dog: !!farm.dog,
    areas: farm.areas ?? [],
    cleared: farm.cleared ?? {},
    machines: farm.machines ?? {},
    animals: farm.animals.map((a) => ({
      type: a.type,
      fedAt: a.fedAt,
      produceMs: animalProduceSec(a.type, a.lvl) * 1000,
      left: a.left ?? animalQty(a.type, a.lvl),
      lvl: a.lvl ?? 0,
      stolenBy: a.stolenBy ?? [],
    })),
  };
}

function progress(pl: Plot, now = Date.now()) {
  if (!pl.crop) return 0;
  const grow = CROPS[pl.crop].growSec * 1000;
  return Math.min(1, (now - pl.plantedAt + pl.bonus) / grow);
}
/** Cây đã chín, thu hoạch được */
export function plotReady(pl: Plot) {
  return progress(pl) >= 1;
}
function stage(pl: Plot) {
  const pr = progress(pl);
  return pr >= 1 ? 3 : Math.floor(pr * 3);
}

/** Phát nông trại cho mọi người trong vườn — gom các thay đổi sát nhau (bấm nhanh) thành 1 lần gửi sau ~80ms. */
const farmPending = new Map<number, Farm>();
function broadcastFarm(ownerId: number, farm: Farm) {
  const had = farmPending.has(ownerId);
  farmPending.set(ownerId, farm);
  if (had) return;
  setTimeout(() => {
    const f = farmPending.get(ownerId);
    farmPending.delete(ownerId);
    if (f) getIo().to(`z:farm:${ownerId}`).emit('farm:update', { ownerId, farm: farmPayload(f) });
  }, 80);
}

/** Đọc-sửa-ghi nông trại trong 1 transaction (khoá dòng), rồi phát cập nhật cho mọi người trong vườn. */
export async function withFarm<T>(ownerId: number, fn: (farm: Farm) => Promise<T> | T): Promise<T> {
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
    if (p.level < c.level) await requireLevel(uid, c.level); // cấp trong bộ nhớ đủ thì khỏi đọc DB
    await withFarm(uid, async (farm) => {
      const pl = getPlot(farm, plot);
      if (pl.crop) throw new GameError('Ô đất đã có cây');
      await removeItem(uid, `seed:${crop}`, 1);
      Object.assign(pl, emptyPlot(), { crop, plantedAt: Date.now(), yieldLeft: plotYield(c.yield, pl.lvl) });
    });
    questBump(uid, 'plant');
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
      questBump(uid, 'water');
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
    questBump(uid, 'harvest');
    await pushMe(uid);
    return gained;
  });

  // Hái trộm / bắt vật nuôi: xem steal.ts (trộm sạch nhưng phải mất thời gian lượm)

  handle(socket, 'farm:buyDog', async () => {
    await requireLevel(uid, DOG_LEVEL);
    await withFarm(uid, async (farm) => {
      if (farm.dog) throw new GameError('Bạn đã có chó giữ nhà rồi');
      await addCoins(uid, -DOG_PRICE);
      farm.dog = true;
    });
    await pushMe(uid);
  });

  // Nâng cấp ô đất thành "Đất màu mỡ": sản lượng mỗi vụ ×plotUpgradeMult
  handle<{ plot: number }>(socket, 'farm:upgradePlot', async ({ plot }) => {
    await requireLevel(uid, ECON.plotUpgradeLevel);
    const r = await withFarm(uid, async (farm) => {
      if (farm.plots.length < MAX_PLOTS) throw new GameError(`Cần mở hết ${MAX_PLOTS} ô đất mới nâng cấp được (đang có ${farm.plots.length})`);
      const pl = getPlot(farm, plot);
      if (pl.lvl) throw new GameError('Ô này đã là Đất màu mỡ rồi');
      await addCoins(uid, -ECON.plotUpgradePrice);
      pl.lvl = 1;
      // Cây đang trồng mà chưa ai hái: tăng sản lượng ngay vụ này
      let boosted = false;
      if (pl.crop && pl.stolenBy.length === 0 && pl.yieldLeft === CROPS[pl.crop].yield) {
        pl.yieldLeft = plotYield(CROPS[pl.crop].yield, 1);
        boosted = true;
      }
      return { boosted };
    });
    await pushMe(uid);
    return r;
  });

  handle(socket, 'farm:buyPlot', async () => {
    await withFarm(uid, async (farm) => {
      if (farm.plots.length >= maxPlots(farm.areas)) {
        throw new GameError(farm.areas?.includes('field2') ? 'Đã mở hết ô đất' : 'Đã mở hết ô đất — mở rộng Ruộng mới để có thêm 18 ô');
      }
      await addCoins(uid, -plotPrice(farm.plots.length));
      farm.plots.push(emptyPlot());
    });
    await pushMe(uid);
  });

  // Dọn chướng ngại (đá / gốc cây / bụi) trên nông trại của mình → nhận gỗ, đá
  handle<{ id: number }>(socket, 'farm:clear', async ({ id }) => {
    const o = OBSTACLES.find((x) => x.id === Number(id));
    if (!o) throw new GameError('Không có gì để dọn');
    const loot = await withFarm(uid, async (farm) => {
      if (!obstacleActive(o.id, farm.areas, farm.cleared)) throw new GameError('Chỗ này đã dọn rồi');
      farm.cleared = { ...(farm.cleared ?? {}), [o.id]: Date.now() };
      const items: Record<string, number> = {};
      const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
      if (o.kind === 'rock') items['mat:stone'] = rnd(2, 3);
      else if (o.kind === 'stump') items['mat:wood'] = rnd(2, 3);
      else {
        items['mat:wood'] = rnd(1, 2);
        if (Math.random() < 0.35) items['seed:carot'] = rnd(1, 2); // bụi rậm: thỉnh thoảng nhặt được hạt giống
      }
      for (const [it, n] of Object.entries(items)) await addItem(uid, it, n);
      return items;
    });
    levelUpNotice(uid, await addXp(uid, 2));
    await pushMe(uid);
    return { items: loot };
  });

  // Mở rộng: mở một khu đất mới (xu + gỗ + đá + cấp)
  handle<{ id: string }>(socket, 'farm:unlockArea', async ({ id }) => {
    const area = FARM_AREAS.find((a) => a.id === id);
    if (!area) throw new GameError('Khu đất không tồn tại');
    const cost = areaCost(area.id as AreaId);
    await requireLevel(uid, cost.level);
    await withFarm(uid, async (farm) => {
      if (farm.areas?.includes(area.id)) throw new GameError('Khu này đã mở rồi');
      const [wood, stone] = await Promise.all([itemQty(uid, 'mat:wood'), itemQty(uid, 'mat:stone')]);
      if (wood < cost.wood || stone < cost.stone) throw new GameError(`Cần ${cost.wood} 🌲 gỗ và ${cost.stone} ⛰️ đá (đang có ${wood} gỗ, ${stone} đá) — dọn chướng ngại để lấy thêm`);
      await addCoins(uid, -cost.coins);
      if (cost.wood) await removeItem(uid, 'mat:wood', cost.wood);
      if (cost.stone) await removeItem(uid, 'mat:stone', cost.stone);
      farm.areas = [...(farm.areas ?? []), area.id];
    });
    levelUpNotice(uid, await addXp(uid, 30));
    await pushMe(uid);
    return { area: area.id };
  });

  // Nâng cấp vật nuôi: mỗi cấp thêm sản phẩm / lứa và ra nhanh hơn
  handle<{ idx: number }>(socket, 'farm:upgradeAnimal', async ({ idx }) => {
    const r = await withFarm(uid, async (farm) => {
      const an = farm.animals[Number(idx)];
      if (!an) throw new GameError('Không tìm thấy vật nuôi');
      const lvl = an.lvl ?? 0;
      if (lvl >= ANIMAL_MAX_LVL) throw new GameError(`${ANIMALS[an.type].name} đã đạt cấp tối đa`);
      await addCoins(uid, -animalUpgradeCost(an.type, lvl));
      const fullBefore = an.left == null || (an.left === animalQty(an.type, lvl) && !(an.stolenBy?.length));
      an.lvl = lvl + 1;
      // Lứa đang nuôi mà chưa ai trộm: được thêm sản phẩm ngay
      if (an.fedAt != null && fullBefore) an.left = animalQty(an.type, an.lvl);
      return { lvl: an.lvl };
    });
    levelUpNotice(uid, await addXp(uid, 10));
    await pushMe(uid);
    return r;
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
      an.left = animalQty(an.type, an.lvl); // lứa mới: đủ số, chưa ai trộm
      an.stolenBy = [];
    });
    await pushMe(uid);
  });

  handle<{ idx: number }>(socket, 'farm:collect', async ({ idx }) => {
    const res = await withFarm(uid, async (farm) => {
      const an = farm.animals[Number(idx)];
      if (!an) throw new GameError('Không tìm thấy vật nuôi');
      const def = ANIMALS[an.type];
      if (an.fedAt == null || Date.now() < an.fedAt + animalProduceSec(an.type, an.lvl) * 1000) throw new GameError('Chưa có sản phẩm');
      const qty = an.left ?? animalQty(an.type, an.lvl); // phần còn lại sau khi bị trộm
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
