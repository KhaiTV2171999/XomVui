import { randomInt } from 'node:crypto';
import type { Socket } from 'socket.io';
import type { Appearance } from '../../../shared/catalog';
import { addCoins, addXp, friendStatus, GameError, getProfile } from '../db';
import { getIo, handle, online, OnlinePlayer, pushMe, toast } from './online';
import { questBump } from './quests';

/*
 * Ma Sói — server giữ toàn bộ luật & bí mật; mỗi người chỉ nhận đúng phần thông tin vai mình được biết.
 * Vai: Sói (cắn ban đêm, biết đồng bọn, chat riêng), Tiên tri (soi 1 người/đêm), Bảo vệ (che 1 người/đêm,
 * không trùng 2 đêm liền), Dân làng. Vòng: Đêm → Ngày (thảo luận) → Bỏ phiếu treo cổ → … tới khi một phe thắng.
 */

export type Role = 'wolf' | 'seer' | 'guard' | 'villager';
type Phase = 'lobby' | 'night' | 'day' | 'vote' | 'end';

const NIGHT_MS = 25_000;
const DAY_MS = 50_000;
const VOTE_MS = 20_000;
const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;
const WIN_REWARD = 30;

const BOT_NAMES = ['Bác Ba', 'Cô Tư', 'Anh Sáu', 'Chị Bảy', 'Ông Năm', 'Bé Na', 'Cu Tí', 'Dì Út', 'Chú Tám', 'Thím Hai', 'Bé Bông'];
const BOT_LOOKS: Appearance[] = [
  { skin: 1, hair: 1, hairColor: 1, top: 'cl:hoodie_purple', bottom: 'cl:pants_black', hat: 'cl:cap_red', acc: null },
  { skin: 0, hair: 4, hairColor: 5, top: 'cl:stripe_mint', bottom: 'cl:shorts_khaki', hat: null, acc: 'cl:glasses_round' },
  { skin: 3, hair: 0, hairColor: 0, top: 'cl:jacket_denim', bottom: 'cl:pants_khaki', hat: 'cl:nonla', acc: null },
  { skin: 2, hair: 2, hairColor: 3, top: 'cl:tee_red', bottom: 'cl:pants_denim', hat: 'cl:beanie_green', acc: null },
  { skin: 4, hair: 3, hairColor: 2, top: 'cl:hoodie_yellow', bottom: 'cl:shorts_red', hat: null, acc: 'cl:scarf_red' },
  { skin: 1, hair: 5, hairColor: 6, top: 'cl:tee_pink', bottom: 'cl:pants_black', hat: 'cl:flower_crown', acc: null },
];

interface WP { id: number; name: string; appearance: Appearance; bot: boolean; role: Role | null; alive: boolean; left?: boolean }
interface Msg { from: number; name: string; text: string; kind: 'day' | 'wolf' | 'sys'; at: number }
interface Room {
  id: number;
  hostId: number;
  players: WP[];
  phase: Phase;
  day: number;
  endsAt: number;
  timer?: ReturnType<typeof setTimeout>;
  botTimers: ReturnType<typeof setTimeout>[];
  wolfVotes: Map<number, number>;
  seerPick: Map<number, number>;
  guardPick?: number;
  lastGuard?: number;
  seerResults: Map<number, { target: number; wolf: boolean; day: number }[]>;
  votes: Map<number, number>;
  /** Người thật đã bấm "bỏ phiếu sớm" trong ban ngày */
  ready: Set<number>;
  /** Người thật đang bật thoại (mic) trong làng */
  voice: Set<number>;
  chat: Msg[];
  winner?: 'wolf' | 'village';
  nextBot: number;
}

/**
 * Máy chủ STUN/TURN cho gọi thoại. Mặc định: STUN Google + TURN công cộng miễn phí (OpenRelay, có giới hạn).
 * Dùng TURN riêng: đặt biến môi trường TURN_URLS (cách nhau dấu phẩy), TURN_USER, TURN_PASS trên Render.
 */
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  process.env.TURN_URLS
    ? { urls: process.env.TURN_URLS.split(',').map((s) => s.trim()), username: process.env.TURN_USER ?? '', credential: process.env.TURN_PASS ?? '' }
    : { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];

