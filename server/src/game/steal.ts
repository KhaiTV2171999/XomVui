import type { Socket } from 'socket.io';
import { animalProduceSec, animalQty, ANIMALS, CROPS, ECON, ITEMS, MAX_ANIMALS } from '../../../shared/catalog';
import { addCoins, addItem, addXp, emptyPlot, GameError, getFarm, getProfile } from '../db';
import { plotReady, withFarm } from './farm';
import { getIo, handle, online, OnlinePlayer, pushMe, toast } from './online';
import { arrest, policeAt, recordTheft } from './police';

/*
 * Trộm kiểu "lượm": trộm SẠCH cả ô / cả lứa sản phẩm / bắt luôn con vật,
 * nhưng phải đứng lượm một lúc (thanh tiến trình). Trong lúc lượm:
 *  - chủ vườn được báo ngay, về kịp thì bấm "Đuổi" là kẻ trộm bỏ chạy tay trắng;
 *  - chó giữ nhà có thể xông ra (phạt tiền);
 *  - cảnh sát ập tới là bị bắt;
 *  - kẻ trộm đi chỗ khác / rời vườn là mất lượt.
 * Thời gian: steal_sec_base + steal_sec_per_item × số lượng; bắt vật nuôi: steal_animal_sec + giá/100.
 */

export type StealKind = 'plot' | 'produce' | 'animal';

interface Job {
  thief: OnlinePlayer;
  ownerId: number;
  kind: StealKind;
  idx: number;
  /** Loại vật nuôi lúc bắt đầu (để chắc vẫn đúng con khi xong) */
  animalType?: string;
  endsAt: number;
  timer: ReturnType<typeof setTimeout>;
  dogTimer?: ReturnType<typeof setTimeout>;
}

const jobs = new Map<number, Job>(); // theo id kẻ trộm
const locks = new Map<string, number>(); // mục tiêu → id kẻ trộm đang lượm
const lockKey = (ownerId: number, kind: StealKind, idx: number) => `${ownerId}:${kind === 'plot' ? 'p' : 'a'}:${idx}`;
const room = (ownerId: number) => `z:farm:${ownerId}`;

/** Các vụ đang lượm ở một nông trại (cảnh sát ập tới thì bắt hết). */
export function jobsAt(ownerId: number) {
  return [...jobs.values()].filter((j) => j.ownerId === ownerId);
}

/** Huỷ vụ đang lượm (bỏ chạy, bị đuổi, bị bắt...). */
export function cancelSteal(uid: number, reason: 'cancel' | 'left' | 'moved' | 'chased' | 'dog' | 'police' | 'gone') {
  const j = jobs.get(uid);
  if (!j) return null;
  clearTimeout(j.timer);
  if (j.dogTimer) clearTimeout(j.dogTimer);
  jobs.delete(uid);
  locks.delete(lockKey(j.ownerId, j.kind, j.idx));
  getIo().to(room(j.ownerId)).emit('steal:end', { thiefId: uid, ok: false, reason, kind: j.kind, idx: j.idx });
  return j;
}

function label(kind: StealKind, name: string) {
  return kind === 'plot' ? `ô ${name}` : kind === 'produce' ? `${name} trong chuồng` : `con ${name}`;
}

