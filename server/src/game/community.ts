import type { Socket } from 'socket.io';
import { addAnnouncement, countResidents, friendStatus, listAnnouncements, listResidents, pruneAnnouncements } from '../db';
import { getIo, handle, online, OnlinePlayer } from './online';

/** Đăng một thông báo lên Bảng tin cộng đồng (lưu DB) và báo cho mọi người đang online. */
export async function announce(kind: 'newbie' | 'police' | 'info' | 'bail', text: string, userId: number | null = null) {
  const a = await addAnnouncement(kind, text, userId);
  getIo().emit('news', a);
  pruneAnnouncements().catch((e) => console.error('[news prune]', e));
  return a;
}

// Dọn tin cũ định kỳ (kể cả khi không có tin mới)
setInterval(() => { pruneAnnouncements().catch((e) => console.error('[news prune]', e)); }, 3600_000);

export function registerCommunity(socket: Socket, p: OnlinePlayer) {
  // Danh sách cư dân: người online lên trước, rồi theo cấp
  handle<{ q?: string }>(socket, 'residents:list', async ({ q }) => {
    const query = String(q ?? '').trim().slice(0, 30);
    const [rows, total] = await Promise.all([listResidents(query), countResidents()]);
    const residents = await Promise.all(rows.map(async (r) => {
      const o = online.get(r.id);
      return {
        id: r.id, name: r.name, level: r.level, appearance: r.appearance, joined: Number(r.joined),
        online: !!o, zone: o?.zone ?? null,
        friend: r.id === p.userId ? 'me' : await friendStatus(p.userId, r.id),
      };
    }));
    residents.sort((a, b) => Number(b.online) - Number(a.online) || b.level - a.level);
    return { residents, total, online: online.size };
  });

  handle(socket, 'news:list', async () => ({ news: await listAnnouncements(50) }));
}
