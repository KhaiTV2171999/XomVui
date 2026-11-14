import type { Socket } from 'socket.io';
import {
  addMessage, deleteFriend, findProfileByName, friendStatus, GameError, getConversation, getProfile, lastMessages,
  listFriends, listIncoming, markRead, setFriend, tx, unreadCounts, addItem, removeItem,
} from '../db';
import { ITEMS } from '../../../shared/catalog';
import { handle, online, OnlinePlayer, pushMe, toast } from './online';
import { questBump } from './quests';

export async function friendList(uid: number) {
  const [friends, incoming] = await Promise.all([listFriends(uid), listIncoming(uid)]);
  return {
    friends: friends.map((f) => {
      const o = online.get(f.id);
      return { ...f, online: !!o, zone: o?.zone ?? null };
    }),
    incoming,
  };
}

export async function pushFriends(uid: number) {
  const s = online.get(uid)?.socket;
  if (s) s.emit('friends', await friendList(uid));
}

/** Báo cho bạn bè đang online biết trạng thái mình thay đổi. */
export async function notifyFriendsPresence(uid: number) {
  for (const f of await listFriends(uid)) if (online.has(f.id)) await pushFriends(f.id);
}

export function registerSocial(socket: Socket, p: OnlinePlayer) {
  const uid = p.userId;

  handle(socket, 'friend:list', () => friendList(uid));

  handle<{ name?: string; userId?: number }>(socket, 'friend:request', async ({ name, userId }) => {
    const target = userId != null ? await getProfile(Number(userId)) : await findProfileByName(String(name ?? '').trim());
    if (!target) throw new GameError('Không tìm thấy người chơi');
    if (target.userId === uid) throw new GameError('Không thể kết bạn với chính mình');
    const mine = await friendStatus(uid, target.userId);
    if (mine === 'accepted') throw new GameError('Hai bạn đã là bạn bè');
    if (mine === 'pending') throw new GameError('Đã gửi lời mời trước đó');
    if ((await friendStatus(target.userId, uid)) === 'pending') {
      await tx(async () => { await setFriend(uid, target.userId, 'accepted'); await setFriend(target.userId, uid, 'accepted'); });
      toast(target.userId, `🤝 ${p.name} đã đồng ý kết bạn`, 'success');
      await Promise.all([pushFriends(target.userId), pushFriends(uid)]);
      return { accepted: true };
    }
    await setFriend(uid, target.userId, 'pending');
    toast(target.userId, `💌 ${p.name} muốn kết bạn với bạn`, 'info');
    await pushFriends(target.userId);
    return { accepted: false };
  });

  handle<{ userId: number; accept: boolean }>(socket, 'friend:respond', async ({ userId, accept }) => {
    const other = Number(userId);
    if ((await friendStatus(other, uid)) !== 'pending') throw new GameError('Lời mời không còn');
    if (accept) {
      await tx(async () => { await setFriend(other, uid, 'accepted'); await setFriend(uid, other, 'accepted'); });
      toast(other, `🤝 ${p.name} đã đồng ý kết bạn`, 'success');
    } else {
      await deleteFriend(uid, other);
    }
    await Promise.all([pushFriends(other), pushFriends(uid)]);
  });

  handle<{ userId: number }>(socket, 'friend:remove', async ({ userId }) => {
    await deleteFriend(uid, Number(userId));
    await Promise.all([pushFriends(Number(userId)), pushFriends(uid)]);
  });

  handle<{ userId: number }>(socket, 'player:info', async ({ userId }) => {
    const prof = await getProfile(Number(userId));
    return {
      player: {
        id: prof.userId, name: prof.name, level: prof.level, appearance: prof.appearance,
        friend: await friendStatus(uid, prof.userId), online: online.has(prof.userId),
      },
    };
  });

  // ---- Tin nhắn riêng (lưu trong DB, gửi được cả khi bạn offline) ----
  let lastPm = 0;
  const requireFriend = async (other: number) => {
    if ((await friendStatus(uid, other)) !== 'accepted') throw new GameError('Chỉ nhắn tin được với bạn bè');
  };

  handle<{ to: number; text: string }>(socket, 'pm', async ({ to, text }) => {
    const other = Number(to);
    const t = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!t) throw new GameError('Tin nhắn trống');
    const now = Date.now();
    if (now - lastPm < 400) throw new GameError('Bạn gửi nhanh quá!');
    lastPm = now;
    await requireFriend(other);
    const msg = { ...(await addMessage(uid, other, t)), fromName: p.name };
    online.get(other)?.socket.emit('pm', msg);
    socket.emit('pm', msg);
    return { message: msg };
  });

  handle<{ with: number; before?: number }>(socket, 'pm:history', async ({ with: other, before }) => {
    const o = Number(other);
    await requireFriend(o);
    const messages = await getConversation(uid, o, before != null ? Number(before) : undefined);
    if (before == null) {
      await markRead(uid, o);
      await pushUnread(uid);
    }
    return { messages };
  });

  handle<{ with: number }>(socket, 'pm:read', async ({ with: other }) => {
    await markRead(uid, Number(other));
    await pushUnread(uid);
  });

  handle(socket, 'pm:overview', async () => ({ last: await lastMessages(uid) }));

  // ---- Tặng quà: nông sản, hạt giống, thức ăn (chỉ cho bạn bè) ----
  let lastGift = 0;
  handle<{ to: number; itemId: string; qty: number }>(socket, 'gift:send', async ({ to, itemId, qty }) => {
    const other = Number(to);
    const item = ITEMS[String(itemId)];
    const n = Math.floor(Number(qty));
    if (other === uid) throw new GameError('Không thể tự tặng mình');
    if (!item || !GIFTABLE.has(item.kind)) throw new GameError('Món này không tặng được');
    if (!Number.isInteger(n) || n < 1 || n > 999) throw new GameError('Số lượng không hợp lệ');
    const now = Date.now();
    if (now - lastGift < 1500) throw new GameError('Từ từ thôi, tặng nhanh quá!');
    lastGift = now;
    if ((await friendStatus(uid, other)) !== 'accepted') throw new GameError('Chỉ tặng quà được cho bạn bè');
    await tx(async () => {
      await removeItem(uid, item.id, n); // ném lỗi nếu không đủ
      await addItem(other, item.id, n);
    });
    // Ghi thành tin nhắn riêng: người nhận offline vẫn biết, có lịch sử
    const msg = { ...(await addMessage(uid, other, `🎁 Đã tặng bạn ${n} ${item.icon} ${item.name}`)), fromName: p.name };
    online.get(other)?.socket.emit('pm', msg);
    socket.emit('pm', msg);
    toast(other, `🎁 ${p.name} vừa tặng bạn ${n} ${item.icon} ${item.name}!`, 'success');
    questBump(uid, 'gift');
    await Promise.all([pushMe(uid), pushMe(other)]);
    return { ok: true };
  });
}

/** Loại vật phẩm được phép tặng (trang phục thì không). */
const GIFTABLE = new Set(['produce', 'seed', 'feed', 'material']);

/** Gửi số tin chưa đọc (theo từng người) cho người chơi. */
export async function pushUnread(uid: number) {
  const s = online.get(uid)?.socket;
  if (s) s.emit('pm:unread', { counts: await unreadCounts(uid) });
}
