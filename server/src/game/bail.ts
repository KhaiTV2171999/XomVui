import type { Socket } from 'socket.io';
import { ECON } from '../../../shared/catalog';
import { addCoins, clearJail, GameError, tx } from '../db';
import { announce } from './community';
import { getIo, handle, jailLeft, jailUntil, online, OnlinePlayer, pushMe, toast } from './online';

/** Giá bảo lãnh: bailPerMin × số phút còn lại, tối thiểu bailMin. */
export function bailPrice(msLeft: number) {
  return Math.max(ECON.bailMin, Math.ceil(msLeft / 60_000) * ECON.bailPerMin);
}

/** Lời xin bảo lãnh đang mở: userId → tên + lúc xin */
const requests = new Map<number, { name: string; at: number }>();
const lastAsk = new Map<number, number>();

function list() {
  const out: { id: number; name: string; until: number; price: number }[] = [];
  for (const [id, r] of requests) {
    const left = jailLeft(id);
    if (left <= 0) { requests.delete(id); continue; }
    out.push({ id, name: r.name, until: jailUntil.get(id)!, price: bailPrice(left) });
  }
  return out.sort((a, b) => a.until - b.until);
}
const pushList = () => getIo().emit('bail:list', list());

export function registerBail(socket: Socket, p: OnlinePlayer) {
  const uid = p.userId;

  handle(socket, 'bail:list', () => ({ list: list() }));

  // Người đang lao động công ích xin cộng đồng bảo lãnh
  handle(socket, 'bail:request', async () => {
    const left = jailLeft(uid);
    if (left <= 0) throw new GameError('Bạn đâu có đang lao động công ích');
    const since = Date.now() - (lastAsk.get(uid) ?? 0);
    if (since < ECON.bailCooldownMin * 60_000) throw new GameError(`Vừa xin rồi — chờ ${Math.ceil((ECON.bailCooldownMin * 60_000 - since) / 60_000)} phút nữa nhé`);
    lastAsk.set(uid, Date.now());
    requests.set(uid, { name: p.name, at: Date.now() });
    await announce('bail', `🙏 ${p.name} đang lao động công ích và xin cộng đồng bảo lãnh (${bailPrice(left).toLocaleString('vi')} xu). Mở Bảng tin để giúp đỡ!`, uid);
    pushList();
    return { price: bailPrice(left) };
  });

  // Nộp tiền bảo lãnh cho người khác: người đó được thả ngay
  handle<{ id: number }>(socket, 'bail:pay', async ({ id }) => {
    const target = Number(id);
    if (target === uid) throw new GameError('Không tự bảo lãnh cho mình được — nhờ bạn bè nhé');
    const left = jailLeft(target);
    if (left <= 0) throw new GameError('Người này đã được thả rồi');
    const price = bailPrice(left);
    await tx(async () => {
      await addCoins(uid, -price); // tiền nộp cho hệ thống
      await clearJail(target);
    });
    jailUntil.delete(target);
    const name = requests.get(target)?.name ?? online.get(target)?.name ?? 'cư dân';
    requests.delete(target);
    const tp = online.get(target);
    if (tp?.zone) getIo().to(`z:${tp.zone}`).emit('player:jail', { id: target, jailed: false });
    toast(target, `🎉 ${p.name} đã nộp ${price.toLocaleString('vi')} xu bảo lãnh cho bạn — bạn được tự do!`, 'success');
    await Promise.all([pushMe(uid), pushMe(target)]);
    await announce('bail', `🤝 ${p.name} đã nộp ${price.toLocaleString('vi')} xu bảo lãnh cho ${name}. Thật là hàng xóm tốt!`, target);
    pushList();
    return { price };
  });
}
