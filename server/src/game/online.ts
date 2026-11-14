import type { Server, Socket } from 'socket.io';
import { Appearance, xpToNext } from '../../../shared/catalog';
import { getInventory, getProfile, GameError } from '../db';

export interface OnlinePlayer {
  userId: number;
  name: string;
  level: number;
  appearance: Appearance;
  socket: Socket;
  zone: string | null;
  x: number;
  y: number;
  lastChat: number;
}

export const online = new Map<number, OnlinePlayer>();

let io: Server;
export function setIo(server: Server) { io = server; }
export function getIo() { return io; }

/** Ai đang lao động công ích tới khi nào (ms). Nạp lúc đăng nhập, ghi khi bị bắt. */
export const jailUntil = new Map<number, number>();
/** Số ms lao động công ích còn lại (0 = tự do). */
export function jailLeft(userId: number) {
  const t = jailUntil.get(userId);
  if (!t) return 0;
  const left = t - Date.now();
  if (left <= 0) { jailUntil.delete(userId); return 0; }
  return left;
}

export function publicPlayer(p: OnlinePlayer) {
  return { id: p.userId, name: p.name, level: p.level, appearance: p.appearance, x: p.x, y: p.y, jailed: jailLeft(p.userId) > 0 };
}

/** Gửi lại toàn bộ thông tin cá nhân (xu, cấp, túi đồ...) cho người chơi. */
/**
 * Gửi lại thông tin cá nhân — gom các lần gọi sát nhau (bấm nhanh liên tục) thành 1 lần gửi sau ~60ms.
 */
const mePending = new Map<number, Promise<void>>();
export function pushMe(userId: number): Promise<void> {
  const cur = mePending.get(userId);
  if (cur) return cur;
  const pr = new Promise<void>((res) => setTimeout(() => {
    mePending.delete(userId);
    pushMeNow(userId).catch((e) => console.error('[pushMe]', e)).finally(res);
  }, 60));
  mePending.set(userId, pr);
  return pr;
}

async function pushMeNow(userId: number) {
  const p = online.get(userId);
  if (!p) return;
  const [prof, inventory] = await Promise.all([getProfile(userId), getInventory(userId)]);
  p.level = prof.level;
  p.socket.emit('me', {
    id: userId,
    name: prof.name,
    coins: prof.coins,
    xp: prof.xp,
    level: prof.level,
    xpNext: xpToNext(prof.level),
    appearance: prof.appearance,
    created: prof.created,
    inventory,
    jailUntil: jailLeft(userId) > 0 ? jailUntil.get(userId) : null,
    offenses: prof.offenses,
  });
}

export function toast(userId: number, msg: string, kind: 'info' | 'success' | 'error' = 'info') {
  online.get(userId)?.socket.emit('toast', { msg, kind });
}

export type Ack = (res: { ok: boolean; error?: string; [k: string]: unknown }) => void;

/** Bọc handler socket (đồng bộ hoặc async): bắt lỗi và trả về qua ack. */
export function handle<T>(socket: Socket, event: string, fn: (data: T) => unknown) {
  socket.on(event, async (data: T, ack?: Ack) => {
    try {
      const result = await fn(data ?? ({} as T));
      if (typeof ack === 'function') ack({ ok: true, ...(result && typeof result === 'object' ? result : {}) });
    } catch (e) {
      const msg = e instanceof GameError ? e.message : 'Có lỗi xảy ra';
      if (!(e instanceof GameError)) console.error(`[${event}]`, e);
      if (typeof ack === 'function') ack({ ok: false, error: msg });
      else socket.emit('toast', { msg, kind: 'error' });
    }
  });
}

export function vnDay() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
