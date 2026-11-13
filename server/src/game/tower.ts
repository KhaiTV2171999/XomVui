import { randomInt } from 'node:crypto';
import type { Socket } from 'socket.io';
import { drop, floors, newTower, TowerState, TW } from '../../../shared/tower';
import { addCoins, GameError, getProfile, saveTowerScore, takeCoinsUpTo, towerBoard, towerMine, tx } from '../db';
import { getIo, handle, online, OnlinePlayer, pushMe, toast } from './online';
import { questBump } from './quests';

/*
 * Xây nhà cao tầng — server chấm điểm: client chỉ gửi "thả sau bao nhiêu ms kể từ khi tầng xuất hiện",
 * server mô phỏng lại bằng cùng code (shared/tower.ts) nên không sửa điểm được.
 *  - Chơi đơn xếp hạng: lưu điểm cao nhất (tower_scores) → bảng xếp hạng.
 *  - Solo 2 người: cùng seed (cùng kiểu đung đưa), chơi đồng thời 90 giây, điểm cao hơn thắng pot.
 */

interface Run {
  mode: 'solo' | 'duel';
  st: TowerState;
  /** Thời điểm (server) tầng hiện tại xuất hiện — chặn thả "trước khi tầng có mặt" */
  spawnAt: number;
  roomId?: number;
}
const runs = new Map<number, Run>();

interface DuelPlayer { id: number; name: string; appearance: unknown; st: TowerState | null; paid: number }
interface Room {
  id: number;
  stake: number;
  hostId: number;
  players: DuelPlayer[];
  phase: 'waiting' | 'countdown' | 'playing' | 'done';
  seed: number;
  startAt: number;
  endsAt: number;
  winnerId: number | null;
  timer?: ReturnType<typeof setTimeout>;
}
const rooms = new Map<number, Room>();
const userRoom = new Map<number, number>();
let nextRoomId = 1;
const STAKES = [0, 100, 500, 1000];
const LOBBY = 'tw:lobby';
const roomKey = (id: number) => `tw:room:${id}`;

function summary(st: TowerState | null) {
  return st ? { score: st.score, floors: floors(st), lives: st.lives, over: st.over, combo: st.combo } : null;
}
function roomView(r: Room) {
  return {
    id: r.id, stake: r.stake, hostId: r.hostId, phase: r.phase, seed: r.phase === 'waiting' ? 0 : r.seed,
    startAt: r.startAt, endsAt: r.endsAt, winnerId: r.winnerId, now: Date.now(),
    players: r.players.map((p) => ({ id: p.id, name: p.name, appearance: p.appearance, ...summary(p.st) })),
  };
}
function lobbyView() {
  return [...rooms.values()].filter((r) => r.phase === 'waiting').map((r) => ({
    id: r.id, stake: r.stake, host: r.players[0]?.name ?? '?', hostAppearance: r.players[0]?.appearance,
  }));
}
const pushRoom = (r: Room) => getIo().to(roomKey(r.id)).emit('tw:room', roomView(r));
const pushLobby = () => getIo().to(LOBBY).emit('tw:lobby', lobbyView());

export function towerOverview() {
  return { duels: [...rooms.values()].filter((r) => r.phase === 'playing').length, waiting: lobbyView().length };
}

function startDuel(r: Room) {
  for (const pl of r.players) questBump(pl.id, 'play');
  r.phase = 'countdown';
  r.seed = randomInt(1, 2 ** 31);
  r.startAt = Date.now() + 3500;
  r.endsAt = r.startAt + TW.DUEL_MS;
  for (const p of r.players) p.st = newTower(r.seed);
  pushRoom(r);
  pushLobby();
  r.timer = setTimeout(() => {
    r.phase = 'playing';
    for (const p of r.players) runs.set(p.id, { mode: 'duel', st: p.st!, spawnAt: Date.now(), roomId: r.id });
    pushRoom(r);
    r.timer = setTimeout(() => finishDuel(r, 'time'), TW.DUEL_MS + 300);
  }, r.startAt - Date.now());
}

async function finishDuel(r: Room, why: 'time' | 'over' | 'forfeit') {
  if (r.phase === 'done') return;
  if (r.timer) clearTimeout(r.timer);
  r.phase = 'done';
  for (const p of r.players) {
    if (p.st && !p.st.over) { p.st.over = true; p.st.end = 'time'; }
    runs.delete(p.id);
  }
  const [a, b] = r.players;
  const sa = a?.st?.score ?? -1, sb = b?.st?.score ?? -1;
  r.winnerId = !b ? a?.id ?? null : sa === sb ? null : sa > sb ? a.id : b.id;
  const pot = r.players.reduce((s, p) => s + p.paid, 0);
  if (pot > 0) {
    if (r.winnerId != null) await addCoins(r.winnerId, pot);
    else for (const p of r.players) if (p.paid) await addCoins(p.id, p.paid); // hoà: trả lại
  }
  for (const p of r.players) {
    if (r.winnerId == null) toast(p.id, `🤝 Hoà! ${pot ? 'Hoàn lại tiền cược' : ''}`, 'info');
    else if (p.id === r.winnerId) toast(p.id, `🏆 Bạn thắng!${pot ? ` +${pot} xu` : ''}`, 'success');
    else toast(p.id, why === 'forfeit' ? '🏳️ Bạn đã bỏ cuộc' : '😢 Bạn thua rồi', 'error');
    pushMe(p.id).catch(() => {});
  }
  pushRoom(r);
  // Dọn phòng sau một lúc
  setTimeout(() => {
    if (rooms.get(r.id) !== r) return;
    rooms.delete(r.id);
    for (const p of r.players) if (userRoom.get(p.id) === r.id) userRoom.delete(p.id);
  }, 60_000);
}

