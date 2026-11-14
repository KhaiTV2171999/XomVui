import { randomInt } from 'node:crypto';
import type { Socket } from 'socket.io';
import { addCoins, GameError } from '../db';
import { getIo, handle, online, OnlinePlayer, pushMe } from './online';
import { questBump } from './quests';

// 0 Bầu, 1 Cua, 2 Tôm, 3 Cá, 4 Gà, 5 Nai
export const BC_CHIPS = [10, 50, 100, 500, 1000, 5000];
const MAX_PER_ROUND = 50000;
const BET_MS = 20000;
const ROLL_MS = 3500;
const RESULT_MS = 6000;
const ROOM = 'bc';

type Phase = 'betting' | 'rolling' | 'result';

const st = {
  round: 0,
  phase: 'betting' as Phase,
  endsAt: 0,
  bets: new Map<number, number[]>(),
  totals: [0, 0, 0, 0, 0, 0],
  dice: null as number[] | null,
  history: [] as number[][],
  lastWinners: [] as { name: string; win: number }[],
};

function publicState() {
  return {
    round: st.round,
    phase: st.phase,
    endsAt: st.endsAt,
    now: Date.now(),
    totals: st.totals,
    dice: st.phase === 'result' ? st.dice : null,
    history: st.history,
    viewers: getIo().sockets.adapter.rooms.get(ROOM)?.size ?? 0,
    players: st.bets.size,
    lastWinners: st.lastWinners,
    seated: seatedPlayers(),
  };
}

