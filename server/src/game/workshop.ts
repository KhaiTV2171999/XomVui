import type { Socket } from 'socket.io';
import { ITEMS } from '../../../shared/catalog';
import { MACHINE } from '../../../shared/workshop';
import { addCoins, addItem, addXp, GameError, getProfile, itemQty, removeItem } from '../db';
import { withFarm } from './farm';
import { handle, OnlinePlayer, pushMe, toast } from './online';

/** Máy chế biến ở Sân xưởng: mua máy, bỏ nguyên liệu, chờ rồi lấy hàng. */
export function registerWorkshop(socket: Socket, p: OnlinePlayer) {
  const uid = p.userId;
  const def = (id: unknown) => {
    const m = MACHINE[String(id)];
    if (!m) throw new GameError('Máy không tồn tại');
    return m;
  };

  handle<{ id: string }>(socket, 'machine:buy', async ({ id }) => {
    const m = def(id);
    if ((await getProfile(uid)).level < m.level) throw new GameError(`Cần cấp ${m.level}`);
    await withFarm(uid, async (farm) => {
      if (!farm.areas?.includes('yard')) throw new GameError('Cần mở Sân xưởng trước (🗺️ Mở rộng)');
      if (farm.machines?.[m.id]) throw new GameError('Bạn đã có máy này');
      const [wood, stone] = await Promise.all([itemQty(uid, 'mat:wood'), itemQty(uid, 'mat:stone')]);
      if (wood < m.cost.wood || stone < m.cost.stone) throw new GameError(`Cần ${m.cost.wood} 🌲 gỗ và ${m.cost.stone} ⛰️ đá (đang có ${wood} gỗ, ${stone} đá)`);
      await addCoins(uid, -m.cost.coins);
      if (m.cost.wood) await removeItem(uid, 'mat:wood', m.cost.wood);
      if (m.cost.stone) await removeItem(uid, 'mat:stone', m.cost.stone);
      farm.machines = { ...(farm.machines ?? {}), [m.id]: { job: null } };
    });
    await pushMe(uid);
  });

  handle<{ id: string }>(socket, 'machine:start', async ({ id }) => {
    const m = def(id);
    await withFarm(uid, async (farm) => {
      const st = farm.machines?.[m.id];
      if (!st) throw new GameError('Bạn chưa có máy này');
      if (st.job) throw new GameError('Máy đang chạy');
      for (const [it, n] of Object.entries(m.inputs)) {
        const have = await itemQty(uid, it);
        if (have < n) throw new GameError(`Thiếu ${n - have} ${ITEMS[it]?.name ?? it}`);
      }
      for (const [it, n] of Object.entries(m.inputs)) await removeItem(uid, it, n);
      const now = Date.now();
      st.job = { at: now, done: now + m.sec * 1000 };
    });
    await pushMe(uid);
  });

  handle<{ id: string }>(socket, 'machine:collect', async ({ id }) => {
    const m = def(id);
    await withFarm(uid, async (farm) => {
      const st = farm.machines?.[m.id];
      if (!st?.job) throw new GameError('Máy chưa chạy');
      if (Date.now() < st.job.done) throw new GameError('Chưa xong');
      st.job = null;
      await addItem(uid, m.output, 1);
    });
    const lv = await addXp(uid, m.xp);
    if (lv.leveledUp) toast(uid, `🎉 Chúc mừng! Bạn đã lên cấp ${lv.level}`, 'success');
    await pushMe(uid);
    return { item: m.output };
  });
}