export function registerSteal(socket: Socket, p: OnlinePlayer) {
  const uid = p.userId;

  handle<{ owner: number; kind: StealKind; idx: number }>(socket, 'steal:start', async ({ owner, kind, idx }) => {
    const ownerId = Number(owner);
    const i = Number(idx);
    if (!['plot', 'produce', 'animal'].includes(kind)) throw new GameError('Không hợp lệ');
    if (ownerId === uid) throw new GameError('Đây là nông trại của bạn');
    if (p.zone !== `farm:${ownerId}`) throw new GameError('Bạn không ở nông trại này');
    if (jobs.has(uid)) throw new GameError('Bạn đang lượm dở rồi');
    const key = lockKey(ownerId, kind, i);
    if (locks.has(key)) throw new GameError('Có người khác đang trộm chỗ này');

    // Kiểm tra mục tiêu (chỉ đọc) + tính thời gian lượm
    const farm = await getFarm(ownerId);
    let qty = 0, name = '', animalType: string | undefined;
    if (kind === 'plot') {
      const pl = farm.plots[i];
      if (!pl || !pl.crop || !plotReady(pl) || pl.yieldLeft <= 0) throw new GameError('Chưa có gì để hái');
      qty = pl.yieldLeft; name = CROPS[pl.crop].name;
    } else {
      const an = farm.animals[i];
      if (!an) throw new GameError('Không tìm thấy vật nuôi');
      const def = ANIMALS[an.type];
      animalType = an.type;
      if (kind === 'produce') {
        const left = an.left ?? animalQty(an.type, an.lvl);
        if (an.fedAt == null || Date.now() < an.fedAt + animalProduceSec(an.type, an.lvl) * 1000 || left <= 0) throw new GameError('Chưa có gì để lấy');
        qty = left; name = def.productName;
      } else {
        const mine = await getFarm(uid);
        if (mine.animals.length >= MAX_ANIMALS) throw new GameError('Chuồng nhà bạn đã đầy, không có chỗ nhốt thêm');
        qty = 1; name = def.name;
      }
    }

    // Đang có cảnh sát mà còn dám trộm → bắt ngay
    if (policeAt(ownerId)) { await arrest(p, ownerId); return { police: true }; }

    const sec = kind === 'animal'
      ? ECON.stealAnimalSec + ANIMALS[animalType!].price / 100
      : ECON.stealSecBase + ECON.stealSecPerItem * qty;
    const ms = Math.round(Math.max(1, sec) * 1000);
    const endsAt = Date.now() + ms;
    const job: Job = { thief: p, ownerId, kind, idx: i, animalType, endsAt, timer: setTimeout(() => finish(job).catch((e) => console.error('[steal]', e)), ms) };
    // Chó giữ nhà: có thể xông ra giữa chừng
    if (farm.dog && Math.random() < ECON.dogCatchChance) {
      job.dogTimer = setTimeout(() => dogCatch(job).catch((e) => console.error('[steal dog]', e)), ms * (0.3 + Math.random() * 0.5));
    }
    jobs.set(uid, job);
    locks.set(key, uid);
    getIo().to(room(ownerId)).emit('steal:begin', { thiefId: uid, kind, idx: i, endsAt, ms });
    toast(ownerId, `😈 ${p.name} đang trộm ${label(kind, name)} ở vườn bạn! Về đuổi ngay!`, 'error');
    return { endsAt, ms };
  });

  handle(socket, 'steal:cancel', () => { cancelSteal(uid, 'cancel'); });

  // Chủ vườn (đang ở trong vườn) đuổi kẻ trộm
  handle<{ thiefId: number }>(socket, 'steal:chase', ({ thiefId }) => {
    const j = jobs.get(Number(thiefId));
    if (!j || j.ownerId !== uid) throw new GameError('Không có ai đang trộm');
    if (p.zone !== `farm:${uid}`) throw new GameError('Về vườn mới đuổi được');
    cancelSteal(j.thief.userId, 'chased');
    toast(j.thief.userId, `🏃 ${p.name} về đuổi! Bạn bỏ chạy tay trắng`, 'error');
    return { ok: true };
  });
}

async function dogCatch(job: Job) {
  if (jobs.get(job.thief.userId) !== job) return;
  cancelSteal(job.thief.userId, 'dog');
  const uid = job.thief.userId;
  const fine = Math.min(ECON.dogFine, (await getProfile(uid)).coins);
  if (fine > 0) { await addCoins(uid, -fine); await addCoins(job.ownerId, fine); }
  getIo().to(room(job.ownerId)).emit('farm:dogchase', job.kind === 'plot' ? { thiefId: uid, plot: job.idx } : { thiefId: uid, animal: job.idx });
  toast(uid, `🐕 Bị chó đuổi! Mất ${fine} xu tiền phạt`, 'error');
  toast(job.ownerId, `🐕 Chó nhà bạn vừa đuổi ${job.thief.name}! +${fine} xu tiền phạt`, 'success');
  await Promise.all([pushMe(uid), pushMe(job.ownerId)]);
}

