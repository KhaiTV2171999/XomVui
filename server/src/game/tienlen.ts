import { randomInt } from 'node:crypto';
import type { Socket } from 'socket.io';
import { Appearance, DEFAULT_APPEARANCE } from '../../../shared/catalog';
import { analyze, beats, botChoose, cardLabel, Combo, COMBO_NAMES } from '../../../shared/tienlen';
import { addCoins, GameError, getProfile, takeCoinsUpTo } from '../db';
import { getIo, handle, online, OnlinePlayer, pushMe, toast } from './online';
import { questBump } from './quests';

/** Mức cược = số xu mỗi lá bài còn lại trên tay người thua. */
const STAKES = [10, 50, 100, 500];
/** Thua nặng nhất: cóng (còn đủ 13 lá) → trả gấp đôi = 26 lá. Cần đủ xu cho trường hợp này mới được ngồi. */
const MAX_LOSS = 26;
const TURN_MS = 20000;
const LOBBY = 'tl:lobby';
const BOT_NAMES = ['Mèo Mập', 'Cún Con', 'Gấu Nâu', 'Thỏ Ngọc', 'Cáo Nhỏ', 'Vịt Bầu'];
const BOT_LOOKS: Appearance[] = [
  { skin: 1, hair: 3, hairColor: 2, top: 'cl:hoodie_yellow', bottom: 'cl:pants_black', hat: 'cl:bow_pink', acc: null },
  { skin: 2, hair: 1, hairColor: 0, top: 'cl:stripe_navy', bottom: 'cl:shorts_khaki', hat: 'cl:cap_red', acc: null },
  { skin: 0, hair: 5, hairColor: 5, top: 'cl:dress_pink', bottom: 'cl:skirt_pink', hat: null, acc: 'cl:glasses_round' },
  { skin: 3, hair: 0, hairColor: 1, top: 'cl:jacket_denim', bottom: 'cl:pants_khaki', hat: 'cl:beanie_green', acc: null },
];

interface Seat {
  kind: 'human' | 'bot';
  userId?: number;
  name: string;
  appearance: Appearance;
  hand: number[];
}

interface Table {
  id: number;
  stake: number;
  hostId: number;
  seats: (Seat | null)[];
  playing: boolean;
  turn: number;
  current: { combo: Combo; seat: number } | null;
  passed: boolean[];
  lastWinner: number | null;
  turnEndsAt: number;
  timer: NodeJS.Timeout | null;
  log: string[];
  result: { winner: string; winnerSeat: number; rows: { seat: number; name: string; delta: number; left: number[]; cong: boolean }[] } | null;
}

const tables = new Map<number, Table>();
const userTable = new Map<number, number>();
let nextId = 1;

function lobbyList() {
  return [...tables.values()].map((t) => ({
    id: t.id,
    stake: t.stake,
    playing: t.playing,
    count: t.seats.filter(Boolean).length,
    host: t.seats.find((s) => s?.userId === t.hostId)?.name ?? '?',
  }));
}
function pushLobby() {
  getIo().to(LOBBY).emit('tl:lobby', lobbyList());
}

function stateFor(t: Table, uid: number | null) {
  const mySeat = t.seats.findIndex((s) => s?.kind === 'human' && s.userId === uid);
  return {
    id: t.id,
    stake: t.stake,
    hostId: t.hostId,
    playing: t.playing,
    turn: t.turn,
    turnEndsAt: t.turnEndsAt,
    now: Date.now(),
    current: t.current,
    mySeat,
    myHand: mySeat >= 0 ? [...t.seats[mySeat]!.hand].sort((a, b) => a - b) : [],
    seats: t.seats.map((s, i) => s && {
      name: s.name, kind: s.kind, userId: s.userId ?? null, appearance: s.appearance,
      count: s.hand.length, passed: t.passed[i],
    }),
    log: t.log.slice(-6),
    result: t.result,
  };
}

function pushTable(t: Table) {
  for (const s of t.seats) {
    if (s?.kind === 'human' && s.userId != null) online.get(s.userId)?.socket.emit('tl:state', stateFor(t, s.userId));
  }
}

function getMyTable(uid: number) {
  const id = userTable.get(uid);
  const t = id != null ? tables.get(id) : undefined;
  if (!t) throw new GameError('Bạn chưa ngồi bàn nào');
  return t;
}

function humans(t: Table) {
  return t.seats.filter((s): s is Seat => !!s && s.kind === 'human');
}

function clearTimer(t: Table) {
  if (t.timer) clearTimeout(t.timer);
  t.timer = null;
}

