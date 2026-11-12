import type { Socket } from 'socket.io';
import {
  deleteFriend, findProfileByName, friendStatus, GameError, getProfile, listFriends, listIncoming, setFriend, tx,
} from '../db';
import { handle, online, OnlinePlayer, toast } from './online';

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

  handle<{ to: number; text: string }>(socket, 'pm', ({ to, text }) => {
    const target = online.get(Number(to));
    if (!target) throw new GameError('Người này đang offline');
    const t = String(text ?? '').trim().slice(0, 200);
    if (!t) return;
    const msg = { from: uid, fromName: p.name, to: target.userId, toName: target.name, text: t };
    target.socket.emit('pm', msg);
    socket.emit('pm', msg);
  });
}
