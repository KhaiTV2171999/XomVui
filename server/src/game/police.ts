import { ECON } from '../../../shared/catalog';
import { cancelSteal, jobsAt } from './steal';
import { addCoins, addOffense, getProfile, takeCoinsUpTo, tx } from '../db';
import { announce } from './community';
import { getIo, jailUntil, online, OnlinePlayer, pushMe, toast } from './online';
import { joinZone } from './world';

/*
 * Cảnh sát tuần tra: đi ngẫu nhiên tới các nông trại đang có người (nhà có khách ghé được ưu tiên).
 * Không ai biết trước cảnh sát sẽ tới nhà nào — chỉ thấy khi cảnh sát đã ập tới.
 *  - Đang có cảnh sát mà hái trộm → bị bắt ngay.
 *  - Cảnh sát ập tới: ai đã trộm ở nhà này trong policeLookbackSec giây trước mà vẫn còn ở đây → bị bắt.
 * Bị bắt: bồi thường cho chủ nhà số nông sản đã trộm, nộp phạt theo số lần vi phạm,
 * lao động công ích ở Công viên (không về nhà / không vào khu giải trí được), lên Bảng tin.
 */

interface Theft { ownerId: number; value: number; text: string; at: number }
/** Các vụ trộm chưa bị xử lý của mỗi người (trong bộ nhớ). */
const thefts = new Map<number, Theft[]>();

let patrol: { ownerId: number; until: number } | null = null;
let lastOwner: number | null = null;

const farmRoom = (ownerId: number) => `z:farm:${ownerId}`;

/** Ghi lại vụ trộm (giá trị xu để bồi thường nếu bị bắt). */
export function recordTheft(thiefId: number, ownerId: number, value: number, text: string) {
  const list = thefts.get(thiefId) ?? [];
  list.push({ ownerId, text, value, at: Date.now() });
  // chỉ giữ các vụ trong 6 giờ gần nhất
  const cutoff = Date.now() - 6 * 3600_000;
  thefts.set(thiefId, list.filter((t) => t.at > cutoff));
}

/** Cảnh sát có đang ở nông trại này không. */
export function policeAt(ownerId: number) {
  return patrol != null && patrol.ownerId === ownerId && Date.now() < patrol.until;
}

/** Thông tin gửi kèm khi vào một nông trại (để vẽ cảnh sát nếu đang có mặt). */
export function policeInfo(ownerId: number) {
  return policeAt(ownerId) ? { until: patrol!.until } : null;
}

export function startPolice() {
  setTimeout(nextStop, 20_000);
}

function nextStop() {
  try {
    const target = pickFarm();
    if (target == null) { setTimeout(nextStop, 15_000); return; }
    const stay = Math.max(5, ECON.policeStaySec) * 1000 * (0.7 + Math.random() * 0.6);
    patrol = { ownerId: target, until: Date.now() + stay };
    lastOwner = target;
    getIo().to(farmRoom(target)).emit('police:arrive', { until: patrol.until });
    // Ập tới bất ngờ: bắt kẻ vừa trộm ở đây mà còn nán lại
    const since = Date.now() - ECON.policeLookbackSec * 1000;
    for (const p of online.values()) {
      if (p.zone !== `farm:${target}` || p.userId === target) continue;
      const stealing = jobsAt(target).some((j) => j.thief.userId === p.userId);
      if (stealing || (thefts.get(p.userId) ?? []).some((t) => t.ownerId === target && t.at >= since)) {
        arrest(p, target).catch((e) => console.error('[police]', e));
      }
    }
    setTimeout(() => {
      if (patrol?.ownerId === target) getIo().to(farmRoom(target)).emit('police:leave', {});
      patrol = null;
      const gap = Math.max(5, ECON.policeGapSec) * 1000 * (0.5 + Math.random());
      setTimeout(nextStop, gap);
    }, stay);
  } catch (e) {
    console.error('[police]', e);
    setTimeout(nextStop, 30_000);
  }
}