function scheduleTurn(t: Table) {
  clearTimer(t);
  const seat = t.seats[t.turn]!;
  if (seat.kind === 'bot') {
    t.turnEndsAt = Date.now() + 1500;
    t.timer = setTimeout(() => botAct(t), 900 + randomInt(900));
  } else {
    t.turnEndsAt = Date.now() + TURN_MS;
    t.timer = setTimeout(() => autoAct(t), TURN_MS);
  }
}

function advance(t: Table) {
  let i = t.turn;
  for (let k = 0; k < 4; k++) {
    i = (i + 1) % 4;
    if (!t.seats[i]) continue;
    if (t.current && i === t.current.seat) {
      t.current = null;
      t.passed = [false, false, false, false];
      t.turn = i;
      t.log.push(`— ${t.seats[i]!.name} giành lượt mới —`);
      return;
    }
    if (!t.passed[i]) { t.turn = i; return; }
  }
}

function doPlay(t: Table, seatIdx: number, cards: number[]) {
  const seat = t.seats[seatIdx]!;
  if (!t.playing || t.turn !== seatIdx) throw new GameError('Chưa tới lượt bạn');
  if (!cards.every((c) => seat.hand.includes(c))) throw new GameError('Bài không hợp lệ');
  const combo = analyze(cards);
  if (!combo) throw new GameError('Bộ bài không hợp lệ');
  if (!beats(combo, t.current?.combo ?? null)) throw new GameError('Bài không chặn được');
  const chop = t.current && combo.type !== t.current.combo.type;
  seat.hand = seat.hand.filter((c) => !cards.includes(c));
  t.current = { combo, seat: seatIdx };
  t.log.push(`${seat.name}: ${COMBO_NAMES[combo.type]} ${combo.cards.map(cardLabel).join(' ')}${chop ? ' 💥 CHẶT!' : ''}`);
  if (seat.hand.length === 0) return endGame(t, seatIdx);
  advance(t);
  scheduleTurn(t);
  pushTable(t);
}

function doPass(t: Table, seatIdx: number) {
  if (!t.playing || t.turn !== seatIdx) throw new GameError('Chưa tới lượt bạn');
  if (!t.current) throw new GameError('Bạn đang cầm cái, phải đánh');
  t.passed[seatIdx] = true;
  t.log.push(`${t.seats[seatIdx]!.name}: bỏ lượt`);
  advance(t);
  scheduleTurn(t);
  pushTable(t);
}

function botAct(t: Table) {
  if (!t.playing) return;
  const seat = t.seats[t.turn];
  if (!seat || seat.kind !== 'bot') return;
  try {
    const choice = botChoose(seat.hand, t.current?.combo ?? null);
    if (choice) doPlay(t, t.turn, choice.cards);
    else doPass(t, t.turn);
  } catch (e) {
    console.error('bot error', e);
    if (t.current) doPass(t, t.turn);
    else doPlay(t, t.turn, [Math.min(...seat.hand)]);
  }
}

function autoAct(t: Table) {
  if (!t.playing) return;
  const seat = t.seats[t.turn]!;
  if (t.current) doPass(t, t.turn);
  else doPlay(t, t.turn, [Math.min(...seat.hand)]);
}

function endGame(t: Table, winnerSeat: number) {
  clearTimer(t);
  t.playing = false;
  t.lastWinner = winnerSeat;
  const winner = t.seats[winnerSeat]!;
  t.log.push(`🏆 ${winner.name} về nhất!`);
  // Chụp lại người thua (tay bài, cóng) trước khi tính tiền bất đồng bộ.
  const losers = t.seats
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s && i !== winnerSeat)
    .map(({ s, i }) => ({ seat: s!, idx: i, userId: s!.kind === 'human' ? s!.userId! : null, mult: s!.hand.length === 13 ? 2 : 1, left: [...s!.hand].sort((a, b) => a - b) }));
  pushTable(t);
  pushLobby();
  void settleGame(t, winner, winnerSeat, losers).catch((e) => console.error('tienlen settle', e));
}

/**
 * Tính tiền cuối ván theo lá: mỗi người thua trả (số lá còn × mức cược/lá), bị cóng thì gấp đôi;
 * người thắng nhận tổng. Trả tối đa số xu đang có.
 */