async function leaveRoom(uid: number) {
  const id = userRoom.get(uid);
  if (id == null) return;
  const r = rooms.get(id);
  userRoom.delete(uid);
  online.get(uid)?.socket.leave(roomKey(id));
  if (!r) return;
  if (r.phase === 'waiting') {
    const p = r.players.find((x) => x.id === uid);
    if (p?.paid) await addCoins(uid, p.paid);
    r.players = r.players.filter((x) => x.id !== uid);
    if (!r.players.length) rooms.delete(id);
    else { r.hostId = r.players[0].id; pushRoom(r); }
    pushLobby();
    pushMe(uid).catch(() => {});
  } else if (r.phase === 'countdown' || r.phase === 'playing') {
    // Bỏ giữa trận = thua (tiền cược vẫn vào pot)
    const p = r.players.find((x) => x.id === uid);
    if (p?.st) { p.st.over = true; p.st.score = -1; }
    runs.delete(uid);
    await finishDuel(r, 'forfeit');
  }
}

export function onDisconnectTower(uid: number) {
  runs.delete(uid);
  leaveRoom(uid).catch((e) => console.error('[tower leave]', e));
}

export function registerTower(socket: Socket, p: OnlinePlayer) {
  const uid = p.userId;

  handle(socket, 'tw:board', async () => ({ top: await towerBoard(20), me: await towerMine(uid) }));

  // ---- Chơi đơn xếp hạng ----
  handle(socket, 'tw:solo', async () => {
    if (userRoom.has(uid)) throw new GameError('Bạn đang ở phòng solo');
    const seed = randomInt(1, 2 ** 31);
    runs.set(uid, { mode: 'solo', st: newTower(seed), spawnAt: Date.now() });
    questBump(uid, 'play');
    return { seed };
  });

  // Thả tầng: dt = số ms kể từ khi tầng xuất hiện (đo ở máy người chơi)
  handle<{ dt: number }>(socket, 'tw:drop', async ({ dt }) => {
    const run = runs.get(uid);
    if (!run) throw new GameError('Ván đã kết thúc');
    if (run.st.over) throw new GameError('Ván đã kết thúc');
    // Không thể thả sớm hơn thời gian thực tế tầng đã có mặt (cho phép trễ mạng 1,5s)
    const real = Date.now() - run.spawnAt;
    const d = Math.min(Number(dt) || 0, real + 1500);
    const res = drop(run.st, d)!;
    run.spawnAt = Date.now();
    const out = { res, score: run.st.score, floors: floors(run.st), lives: run.st.lives, combo: run.st.combo, over: run.st.over, end: run.st.end };

    if (run.mode === 'solo') {
      if (run.st.over) {
        runs.delete(uid);
        const saved = await saveTowerScore(uid, run.st.score, floors(run.st));
        const me = await towerMine(uid);
        return { ...out, best: saved.best, record: run.st.score >= saved.best && run.st.score > 0, rank: me.rank };
      }
      return out;
    }
    // Solo 2 người: báo tiến độ cho cả phòng
    const r = rooms.get(run.roomId!);
    if (r) {
      pushRoom(r);
      if (r.players.every((x) => x.st?.over)) await finishDuel(r, 'over');
    }
    return out;
  });

  handle(socket, 'tw:quit', () => { runs.delete(uid); });

  // ---- Solo 2 người ----
  handle(socket, 'tw:lobby', () => { socket.join(LOBBY); return { rooms: lobbyView(), stakes: STAKES }; });
  handle(socket, 'tw:unlobby', () => { socket.leave(LOBBY); });

  handle<{ stake: number }>(socket, 'tw:create', async ({ stake }) => {
    const s = Number(stake);
    if (!STAKES.includes(s)) throw new GameError('Mức cược không hợp lệ');
    if (userRoom.has(uid)) throw new GameError('Bạn đang ở một phòng khác');
    const paid = s ? await takeExact(uid, s) : 0;
    const prof = await getProfile(uid);
    const r: Room = {
      id: nextRoomId++, stake: s, hostId: uid, phase: 'waiting', seed: 0, startAt: 0, endsAt: 0, winnerId: null,
      players: [{ id: uid, name: prof.name, appearance: prof.appearance, st: null, paid }],
    };
    rooms.set(r.id, r);
    userRoom.set(uid, r.id);
    socket.join(roomKey(r.id));
    pushLobby();
    return { room: roomView(r) };
  });

  handle<{ id: number }>(socket, 'tw:join', async ({ id }) => {
    const r = rooms.get(Number(id));
    if (!r || r.phase !== 'waiting') throw new GameError('Phòng không còn chờ');
    if (userRoom.has(uid)) throw new GameError('Bạn đang ở một phòng khác');
    if (r.players.length >= 2) throw new GameError('Phòng đã đủ người');
    const paid = r.stake ? await takeExact(uid, r.stake) : 0;
    const prof = await getProfile(uid);
    r.players.push({ id: uid, name: prof.name, appearance: prof.appearance, st: null, paid });
    userRoom.set(uid, r.id);
    socket.join(roomKey(r.id));
    toast(r.hostId, `⚔️ ${prof.name} đã vào phòng — chuẩn bị!`, 'info');
    startDuel(r);
    return { room: roomView(r) };
  });

  handle(socket, 'tw:leave', () => leaveRoom(uid));
}

/** Trừ đúng số xu cược (không đủ thì báo lỗi, không trừ). */
async function takeExact(uid: number, amount: number) {
  return tx(async () => {
    if ((await getProfile(uid)).coins < amount) throw new GameError(`Cần ít nhất ${amount} xu để cược`);
    const got = await takeCoinsUpTo(uid, amount);
    await pushMe(uid);
    return got;
  });
}