/** Người đang ngồi ở bàn (trong phòng bầu cua): ai cược nhiều đứng trước, tối đa 16 người. */
function seatedPlayers() {
  const ids = getIo().sockets.adapter.rooms.get(ROOM);
  if (!ids) return [];
  return [...online.values()]
    .filter((p) => ids.has(p.socket.id))
    .map((p) => ({ id: p.userId, name: p.name, appearance: p.appearance, bet: (st.bets.get(p.userId) ?? []).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.bet - a.bet)
    .slice(0, 16);
}

/** Gửi trạng thái bàn ngay (dùng khi chuyển giai đoạn: nhận cược → lắc → mở bát). */
function broadcast() {
  if (pending) { clearTimeout(pending); pending = null; }
  lastSent = Date.now();
  getIo().to(ROOM).emit('bc:state', publicState());
}

// Cược / vào / rời bàn dồn dập → gộp lại, gửi tối đa ~4 lần/giây thay vì mỗi thao tác một lần.
const COALESCE_MS = 250;
let pending: ReturnType<typeof setTimeout> | null = null;
let lastSent = 0;
function broadcastSoon() {
  if (pending) return;
  const wait = Math.max(0, COALESCE_MS - (Date.now() - lastSent));
  pending = setTimeout(() => { pending = null; broadcast(); }, wait);
}

function startBetting() {
  st.round++;
  st.phase = 'betting';
  st.endsAt = Date.now() + BET_MS;
  st.bets.clear();
  st.totals = [0, 0, 0, 0, 0, 0];
  st.dice = null;
  broadcast();
  setTimeout(roll, BET_MS);
}

function roll() {
  st.phase = 'rolling';
  st.endsAt = Date.now() + ROLL_MS;
  st.dice = [randomInt(6), randomInt(6), randomInt(6)];
  broadcast();
  setTimeout(result, ROLL_MS);
}

function result() {
  st.phase = 'result';
  st.endsAt = Date.now() + RESULT_MS;
  const dice = st.dice!;
  const counts = [0, 0, 0, 0, 0, 0];
  dice.forEach((d) => counts[d]++);
  const winners: { name: string; win: number }[] = [];

  for (const [uid, bets] of st.bets) {
    let win = 0;
    let total = 0;
    bets.forEach((amt, i) => {
      total += amt;
      if (amt > 0 && counts[i] > 0) win += amt * (counts[i] + 1);
    });
    const p = online.get(uid);
    const payout = win > 0 ? addCoins(uid, win) : Promise.resolve(0);
    payout
      .then(() => {
        if (!p) return;
        p.socket.emit('bc:result', { round: st.round, dice, win, net: win - total });
        return pushMe(uid);
      })
      .catch((e) => console.error('bc payout', e));
    if (win - total > 0 && p) winners.push({ name: p.name, win: win - total });
  }
  st.lastWinners = winners.sort((a, b) => b.win - a.win).slice(0, 5);
  st.history = [dice, ...st.history].slice(0, 12);
  broadcast();
  setTimeout(startBetting, RESULT_MS);
}

export function startBauCua() {
  startBetting();
}

export function registerBauCua(socket: Socket, p: OnlinePlayer) {
  const uid = p.userId;
  const myBets = () => (st.bets.get(uid) ?? [0, 0, 0, 0, 0, 0]);

  handle(socket, 'bc:join', () => {
    socket.join(ROOM);
    broadcastSoon();
    return { state: publicState(), myBets: myBets(), chips: BC_CHIPS };
  });

  handle(socket, 'bc:leave', () => {
    socket.leave(ROOM);
    broadcastSoon();
  });

  handle<{ symbol: number; amount: number }>(socket, 'bc:bet', async ({ symbol, amount }) => {
    if (st.phase !== 'betting' || Date.now() > st.endsAt - 300) throw new GameError('Đã hết thời gian đặt cược');
    const s = Number(symbol);
    const a = Number(amount);
    if (!Number.isInteger(s) || s < 0 || s > 5) throw new GameError('Ô cược không hợp lệ');
    if (!BC_CHIPS.includes(a)) throw new GameError('Mức cược không hợp lệ');
    const bets = myBets();
    const total = bets.reduce((x, y) => x + y, 0);
    if (total + a > MAX_PER_ROUND) throw new GameError(`Tối đa ${MAX_PER_ROUND.toLocaleString('vi')} xu mỗi ván`);
    const round = st.round;
    questBump(uid, 'play', 1, `bc${round}`);
    await addCoins(uid, -a); // ném lỗi "Không đủ xu" nếu thiếu
    if (st.phase !== 'betting' || st.round !== round) {
      // Vòng đã chuyển sang lắc trong lúc chờ DB → hoàn lại tiền
      await addCoins(uid, a);
      throw new GameError('Đã hết thời gian đặt cược');
    }
    const cur = myBets();
    cur[s] += a;
    st.bets.set(uid, cur);
    st.totals[s] += a;
    broadcastSoon();
    await pushMe(uid);
    return { myBets: cur };
  });

  handle(socket, 'bc:clear', async () => {
    if (st.phase !== 'betting' || Date.now() > st.endsAt - 300) throw new GameError('Không thể rút cược lúc này');
    const bets = st.bets.get(uid);
    if (!bets) return { myBets: [0, 0, 0, 0, 0, 0] };
    // Xoá cược trong bộ nhớ trước khi hoàn xu → bấm 2 lần cũng không được hoàn 2 lần.
    st.bets.delete(uid);
    bets.forEach((a, i) => (st.totals[i] -= a));
    const total = bets.reduce((x, y) => x + y, 0);
    await addCoins(uid, total);
    broadcastSoon();
    await pushMe(uid);
    return { myBets: [0, 0, 0, 0, 0, 0] };
  });
}

/** Tóm tắt cho sảnh Khu giải trí. */
export function bcOverview() {
  return {
    phase: st.phase,
    endsAt: st.endsAt,
    players: st.bets.size,
    pot: st.totals.reduce((a, b) => a + b, 0),
    last: st.history[0] ?? null,
    winners: st.lastWinners,
  };
}

/** Người đang ở bàn Bầu cua (để chat tại bàn). */
export function baucuaMates(): number[] {
  const ids = getIo().sockets.adapter.rooms.get(ROOM);
  if (!ids) return [];
  const out: number[] = [];
  for (const sid of ids) {
    const uid = getIo().sockets.sockets.get(sid)?.data?.userId;
    if (typeof uid === 'number') out.push(uid);
  }
  return out;
}