async function settleGame(
  t: Table, winner: Seat, winnerSeat: number,
  losers: { seat: Seat; idx: number; userId: number | null; mult: number; left: number[] }[],
) {
  const rows: { seat: number; name: string; delta: number; left: number[]; cong: boolean }[] = [];
  let pot = 0;
  for (const l of losers) {
    const due = t.stake * l.left.length * l.mult;
    const paid = l.userId != null ? await takeCoinsUpTo(l.userId, due) : due; // bot: nhà cái trả đủ
    pot += paid;
    rows.push({ seat: l.idx, name: l.seat.name, delta: -paid, left: l.left, cong: l.mult === 2 });
  }
  if (winner.kind === 'human' && winner.userId != null) await addCoins(winner.userId, pot);
  rows.unshift({ seat: winnerSeat, name: winner.name, delta: pot, left: [], cong: false });
  t.result = { winner: winner.name, winnerSeat, rows };
  t.log.push(`💰 ${winner.name} ăn ${pot.toLocaleString('vi')} xu (${t.stake} xu/lá)`);
  await Promise.all(humans(t).map((h) => pushMe(h.userId!)));
  if (losers.some((l) => l.userId != null)) await Promise.all(losers.filter((l) => l.userId != null).map((l) => pushMe(l.userId!)));
  if (winner.userId != null) await pushMe(winner.userId);
  pushTable(t);
}

function leaveTable(uid: number) {
  const id = userTable.get(uid);
  if (id == null) return;
  userTable.delete(uid);
  const t = tables.get(id);
  if (!t) return;
  const idx = t.seats.findIndex((s) => s?.kind === 'human' && s.userId === uid);
  if (idx < 0) return;
  const seat = t.seats[idx]!;
  if (t.playing) {
    // Bỏ giữa chừng: phạt gấp đôi, bot đánh thay.
    takeCoinsUpTo(uid, t.stake * 13 * 2)
      .then((pen) => {
        toast(uid, `Bạn rời bàn giữa ván và bị phạt ${pen.toLocaleString('vi')} xu`, 'error');
        return pushMe(uid);
      })
      .catch((e) => console.error('tienlen penalty', e));
    seat.kind = 'bot';
    seat.userId = undefined;
    seat.name = `${seat.name} (bot)`;
    t.log.push(`${seat.name} đã rời bàn, bot đánh thay`);
    if (t.turn === idx) scheduleTurn(t);
  } else {
    t.seats[idx] = null;
  }
  const hs = humans(t);
  if (!hs.length) {
    clearTimer(t);
    tables.delete(t.id);
  } else {
    if (t.hostId === uid) t.hostId = hs[0].userId!;
    pushTable(t);
  }
  pushLobby();
}

export function onDisconnectTienLen(uid: number) {
  leaveTable(uid);
}

