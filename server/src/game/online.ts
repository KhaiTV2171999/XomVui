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

export function publicPlayer(p: OnlinePlayer) {
  return { id: p.userId, name: p.name, level: p.level, appearance: p.appearance, x: p.x, y: p.y };
}

/** Gửi lại toàn bộ thông tin cá nhân (xu, cấp, túi đồ...) cho người chơi. */
export async function pushMe(userId: number) {
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
