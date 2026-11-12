import type { Socket } from 'socket.io';
import { zoneDefOf, ZONES } from '../../../shared/zones';
import { GameError, getFarm, getProfile } from '../db';
import { farmPayload } from './farm';
import { getIo, handle, online, OnlinePlayer, publicPlayer } from './online';

const room = (zone: string) => `z:${zone}`;

export function leaveZone(p: OnlinePlayer) {
  if (!p.zone) return;
  p.socket.leave(room(p.zone));
  p.socket.to(room(p.zone)).emit('player:leave', { id: p.userId });
  p.zone = null;
}

export async function joinZone(p: OnlinePlayer, target: string, via: 'walk' | 'bus' | 'login' = 'bus') {
  let zone = target === 'myfarm' ? `farm:${p.userId}` : target;
  const def = zoneDefOf(zone);
  if (!def) throw new GameError('Khu vực không tồn tại');

  let ownerId: number | null = null;
  let ownerName: string | null = null;
  if (zone.startsWith('farm:')) {
    ownerId = Number(zone.slice(5));
    if (!Number.isInteger(ownerId)) throw new GameError('Nông trại không tồn tại');
    ownerName = (await getProfile(ownerId)).name; // ném lỗi nếu không tồn tại
  }
  const farm = ownerId != null ? farmPayload(await getFarm(ownerId)) : null;

  // Điểm xuất hiện: đi bộ qua cổng → spawn của cổng; đi xe buýt → trạm xe buýt.
  let spawn = def.spawn;
  let jitter = 30;
  if (via === 'walk' && p.zone) {
    const portal = zoneDefOf(p.zone)?.portals.find((pt) => pt.to === target);
    if (portal) spawn = portal.spawn;
  } else if (via === 'bus' && def.busStop) {
    spawn = { x: def.busStop.x, y: def.busStop.y };
    jitter = 0;
  }

  leaveZone(p);
  p.zone = zone;
  p.x = spawn.x + Math.round(Math.random() * jitter * 2 - jitter);
  p.y = spawn.y + Math.round(Math.random() * jitter - jitter / 2);
  p.socket.join(room(zone));

  const players = [...online.values()].filter((o) => o.zone === zone).map(publicPlayer);
  p.socket.emit('zone:state', {
    zone,
    kind: def.id,
    name: ownerName ? `Nông trại của ${ownerName}` : def.name,
    ownerId,
    ownerName,
    players,
    farm,
  });
  p.socket.to(room(zone)).emit('player:join', publicPlayer(p));
  // Báo chủ vườn khi có người ghé thăm
  if (ownerId != null && ownerId !== p.userId) {
    online.get(ownerId)?.socket.emit('toast', { msg: `👀 ${p.name} đang ghé thăm nông trại của bạn`, kind: 'info' });
  }
  return {};
}

export function broadcastToZone(zone: string, event: string, data: unknown) {
  getIo().to(room(zone)).emit(event, data);
}

export function registerWorld(socket: Socket, p: OnlinePlayer) {
  handle<{ zone: string; via?: string }>(socket, 'zone:join', ({ zone, via }) =>
    joinZone(p, String(zone), via === 'walk' ? 'walk' : via === 'login' ? 'login' : 'bus'));

  handle<{ x: number; y: number }>(socket, 'move', ({ x, y }) => {
    if (!p.zone) return;
    const def = zoneDefOf(p.zone)!;
    const nx = Math.max(20, Math.min(def.w - 20, Math.round(Number(x) || 0)));
    const ny = Math.max(60, Math.min(def.h - 10, Math.round(Number(y) || 0)));
    p.x = nx;
    p.y = ny;
    socket.to(room(p.zone)).emit('player:move', { id: p.userId, x: nx, y: ny });
  });

  handle<{ text: string }>(socket, 'chat', ({ text }) => {
    if (!p.zone) return;
    const now = Date.now();
    if (now - p.lastChat < 700) throw new GameError('Bạn chat nhanh quá!');
    const t = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!t) return;
    p.lastChat = now;
    // Chat cộng đồng: gửi tới mọi người đang online (bong bóng chỉ hiện với ai cùng khu).
    const msg = { id: p.userId, name: p.name, text: t, at: now };
    recentChat.push(msg);
    if (recentChat.length > 30) recentChat.shift();
    getIo().emit('player:chat', msg);
  });

  handle(socket, 'chat:history', () => ({ messages: recentChat }));
}

const recentChat: { id: number; name: string; text: string; at: number }[] = [];

export const PUBLIC_ZONES = Object.keys(ZONES).filter((z) => z !== 'farm');