export function registerTienLen(socket: Socket, p: OnlinePlayer) {
  const uid = p.userId;

  const seatAt = async (stake: number) => {
    const coins = (await getProfile(uid)).coins;
    if (coins < stake * MAX_LOSS) throw new GameError(`Cần ít nhất ${(stake * MAX_LOSS).toLocaleString('vi')} xu để ngồi bàn này`);
  };

  handle(socket, 'tl:lobby', () => {
    socket.join(LOBBY);
    const id = userTable.get(uid);
    const t = id != null ? tables.get(id) : undefined;
    return { tables: lobbyList(), stakes: STAKES, table: t ? stateFor(t, uid) : null };
  });

  handle(socket, 'tl:closeLobby', () => { socket.leave(LOBBY); });

  handle<{ stake: number }>(socket, 'tl:create', async ({ stake }) => {
    if (userTable.has(uid)) throw new GameError('Bạn đang ngồi một bàn khác');
    const s = Number(stake);
    if (!STAKES.includes(s)) throw new GameError('Mức cược không hợp lệ');
    await seatAt(s);
    if (userTable.has(uid)) throw new GameError('Bạn đang ngồi một bàn khác');
    const t: Table = {
      id: nextId++, stake: s, hostId: uid, seats: [null, null, null, null], playing: false, turn: 0,
      current: null, passed: [false, false, false, false], lastWinner: null, turnEndsAt: 0, timer: null,
      log: [`${p.name} đã tạo bàn`], result: null,
    };
    t.seats[0] = { kind: 'human', userId: uid, name: p.name, appearance: p.appearance, hand: [] };
    tables.set(t.id, t);
    userTable.set(uid, t.id);
    pushTable(t);
    pushLobby();
  });

  handle<{ id: number }>(socket, 'tl:join', async ({ id }) => {
    if (userTable.has(uid)) throw new GameError('Bạn đang ngồi một bàn khác');
    const t0 = tables.get(Number(id));
    if (!t0) throw new GameError('Bàn không tồn tại');
    await seatAt(t0.stake);
    // kiểm tra lại sau khi chờ DB (bàn có thể đã đổi)
    const t = tables.get(Number(id));
    if (!t) throw new GameError('Bàn không tồn tại');
    if (userTable.has(uid)) throw new GameError('Bạn đang ngồi một bàn khác');
    if (t.playing) throw new GameError('Bàn đang chơi, đợi ván sau nhé');
    const idx = t.seats.findIndex((s) => !s);
    if (idx < 0) throw new GameError('Bàn đã đủ người');
    t.seats[idx] = { kind: 'human', userId: uid, name: p.name, appearance: p.appearance, hand: [] };
    t.log.push(`${p.name} vào bàn`);
    userTable.set(uid, t.id);
    pushTable(t);
    pushLobby();
  });

  handle(socket, 'tl:leave', () => {
    leaveTable(uid);
    return { tables: lobbyList() };
  });

  handle(socket, 'tl:addBot', () => {
    const t = getMyTable(uid);
    if (t.hostId !== uid) throw new GameError('Chỉ chủ bàn mới thêm bot');
    if (t.playing) throw new GameError('Ván đang diễn ra');
    const idx = t.seats.findIndex((s) => !s);
    if (idx < 0) throw new GameError('Bàn đã đủ người');
    const used = new Set(t.seats.map((s) => s?.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${idx}`;
    t.seats[idx] = { kind: 'bot', name, appearance: BOT_LOOKS[randomInt(BOT_LOOKS.length)] ?? DEFAULT_APPEARANCE, hand: [] };
    pushTable(t);
    pushLobby();
  });

  handle<{ seat: number }>(socket, 'tl:removeBot', ({ seat }) => {
    const t = getMyTable(uid);
    if (t.hostId !== uid || t.playing) throw new GameError('Không thể bỏ bot lúc này');
    const s = t.seats[Number(seat)];
    if (!s || s.kind !== 'bot') throw new GameError('Ghế này không có bot');
    t.seats[Number(seat)] = null;
    pushTable(t);
    pushLobby();
  });

  handle(socket, 'tl:start', async () => {
    const t = getMyTable(uid);
    if (t.hostId !== uid) throw new GameError('Chỉ chủ bàn mới bắt đầu được');
    if (t.playing) throw new GameError('Ván đang diễn ra');
    for (const h of humans(t)) {
      if ((await getProfile(h.userId!)).coins < t.stake * MAX_LOSS) throw new GameError(`${h.name} không đủ xu để chơi (cần ${(t.stake * MAX_LOSS).toLocaleString('vi')} xu)`);
    }
    // kiểm tra lại sau khi chờ DB
    if (t.playing || !tables.has(t.id)) throw new GameError('Ván đang diễn ra');
    const occupied = t.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    for (const h of humans(t)) questBump(h.userId!, 'play');
    if (occupied.length < 2) throw new GameError('Cần ít nhất 2 người (có thể thêm bot)');
    // Chia bài
    const deck = Array.from({ length: 52 }, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    occupied.forEach((si, k) => { t.seats[si]!.hand = deck.slice(k * 13, k * 13 + 13); });
    t.playing = true;
    t.current = null;
    t.passed = [false, false, false, false];
    t.result = null;
    t.log = ['🃏 Ván mới bắt đầu!'];
    if (t.lastWinner != null && t.seats[t.lastWinner]) {
      t.turn = t.lastWinner;
    } else {
      let low = 99;
      for (const si of occupied) {
        const m = Math.min(...t.seats[si]!.hand);
        if (m < low) { low = m; t.turn = si; }
      }
      t.log.push(`${t.seats[t.turn]!.name} có ${cardLabel(low)}, đánh trước`);
    }
    scheduleTurn(t);
    pushTable(t);
    pushLobby();
  });

  handle<{ cards: number[] }>(socket, 'tl:play', ({ cards }) => {
    const t = getMyTable(uid);
    const idx = t.seats.findIndex((s) => s?.kind === 'human' && s.userId === uid);
    if (!Array.isArray(cards)) throw new GameError('Bài không hợp lệ');
    doPlay(t, idx, cards.map(Number));
  });

  handle(socket, 'tl:pass', () => {
    const t = getMyTable(uid);
    const idx = t.seats.findIndex((s) => s?.kind === 'human' && s.userId === uid);
    doPass(t, idx);
  });
}

/** Tóm tắt cho sảnh Khu giải trí. */
export function tlOverview() {
  const list = [...tables.values()];
  return {
    tables: list.length,
    playing: list.filter((t) => t.playing).length,
    players: list.reduce((n, t) => n + t.seats.filter((s) => s?.kind === 'human').length, 0),
  };
}