/** Chọn ngẫu nhiên một nông trại đang có người; nhà có khách (kẻ trộm tiềm năng) được ưu tiên. */
function pickFarm(): number | null {
  const weight = new Map<number, number>();
  for (const p of online.values()) {
    if (!p.zone?.startsWith('farm:')) continue;
    const owner = Number(p.zone.slice(5));
    weight.set(owner, (weight.get(owner) ?? 1) + (p.userId === owner ? 0 : 3));
  }
  if (weight.size > 1 && lastOwner != null) weight.delete(lastOwner); // ít khi quay lại ngay nhà vừa đi
  const total = [...weight.values()].reduce((a, b) => a + b, 0);
  if (!total) return null;
  let r = Math.random() * total;
  for (const [owner, w] of weight) { r -= w; if (r <= 0) return owner; }
  return [...weight.keys()][0];
}

const arresting = new Set<number>();

/** Bắt kẻ trộm tại nông trại ownerId. */
export async function arrest(thief: OnlinePlayer, ownerId: number) {
  const uid = thief.userId;
  if (arresting.has(uid)) return;
  arresting.add(uid);
  cancelSteal(uid, 'police');
  try {
    const all = thefts.get(uid) ?? [];
    const here = all.filter((t) => t.ownerId === ownerId);
    thefts.set(uid, all.filter((t) => t.ownerId !== ownerId));
    const owed = here.reduce((s, t) => s + t.value, 0);

    const res = await tx(async () => {
      const prof = await getProfile(uid);
      const n = prof.offenses + 1;
      const minutes = Math.min(Math.max(1, ECON.jailMaxMin), Math.max(1, ECON.jailMinPerOffense) * n);
      const until = Date.now() + minutes * 60_000;
      await addOffense(uid, until);
      const repaid = owed > 0 ? await takeCoinsUpTo(uid, owed) : 0;
      if (repaid > 0) await addCoins(ownerId, repaid);
      const fine = await takeCoinsUpTo(uid, ECON.fineBase * n);
      return { n, minutes, until, repaid, fine };
    });
    jailUntil.set(uid, res.until);
    const ownerName = (await getProfile(ownerId)).name;

    getIo().to(farmRoom(ownerId)).emit('police:arrest', { thiefId: uid });
    toast(uid, `🚨 Bị cảnh sát bắt! Bồi thường ${res.repaid} xu, phạt ${res.fine} xu, lao động công ích ${res.minutes} phút ở Công viên`, 'error');
    toast(ownerId, `👮 Cảnh sát vừa bắt ${thief.name} trộm trong vườn bạn! Bạn được bồi thường ${res.repaid} xu`, 'success');
    await Promise.all([pushMe(uid), pushMe(ownerId)]);
    await announce('police',
      `🚨 Cảnh sát bắt quả tang ${thief.name} trộm ở nông trại của ${ownerName}! `
      + `Bồi thường ${res.repaid} xu · phạt ${res.fine} xu (vi phạm lần ${res.n}) · lao động công ích ${res.minutes} phút ở Công viên.`, uid);

    // Áp giải ra Công viên sau một chút để mọi người kịp thấy cảnh bị bắt
    setTimeout(() => {
      const p = online.get(uid);
      if (p) joinZone(p, 'park', 'login').catch((e) => console.error('[police]', e));
    }, 1800);
    setTimeout(() => {
      if ((jailUntil.get(uid) ?? 0) <= Date.now()) {
        jailUntil.delete(uid);
        toast(uid, '✅ Bạn đã hoàn thành lao động công ích — giờ có thể về nhà rồi!', 'success');
        pushMe(uid).catch(() => {});
        const p = online.get(uid);
        if (p?.zone === 'park') getIo().to('z:park').emit('player:jail', { id: uid, jailed: false });
      }
    }, res.minutes * 60_000 + 500);
  } finally {
    arresting.delete(uid);
  }
}