const rooms = new Map<number, Room>();
const userRoom = new Map<number, number>();
let nextId = 1;
const LOBBY = 'ww:lobby';

// ------------------------------------------------------------ Hiển thị (riêng từng người)

function viewFor(r: Room, viewer: number) {
  const me = r.players.find((p) => p.id === viewer);
  const ended = r.phase === 'end';
  const iAmWolf = me?.role === 'wolf';
  const votesShown = r.phase === 'vote' || r.phase === 'end';
  const tally = new Map<number, number>();
  for (const t of r.votes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
  return {
    id: r.id, hostId: r.hostId, phase: r.phase, day: r.day, endsAt: r.endsAt, now: Date.now(), winner: r.winner ?? null,
    players: r.players.map((p) => ({
      id: p.id, name: p.name, appearance: p.appearance, bot: p.bot, alive: p.alive, left: !!p.left,
      // Vai chỉ lộ khi ván kết thúc (người chết cũng không lộ); Sói thấy đồng bọn; ai cũng thấy vai mình
      role: p.id === viewer || ended || (iAmWolf && p.role === 'wolf') ? p.role : null,
      votes: votesShown ? tally.get(p.id) ?? 0 : 0,
      votedFor: votesShown ? r.votes.get(p.id) ?? null : null,
      wolfPick: iAmWolf && p.role === 'wolf' ? r.wolfVotes.get(p.id) ?? null : null,
    })),
    ready: r.phase === 'day' ? [...r.ready] : [],
    voice: [...r.voice],
    me: me ? {
      role: me.role, alive: me.alive,
      action: r.phase === 'night' ? (me.role === 'wolf' ? r.wolfVotes.get(me.id) : me.role === 'seer' ? r.seerPick.get(me.id) : me.role === 'guard' ? r.guardPick : null) ?? null
        : r.phase === 'vote' ? r.votes.get(me.id) ?? null : null,
      lastGuard: me.role === 'guard' ? r.lastGuard ?? null : null,
      seer: r.seerResults.get(me.id) ?? [],
    } : null,
    chat: r.chat.filter((m) => m.kind !== 'wolf' || iAmWolf || ended).slice(-80),
  };
}

function push(r: Room) {
  for (const p of r.players) if (!p.bot && !p.left) online.get(p.id)?.socket.emit('ww:room', viewFor(r, p.id));
}
function lobbyList() {
  return [...rooms.values()].filter((r) => r.phase === 'lobby').map((r) => ({
    id: r.id, host: r.players.find((p) => p.id === r.hostId)?.name ?? '?', count: r.players.length, max: MAX_PLAYERS,
  }));
}
const pushLobby = () => getIo().to(LOBBY).emit('ww:lobby', lobbyList());
export function werewolfOverview() {
  return { playing: [...rooms.values()].filter((r) => r.phase !== 'lobby' && r.phase !== 'end').length, waiting: lobbyList().length };
}

function sys(r: Room, text: string) {
  r.chat.push({ from: 0, name: '', text, kind: 'sys', at: Date.now() });
}
const alive = (r: Room) => r.players.filter((p) => p.alive && !p.left);
const ROLE_NAME: Record<Role, string> = { wolf: '🐺 Sói', seer: '🔮 Tiên tri', guard: '🛡️ Bảo vệ', villager: '👨‍🌾 Dân làng' };

// ------------------------------------------------------------ Vòng chơi

function clearTimers(r: Room) {
  if (r.timer) clearTimeout(r.timer);
  r.botTimers.forEach(clearTimeout);
  r.botTimers = [];
}
function later(r: Room, ms: number, fn: () => void) {
  r.botTimers.push(setTimeout(() => { if (rooms.get(r.id) === r) fn(); }, ms));
}

function dealRoles(r: Room) {
  const n = r.players.length;
  const wolves = n <= 6 ? 1 : n <= 8 ? 2 : 3;
  const roles: Role[] = [...Array(wolves).fill('wolf'), 'seer', 'guard'];
  while (roles.length < n) roles.push('villager');
  for (let i = roles.length - 1; i > 0; i--) { const j = randomInt(i + 1); [roles[i], roles[j]] = [roles[j], roles[i]]; }
  r.players.forEach((p, i) => { p.role = roles[i]; p.alive = true; });
}

function startNight(r: Room) {
  clearTimers(r);
  r.phase = 'night';
  r.day += 1;
  r.endsAt = Date.now() + NIGHT_MS;
  r.wolfVotes.clear(); r.seerPick.clear(); r.guardPick = undefined; r.votes.clear();
  sys(r, `🌙 Đêm thứ ${r.day}. Màn đêm buông xuống, cả làng hãy nhắm mắt đi ngủ… Sói ơi, hãy thức dậy và chọn con mồi. Tiên tri, hãy soi một người. Bảo vệ, hãy chọn người để che chở.`);
  // Bot hành động
  for (const b of alive(r).filter((p) => p.bot)) {
    later(r, 3000 + randomInt(12000), () => {
      if (r.phase !== 'night' || !b.alive) return;
      const others = alive(r).filter((p) => p.id !== b.id);
      if (b.role === 'wolf') {
        const prey = others.filter((p) => p.role !== 'wolf');
        // theo đồng bọn nếu đã có người chọn
        const chosen = [...r.wolfVotes.values()][0];
        const t = chosen ?? prey[randomInt(prey.length)]?.id;
        if (t != null) r.wolfVotes.set(b.id, t);
      } else if (b.role === 'seer') {
        const known = new Set((r.seerResults.get(b.id) ?? []).map((x) => x.target));
        const pool = others.filter((p) => !known.has(p.id));
        const t = pool[randomInt(Math.max(1, pool.length))] ?? others[0];
        if (t) seerCheck(r, b, t.id);
      } else if (b.role === 'guard') {
        const pool = alive(r).filter((p) => p.id !== r.lastGuard);
        const t = pool[randomInt(pool.length)];
        if (t) r.guardPick = t.id;
      }
      push(r);
      maybeEndNightEarly(r);
    });
  }
  r.timer = setTimeout(() => endNight(r), NIGHT_MS);
  push(r);
}

function seerCheck(r: Room, seer: WP, target: number) {
  r.seerPick.set(seer.id, target);
  const t = r.players.find((p) => p.id === target)!;
  const list = r.seerResults.get(seer.id) ?? [];
  if (!list.some((x) => x.target === target && x.day === r.day)) list.push({ target, wolf: t.role === 'wolf', day: r.day });
  r.seerResults.set(seer.id, list);
}

/** Mọi vai đêm đã hành động xong → kết thúc đêm sớm cho đỡ chờ */
function maybeEndNightEarly(r: Room) {
  if (r.phase !== 'night') return;
  const a = alive(r);
  const wolvesDone = a.filter((p) => p.role === 'wolf').every((p) => r.wolfVotes.has(p.id));
  const seerDone = a.filter((p) => p.role === 'seer').every((p) => r.seerPick.has(p.id));
  const guardDone = !a.some((p) => p.role === 'guard') || r.guardPick != null;
  if (wolvesDone && seerDone && guardDone) {
    if (r.timer) clearTimeout(r.timer);
    r.timer = setTimeout(() => endNight(r), 2500);
  }
}

function endNight(r: Room) {
  if (r.phase !== 'night') return;
  // Nạn nhân: lựa chọn nhiều nhất của bầy sói (hoà thì bốc thăm); không ai chọn → bốc ngẫu nhiên
  const tally = new Map<number, number>();
  for (const t of r.wolfVotes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
  let victim: number | undefined;
  if (tally.size) {
    const max = Math.max(...tally.values());
    const top = [...tally].filter(([, c]) => c === max).map(([id]) => id);
    victim = top[randomInt(top.length)];
  } else {
    const prey = alive(r).filter((p) => p.role !== 'wolf');
    victim = prey[randomInt(Math.max(1, prey.length))]?.id;
  }
  r.lastGuard = r.guardPick;
  const v = r.players.find((p) => p.id === victim);
  if (v && v.alive && r.guardPick !== victim) {
    v.alive = false;
    sys(r, `☀️ Gà gáy, trời đã sáng. Cả làng thức dậy và phát hiện ${v.name} đã bị Sói cắn chết đêm qua… 💀`);
  } else {
    sys(r, '☀️ Gà gáy, trời đã sáng. Thật may mắn, đêm qua không ai bị Sói cắn! 🛡️');
  }
  if (checkWin(r)) return;
  startDay(r);
}

function startDay(r: Room) {
  clearTimers(r);
  r.phase = 'day';
  r.endsAt = Date.now() + DAY_MS;
  r.ready.clear();
  sys(r, '🗣️ Bây giờ cả làng hãy cùng thảo luận qua mic: ai trong số chúng ta là Sói? Lát nữa sẽ bỏ phiếu treo cổ.');
  // Người chơi thảo luận qua mic; khung bên phải chỉ dành cho lời dẫn của Quản trò
  r.timer = setTimeout(() => startVote(r), DAY_MS);
  push(r);
}

function startVote(r: Room) {
  clearTimers(r);
  r.phase = 'vote';
  r.endsAt = Date.now() + VOTE_MS;
  r.votes.clear();
  sys(r, '🗳️ Đã đến giờ bỏ phiếu! Hãy chạm vào người bạn nghi là Sói. Ai nhiều phiếu nhất sẽ bị treo cổ.');
  for (const b of alive(r).filter((p) => p.bot)) {
    later(r, 2500 + randomInt(VOTE_MS - 6000), () => {
      if (r.phase !== 'vote' || !b.alive) return;
      const others = alive(r).filter((p) => p.id !== b.id);
      let t: WP | undefined;
      const knownWolf = (r.seerResults.get(b.id) ?? []).find((x) => x.wolf && others.some((o) => o.id === x.target));
      if (knownWolf) t = others.find((o) => o.id === knownWolf.target);
      else {
        // theo số đông (nhưng sói không treo đồng bọn)
        const tally = new Map<number, number>();
        for (const v of r.votes.values()) tally.set(v, (tally.get(v) ?? 0) + 1);
        const ok = others.filter((o) => !(b.role === 'wolf' && o.role === 'wolf'));
        const lead = [...tally].sort((a, c) => c[1] - a[1]).find(([id]) => ok.some((o) => o.id === id));
        t = lead && Math.random() < 0.65 ? ok.find((o) => o.id === lead[0]) : ok[randomInt(Math.max(1, ok.length))];
      }
      if (t) r.votes.set(b.id, t.id);
      push(r);
      maybeEndVoteEarly(r);
    });
  }
  r.timer = setTimeout(() => endVote(r), VOTE_MS);
  push(r);
}

function maybeEndVoteEarly(r: Room) {
  if (r.phase !== 'vote') return;
  if (alive(r).every((p) => r.votes.has(p.id))) {
    if (r.timer) clearTimeout(r.timer);
    r.timer = setTimeout(() => endVote(r), 2000);
  }
}

function endVote(r: Room) {
  if (r.phase !== 'vote') return;
  const tally = new Map<number, number>();
  for (const t of r.votes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
  const max = tally.size ? Math.max(...tally.values()) : 0;
  const top = [...tally].filter(([, c]) => c === max).map(([id]) => id);
  if (max > 0 && top.length === 1) {
    const v = r.players.find((p) => p.id === top[0])!;
    v.alive = false;
    sys(r, `⚖️ Với ${max} phiếu, ${v.name} bị dân làng treo cổ. Vai của ${v.name} sẽ được tiết lộ khi ván kết thúc…`);
  } else {
    sys(r, max === 0 ? '⚖️ Không ai bỏ phiếu, hôm nay không ai bị treo cổ.' : '⚖️ Số phiếu bằng nhau, hôm nay không ai bị treo cổ.');
  }
  if (checkWin(r)) return;
  startNight(r);
}

function checkWin(r: Room) {
  const a = alive(r);
  const wolves = a.filter((p) => p.role === 'wolf').length;
  const others = a.length - wolves;
  if (wolves > 0 && wolves < others) return false;
  r.winner = wolves === 0 ? 'village' : 'wolf';
  endGame(r);
  return true;
}

function endGame(r: Room) {
  clearTimers(r);
  r.phase = 'end';
  r.endsAt = 0;
  sys(r, r.winner === 'village' ? '🎉 Dân làng chiến thắng! Tất cả Sói đã bị tiêu diệt, ngôi làng lại bình yên.' : '🐺 Bầy Sói chiến thắng! Ngôi làng đã rơi vào tay Sói.');
  sys(r, '🎭 Công bố vai: ' + r.players.map((p) => `${p.name} — ${ROLE_NAME[p.role!]}`).join(' · '));
  for (const p of r.players) {
    if (p.bot || p.left) continue;
    const won = (p.role === 'wolf') === (r.winner === 'wolf');
    if (won) {
      addCoins(p.id, WIN_REWARD).then(() => pushMe(p.id)).catch(() => {});
      addXp(p.id, 10).catch(() => {});
      toast(p.id, `🏆 Phe bạn thắng! +${WIN_REWARD} xu`, 'success');
    } else toast(p.id, 'Phe bạn thua rồi 😢', 'error');
  }
  push(r);
  pushLobby();
}

function backToLobby(r: Room) {
  clearTimers(r);
  r.players = r.players.filter((p) => !p.left);
  for (const p of r.players) { p.role = null; p.alive = true; }
  r.phase = 'lobby'; r.day = 0; r.endsAt = 0; r.winner = undefined;
  r.wolfVotes.clear(); r.seerPick.clear(); r.votes.clear(); r.seerResults.clear(); r.guardPick = undefined; r.lastGuard = undefined;
  r.chat = [];
  sys(r, '🏡 Phòng chờ — chủ phòng thêm bot hoặc chờ bạn bè rồi bắt đầu ván mới.');
  push(r);
  pushLobby();
}

function leave(uid: number) {
  const id = userRoom.get(uid);
  if (id == null) return;
  userRoom.delete(uid);
  const r = rooms.get(id);
  if (!r) return;
  const p = r.players.find((x) => x.id === uid);
  if (!p) return;
  r.voice.delete(uid);
  if (r.phase === 'lobby' || r.phase === 'end') r.players = r.players.filter((x) => x.id !== uid);
  else {
    p.left = true;
    if (p.alive) { p.alive = false; sys(r, `🚪 ${p.name} đã rời làng.`); }
  }
  const humans = r.players.filter((x) => !x.bot && !x.left);
  if (!humans.length) { clearTimers(r); rooms.delete(id); pushLobby(); return; }
  if (r.hostId === uid) r.hostId = humans[0].id;
  if (r.phase !== 'lobby' && r.phase !== 'end' && checkWin(r)) return;
  push(r);
  pushLobby();
}

export function onDisconnectWerewolf(uid: number) { leave(uid); }

// ------------------------------------------------------------ Lệnh từ người chơi

export function registerWerewolf(socket: Socket, p: OnlinePlayer) {
  const uid = p.userId;
  const myRoom = () => {
    const r = rooms.get(userRoom.get(uid) ?? -1);
    if (!r) throw new GameError('Bạn chưa vào phòng nào');
    return r;
  };

  handle(socket, 'ww:lobby', () => { socket.join(LOBBY); return { rooms: lobbyList() }; });
  handle(socket, 'ww:unlobby', () => { socket.leave(LOBBY); });

  handle(socket, 'ww:create', async () => {
    if (userRoom.has(uid)) throw new GameError('Bạn đang ở một phòng khác');
    const prof = await getProfile(uid);
    const r: Room = {
      id: nextId++, hostId: uid, phase: 'lobby', day: 0, endsAt: 0, botTimers: [], nextBot: -1,
      players: [{ id: uid, name: prof.name, appearance: prof.appearance, bot: false, role: null, alive: true }],
      wolfVotes: new Map(), seerPick: new Map(), seerResults: new Map(), votes: new Map(), ready: new Set(), voice: new Set(), chat: [],
    };
    sys(r, '🏡 Phòng chờ — mời bạn bè vào hoặc thêm bot (cần ít nhất 5 người).');
    rooms.set(r.id, r);
    userRoom.set(uid, r.id);
    push(r); pushLobby();
    return { id: r.id };
  });

  handle<{ id: number }>(socket, 'ww:join', async ({ id }) => {
    const r = rooms.get(Number(id));
    if (!r || r.phase !== 'lobby') throw new GameError('Phòng không còn nhận người');
    if (userRoom.has(uid)) throw new GameError('Bạn đang ở một phòng khác');
    if (r.players.length >= MAX_PLAYERS) throw new GameError('Phòng đã đủ người');
    const prof = await getProfile(uid);
    r.players.push({ id: uid, name: prof.name, appearance: prof.appearance, bot: false, role: null, alive: true });
    userRoom.set(uid, r.id);
    sys(r, `👋 ${prof.name} đã vào làng.`);
    push(r); pushLobby();
    return { id: r.id };
  });

  handle(socket, 'ww:leave', () => { leave(uid); });

  handle(socket, 'ww:addBot', () => {
    const r = myRoom();
    if (r.hostId !== uid || r.phase !== 'lobby') throw new GameError('Chỉ chủ phòng thêm bot khi đang chờ');
    if (r.players.length >= MAX_PLAYERS) throw new GameError('Phòng đã đủ người');
    const used = new Set(r.players.map((x) => x.name));
    const name = BOT_NAMES.find((n) => !used.has(`🤖 ${n}`)) ?? `Bot ${-r.nextBot}`;
    r.players.push({ id: r.nextBot--, name: `🤖 ${name}`, appearance: BOT_LOOKS[randomInt(BOT_LOOKS.length)], bot: true, role: null, alive: true });
    push(r); pushLobby();
  });

  handle<{ id: number }>(socket, 'ww:removeBot', ({ id }) => {
    const r = myRoom();
    if (r.hostId !== uid || r.phase !== 'lobby') throw new GameError('Chỉ chủ phòng bỏ bot khi đang chờ');
    r.players = r.players.filter((x) => !(x.bot && x.id === Number(id)));
    push(r); pushLobby();
  });

  handle(socket, 'ww:start', () => {
    const r = myRoom();
    if (r.hostId !== uid) throw new GameError('Chỉ chủ phòng bắt đầu được');
    if (r.phase === 'end') { backToLobby(r); return; }
    if (r.phase !== 'lobby') throw new GameError('Ván đang diễn ra');
    if (r.players.length < MIN_PLAYERS) throw new GameError(`Cần ít nhất ${MIN_PLAYERS} người (thêm bot nhé)`);
    r.chat = [];
    for (const pl of r.players) if (!pl.bot) questBump(pl.id, 'play');
    dealRoles(r);
    sys(r, '🎭 Chào mừng đến làng! Quản trò đã chia vai cho mọi người — hãy xem thẻ vai của mình và giữ bí mật nhé.');
    pushLobby();
    startNight(r);
  });

  // Hành động ban đêm theo vai
  handle<{ target: number }>(socket, 'ww:act', ({ target }) => {
    const r = myRoom();
    const me = r.players.find((x) => x.id === uid)!;
    const t = r.players.find((x) => x.id === Number(target));
    if (r.phase !== 'night') throw new GameError('Chỉ hành động được vào ban đêm');
    if (!me.alive) throw new GameError('Bạn đã chết');
    if (!t || !t.alive) throw new GameError('Người này không còn sống');
    if (me.role === 'wolf') {
      if (t.role === 'wolf') throw new GameError('Không cắn đồng bọn!');
      r.wolfVotes.set(uid, t.id);
    } else if (me.role === 'seer') {
      if (t.id === uid) throw new GameError('Không tự soi mình');
      if (r.seerPick.has(uid)) throw new GameError('Đêm nay bạn đã soi rồi');
      seerCheck(r, me, t.id);
    } else if (me.role === 'guard') {
      if (t.id === r.lastGuard) throw new GameError('Không bảo vệ cùng một người hai đêm liền');
      r.guardPick = t.id;
    } else throw new GameError('Dân làng ngủ ngon nhé 😴');
    push(r);
    maybeEndNightEarly(r);
  });

  handle<{ target: number }>(socket, 'ww:vote', ({ target }) => {
    const r = myRoom();
    const me = r.players.find((x) => x.id === uid)!;
    const t = r.players.find((x) => x.id === Number(target));
    if (r.phase !== 'vote') throw new GameError('Chưa tới giờ bỏ phiếu');
    if (!me.alive) throw new GameError('Người chết không được bỏ phiếu');
    if (!t || !t.alive || t.id === uid) throw new GameError('Không bỏ phiếu cho người này được');
    r.votes.set(uid, t.id);
    push(r);
    maybeEndVoteEarly(r);
  });

  // Ban ngày: mọi người thật còn sống đều sẵn sàng → bỏ phiếu luôn (chơi với bot đỡ phải chờ)
  handle(socket, 'ww:ready', () => {
    const r = myRoom();
    const me = r.players.find((x) => x.id === uid)!;
    if (r.phase !== 'day' || !me.alive) throw new GameError('Chỉ dùng được ban ngày');
    if (r.ready.has(uid)) r.ready.delete(uid); else r.ready.add(uid);
    const humans = alive(r).filter((x) => !x.bot);
    if (humans.length && humans.every((x) => r.ready.has(x.id))) {
      sys(r, '⏩ Mọi người đã sẵn sàng, chúng ta bỏ phiếu luôn!');
      if (r.timer) clearTimeout(r.timer);
      r.timer = setTimeout(() => { if (r.phase === 'day') startVote(r); }, 1500);
    }
    push(r);
  });

  // ---- Mời bạn bè vào làng (khi đang ở phòng chờ) ----
  const lastInvite = new Map<number, number>();
  handle<{ to: number }>(socket, 'ww:invite', async ({ to }) => {
    const r = myRoom();
    const other = Number(to);
    if (r.phase !== 'lobby') throw new GameError('Chỉ mời được khi làng đang chờ');
    if (r.players.length >= MAX_PLAYERS) throw new GameError('Làng đã đủ người');
    if (r.players.some((x) => x.id === other)) throw new GameError('Người này đã ở trong làng');
    if ((await friendStatus(uid, other)) !== 'accepted') throw new GameError('Chỉ mời được bạn bè');
    const target = online.get(other);
    if (!target) throw new GameError('Bạn ấy đang offline');
    if (Date.now() - (lastInvite.get(other) ?? 0) < 10_000) throw new GameError('Vừa mời rồi, chờ chút nhé');
    lastInvite.set(other, Date.now());
    target.socket.emit('ww:invite', { roomId: r.id, fromId: uid, fromName: p.name, count: r.players.length });
    return { ok: true };
  });

  // ---- Thoại (WebRTC): server chỉ chuyển tin bắt tay giữa các máy cùng làng ----
  handle(socket, 'ww:voice:join', () => {
    const r = myRoom();
    r.voice.add(uid);
    push(r);
    return { iceServers: ICE_SERVERS };
  });
  handle(socket, 'ww:voice:leave', () => {
    const r = rooms.get(userRoom.get(uid) ?? -1);
    if (r && r.voice.delete(uid)) push(r);
  });
  socket.on('ww:voice:signal', (msg: { to: number; data: unknown }) => {
    const r = rooms.get(userRoom.get(uid) ?? -1);
    const to = Number(msg?.to);
    if (!r || !r.voice.has(uid) || !r.voice.has(to)) return;
    online.get(to)?.socket.emit('ww:voice:signal', { from: uid, data: msg.data });
  });

  let lastChat = 0;
  handle<{ text: string }>(socket, 'ww:chat', ({ text }) => {
    const r = myRoom();
    const me = r.players.find((x) => x.id === uid)!;
    const t = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!t) return;
    if (Date.now() - lastChat < 600) throw new GameError('Từ từ thôi!');
    lastChat = Date.now();
    let kind: Msg['kind'] = 'day';
    if (r.phase === 'night') {
      if (me.role !== 'wolf' || !me.alive) throw new GameError('Ban đêm chỉ Sói được thì thầm với nhau 🤫');
      kind = 'wolf';
    } else if ((r.phase === 'day' || r.phase === 'vote') && !me.alive) {
      throw new GameError('Người đã chết không nói được 👻');
    }
    r.chat.push({ from: uid, name: me.name, text: t, kind, at: Date.now() });
    if (r.chat.length > 150) r.chat.splice(0, r.chat.length - 150);
    push(r);
  });
}

/**
 * Người cùng làng Ma Sói (để chat tại bàn). Đang chơi thì không cho chat chữ
 * (tránh lộ vai / sói bàn bạc công khai) — chỉ phòng chờ và lúc đã kết thúc.
 */
export function werewolfMates(uid: number): number[] | null | 'playing' {
  const id = userRoom.get(uid);
  const r = id != null ? rooms.get(id) : undefined;
  if (!r) return null;
  if (r.phase !== 'lobby' && r.phase !== 'end') return 'playing';
  return r.players.filter((p) => !p.bot && !p.left).map((p) => p.id);
}