async function finish(job: Job) {
  const uid = job.thief.userId;
  if (jobs.get(uid) !== job) return;
  if (job.dogTimer) clearTimeout(job.dogTimer);
  jobs.delete(uid);
  locks.delete(lockKey(job.ownerId, job.kind, job.idx));
  const thief = online.get(uid);
  const end = (extra: object) => getIo().to(room(job.ownerId)).emit('steal:end', { thiefId: uid, kind: job.kind, idx: job.idx, ...extra });
  if (!thief || thief.zone !== `farm:${job.ownerId}`) { end({ ok: false, reason: 'gone' }); return; }
  if (policeAt(job.ownerId)) { end({ ok: false, reason: 'police' }); await arrest(thief, job.ownerId); return; }

  let got: { item: string; qty: number; value: number; text: string };
  try {
    got = await withFarm(job.ownerId, async (farm) => {
      if (job.kind === 'plot') {
        const pl = farm.plots[job.idx];
        if (!pl?.crop || !plotReady(pl) || pl.yieldLeft <= 0) throw new GameError('Chủ vườn đã thu hoạch mất rồi');
        const c = CROPS[pl.crop], qty = pl.yieldLeft;
        await addItem(uid, `crop:${c.id}`, qty);
        Object.assign(pl, emptyPlot()); // giữ nguyên cấp đất (lvl)
        return { item: `crop:${c.id}`, qty, value: c.sell * qty, text: `${qty} ${c.icon} ${c.name}` };
      }
      const an = farm.animals[job.idx];
      if (!an || an.type !== job.animalType) throw new GameError('Con vật không còn ở đó');
      const def = ANIMALS[an.type];
      if (job.kind === 'produce') {
        const qty = an.left ?? animalQty(an.type, an.lvl);
        if (an.fedAt == null || qty <= 0) throw new GameError('Chủ chuồng đã thu mất rồi');
        await addItem(uid, def.product, qty);
        an.fedAt = null; an.left = undefined; an.stolenBy = []; // lứa bị lấy sạch → phải cho ăn lại
        return { item: def.product, qty, value: def.productSell * qty, text: `${qty} ${def.productIcon} ${def.productName}` };
      }
      // Bắt luôn con vật: chuyển từ chuồng chủ sang chuồng kẻ trộm (cùng transaction)
      farm.animals.splice(job.idx, 1);
      await withFarm(uid, (mine) => {
        if (mine.animals.length >= MAX_ANIMALS) throw new GameError('Chuồng nhà bạn đã đầy');
        mine.animals.push({ type: an.type, fedAt: null, lvl: an.lvl });
      });
      return { item: '', qty: 1, value: def.price, text: `con ${def.icon} ${def.name}` };
    });
  } catch (e) {
    end({ ok: false, reason: 'gone', error: e instanceof GameError ? e.message : 'Có lỗi' });
    if (e instanceof GameError) toast(uid, e.message, 'error'); else console.error('[steal finish]', e);
    return;
  }
  recordTheft(uid, job.ownerId, got.value, got.text);
  end({ ok: true, item: got.item, qty: got.qty, text: got.text });
  toast(job.ownerId, `😭 ${thief.name} đã trộm sạch ${got.text} của bạn!`, 'error');
  const r = await addXp(uid, 1 + got.qty);
  if (r.leveledUp) toast(uid, `🎉 Chúc mừng! Bạn đã lên cấp ${r.level}`, 'success');
  await Promise.all([pushMe(uid), pushMe(job.ownerId)]);
}

/** Cho phép kiểm tra món theo id (dùng khi hiển thị). */
export const itemName = (id: string) => ITEMS[id]?.name ?? id;
